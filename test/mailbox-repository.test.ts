import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  createGoreloMailbox,
  deleteGoreloMailbox,
  ensureInitialGoreloMailbox,
  getGoreloMailboxSettings,
  GoreloMailboxInvariantError,
  listGoreloMailboxes,
  loadGoreloMailboxDirectory,
  normalizeGoreloMailboxAddress,
  setDefaultGoreloMailbox,
  updateGoreloMailbox,
} from "../src/mailbox-repository";

class TestStatement {
  private bindings: unknown[] = [];

  constructor(private readonly statement: StatementSync) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.bindings = values;
    return this as unknown as D1PreparedStatement;
  }

  result(): D1Result {
    const result = this.statement.run(...(this.bindings as never[]));
    return {
      success: true,
      results: [],
      meta: { changes: Number(result.changes) },
    } as unknown as D1Result;
  }

  async run<T>(): Promise<D1Result<T>> {
    return this.result() as D1Result<T>;
  }

  async all<T>(): Promise<D1Result<T>> {
    return {
      success: true,
      results: this.statement.all(...(this.bindings as never[])) as T[],
      meta: { changes: 0 },
    } as unknown as D1Result<T>;
  }

  async first<T>(column?: string): Promise<T | null> {
    const row = this.statement.get(...(this.bindings as never[])) as
      Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }
}

class TestDatabase {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    this.sqlite.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
    this.sqlite.exec(
      readFileSync("migrations/0002_mailboxes_and_parser_samples.sql", "utf8"),
    );
  }

  prepare(query: string): D1PreparedStatement {
    return new TestStatement(
      this.sqlite.prepare(query),
    ) as unknown as D1PreparedStatement;
  }

  async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) =>
        (statement as unknown as TestStatement).result(),
      );
      this.sqlite.exec("COMMIT");
      return results as D1Result<T>[];
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.sqlite.close();
  }
}

const databases: TestDatabase[] = [];

function database(): D1Database {
  const db = new TestDatabase();
  databases.push(db);
  return db as unknown as D1Database;
}

async function addRuleReference(
  db: D1Database,
  mailboxId: string,
  enabled = false,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO rules
         (id, name, description, priority, enabled, match_mode,
          conditions_json, action_json, created_at, updated_at)
       VALUES (?, ?, '', 100, ?, 'all', ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      "Mailbox reference",
      enabled ? 1 : 0,
      JSON.stringify([
        {
          field: "to",
          operator: "contains",
          value: "@",
          caseSensitive: false,
        },
      ]),
      JSON.stringify({ type: "forward", mailboxId }),
      now,
      now,
    )
    .run();
}

afterEach(() => {
  while (databases.length > 0) databases.pop()!.close();
});

describe("Gorelo mailbox repository", () => {
  it("bootstraps one deterministic default and never rewrites it", async () => {
    const db = database();
    const first = await ensureInitialGoreloMailbox(
      db,
      " Tickets@Gorelo.Example ",
    );
    const second = await ensureInitialGoreloMailbox(
      db,
      "changed@gorelo.example",
      "Changed default",
    );

    expect(first).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      name: "Default Gorelo mailbox",
      address: "tickets@gorelo.example",
      enabled: true,
      isDefault: true,
      version: 1,
    });
    expect(second).toEqual(first);
    await expect(listGoreloMailboxes(db)).resolves.toEqual([first]);
    await expect(getGoreloMailboxSettings(db)).resolves.toMatchObject({
      defaultMailboxId: first.id,
      version: 1,
    });
  });

  it("requires a valid singleton state instead of guessing a default", async () => {
    const db = database();
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO gorelo_mailboxes
           (id, name, address, enabled, version, created_at, updated_at)
         VALUES (?, 'Orphaned', 'orphaned@gorelo.example', 1, 1, ?, ?)`,
      )
      .bind(crypto.randomUUID(), now, now)
      .run();

    await expect(
      ensureInitialGoreloMailbox(db, "tickets@gorelo.example"),
    ).rejects.toBeInstanceOf(GoreloMailboxInvariantError);
  });

  it("creates normalized immutable destinations with case-insensitive uniqueness", async () => {
    const db = database();
    await ensureInitialGoreloMailbox(db, "tickets@gorelo.example");
    const created = await createGoreloMailbox(db, {
      name: "  Alert intake  ",
      address: " Alerts@Gorelo.Example ",
      enabled: true,
    });
    expect(created).toMatchObject({
      name: "Alert intake",
      address: "alerts@gorelo.example",
      enabled: true,
      isDefault: false,
    });

    const attemptedAddressChange = {
      name: "Renamed intake",
      address: "replacement@gorelo.example",
      enabled: true,
    };
    const renamed = await updateGoreloMailbox(
      db,
      created.id,
      created.version,
      attemptedAddressChange,
    );
    expect(renamed).toMatchObject({
      status: "updated",
      mailbox: {
        name: "Renamed intake",
        address: "alerts@gorelo.example",
        version: 2,
      },
    });

    await expect(
      createGoreloMailbox(db, {
        name: "Another intake",
        address: "ALERTS@gorelo.example",
        enabled: true,
      }),
    ).rejects.toThrow();
    await expect(
      createGoreloMailbox(db, {
        name: "renamed INTAKE",
        address: "unique@gorelo.example",
        enabled: true,
      }),
    ).rejects.toThrow();
  });

  it("changes the default atomically with optimistic settings versions", async () => {
    const db = database();
    const initial = await ensureInitialGoreloMailbox(
      db,
      "tickets@gorelo.example",
    );
    const alerts = await createGoreloMailbox(db, {
      name: "Alert intake",
      address: "alerts@gorelo.example",
      enabled: true,
    });

    const changed = await setDefaultGoreloMailbox(db, alerts.id, 1);
    expect(changed).toMatchObject({
      status: "updated",
      mailbox: { id: alerts.id, isDefault: true },
      settings: { defaultMailboxId: alerts.id, version: 2 },
    });
    await expect(setDefaultGoreloMailbox(db, initial.id, 1)).resolves.toEqual({
      status: "conflict",
    });

    const listed = await listGoreloMailboxes(db);
    expect(listed.filter((mailbox) => mailbox.isDefault)).toEqual([
      expect.objectContaining({ id: alerts.id }),
    ]);
    await expect(
      updateGoreloMailbox(db, alerts.id, alerts.version, {
        name: alerts.name,
        enabled: false,
      }),
    ).resolves.toEqual({ status: "default" });
    await expect(
      deleteGoreloMailbox(db, alerts.id, alerts.version),
    ).resolves.toBe("default");
  });

  it("does not make a disabled mailbox the default", async () => {
    const db = database();
    await ensureInitialGoreloMailbox(db, "tickets@gorelo.example");
    const disabled = await createGoreloMailbox(db, {
      name: "Disabled intake",
      address: "disabled@gorelo.example",
      enabled: false,
    });

    await expect(setDefaultGoreloMailbox(db, disabled.id, 1)).resolves.toEqual({
      status: "disabled",
    });
  });

  it("protects every rule reference while allowing safe metadata updates", async () => {
    const db = database();
    await ensureInitialGoreloMailbox(db, "tickets@gorelo.example");
    const mailbox = await createGoreloMailbox(db, {
      name: "Monitoring intake",
      address: "monitoring@gorelo.example",
      enabled: true,
    });
    await addRuleReference(db, mailbox.id);

    const renamed = await updateGoreloMailbox(db, mailbox.id, 1, {
      name: "Renamed monitoring intake",
      enabled: true,
    });
    expect(renamed).toMatchObject({
      status: "updated",
      mailbox: { version: 2 },
    });
    await expect(
      updateGoreloMailbox(db, mailbox.id, 2, {
        name: "Renamed monitoring intake",
        enabled: false,
      }),
    ).resolves.toEqual({ status: "referenced" });
    await expect(deleteGoreloMailbox(db, mailbox.id, 2)).resolves.toBe(
      "referenced",
    );
  });

  it("enforces mailbox identity, default, and rule-reference invariants in D1", async () => {
    const db = database();
    const initial = await ensureInitialGoreloMailbox(
      db,
      "tickets@gorelo.example",
    );
    const referenced = await createGoreloMailbox(db, {
      name: "Referenced intake",
      address: "referenced@gorelo.example",
      enabled: true,
    });
    const disabled = await createGoreloMailbox(db, {
      name: "Disabled intake",
      address: "disabled@gorelo.example",
      enabled: false,
    });
    await addRuleReference(db, referenced.id);

    await expect(
      db
        .prepare("UPDATE gorelo_mailboxes SET enabled = 0 WHERE id = ?")
        .bind(referenced.id)
        .run(),
    ).rejects.toThrow("referenced Gorelo mailbox cannot be disabled");
    await expect(
      db
        .prepare("DELETE FROM gorelo_mailboxes WHERE id = ?")
        .bind(referenced.id)
        .run(),
    ).rejects.toThrow("referenced Gorelo mailbox cannot be deleted");
    await expect(
      db
        .prepare("UPDATE gorelo_mailboxes SET address = ? WHERE id = ?")
        .bind("replacement@gorelo.example", referenced.id)
        .run(),
    ).rejects.toThrow("identity and address are immutable");
    await expect(
      db
        .prepare(
          `INSERT OR REPLACE INTO gorelo_mailboxes
             (id, name, address, enabled, version, created_at, updated_at)
           VALUES (?, ?, ?, 0, 1, ?, ?)`,
        )
        .bind(
          referenced.id,
          "Replacement intake",
          "replacement@gorelo.example",
          new Date().toISOString(),
          new Date().toISOString(),
        )
        .run(),
    ).rejects.toThrow("Gorelo mailboxes cannot be replaced");
    const other = await createGoreloMailbox(db, {
      name: "Other intake",
      address: "other@gorelo.example",
      enabled: true,
    });
    await expect(
      db
        .prepare("UPDATE OR REPLACE gorelo_mailboxes SET name = ? WHERE id = ?")
        .bind(referenced.name, other.id)
        .run(),
    ).rejects.toThrow("mailbox names cannot replace another mailbox");
    await expect(
      db
        .prepare("UPDATE gorelo_mailboxes SET enabled = 0 WHERE id = ?")
        .bind(initial.id)
        .run(),
    ).rejects.toThrow("referenced Gorelo mailbox cannot be disabled");
    await expect(
      db
        .prepare(
          "UPDATE gorelo_mailbox_settings SET default_mailbox_id = ? WHERE id = 1",
        )
        .bind(disabled.id)
        .run(),
    ).rejects.toThrow("default Gorelo mailbox must be enabled");
    await expect(
      db.prepare("DELETE FROM gorelo_mailbox_settings WHERE id = 1").run(),
    ).rejects.toThrow("Gorelo mailbox settings cannot be deleted");
    await expect(
      db
        .prepare(
          `INSERT OR REPLACE INTO gorelo_mailbox_settings
             (id, default_mailbox_id, version, updated_at)
           VALUES (1, ?, 99, ?)`,
        )
        .bind(referenced.id, new Date().toISOString())
        .run(),
    ).rejects.toThrow("Gorelo mailbox settings cannot be replaced");
  });

  it("reports stale mailbox versions before mutation", async () => {
    const db = database();
    await ensureInitialGoreloMailbox(db, "tickets@gorelo.example");
    const mailbox = await createGoreloMailbox(db, {
      name: "Monitoring intake",
      address: "monitoring@gorelo.example",
      enabled: true,
    });

    await expect(
      updateGoreloMailbox(db, mailbox.id, 9, {
        name: "Changed",
        enabled: true,
      }),
    ).resolves.toEqual({ status: "conflict" });
    await expect(deleteGoreloMailbox(db, mailbox.id, 9)).resolves.toBe(
      "conflict",
    );
  });

  it("loads an ID-indexed directory with exact-address and exact-domain posture", async () => {
    const db = database();
    const alerts = await ensureInitialGoreloMailbox(
      db,
      "alerts@gorelo.example",
      "Alerts",
    );
    const tickets = await createGoreloMailbox(db, {
      name: "Tickets",
      address: "tickets@gorelo.example",
      enabled: true,
    });
    const disabled = await createGoreloMailbox(db, {
      name: "Retired",
      address: "retired@gorelo.example",
      enabled: false,
    });
    const outside = await createGoreloMailbox(db, {
      name: "Outside",
      address: "outside@other.example",
      enabled: true,
    });

    const directory = await loadGoreloMailboxDirectory(db, {
      allowedAddresses: new Set(["retired@gorelo.example"]),
      allowedDomains: new Set(["GORELO.EXAMPLE"]),
    });
    expect(directory.defaultMailbox).toMatchObject({
      id: alerts.id,
      allowlisted: true,
      routable: true,
    });
    expect(directory.byId.get(tickets.id)).toMatchObject({
      allowlisted: true,
      routable: true,
    });
    expect(directory.byId.get(disabled.id)).toMatchObject({
      allowlisted: true,
      routable: false,
    });
    expect(directory.byId.get(outside.id)).toMatchObject({
      allowlisted: false,
      routable: false,
    });
    expect(directory.settings).toMatchObject({
      defaultMailboxId: alerts.id,
      version: 1,
    });
  });

  it("validates addresses before persistence or policy indexing", () => {
    expect(normalizeGoreloMailboxAddress(" Mail@Example.COM ")).toBe(
      "mail@example.com",
    );
    expect(() => normalizeGoreloMailboxAddress("not-an-email")).toThrow(
      "valid email address",
    );
  });
});
