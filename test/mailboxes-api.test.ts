import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { handleFetch } from "../src/api";
import type { Env } from "../src/types";

const ADMIN_TOKEN = "test-admin-token-0123456789-abcdef";
const MAILBOXES_PATH = "/api/v1/integrations/gorelo/mailboxes";

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

function environment(db: D1Database, overrides: Partial<Env> = {}): Env {
  return {
    DB: db,
    ADMIN_API_TOKEN: ADMIN_TOKEN,
    DEFAULT_GORELO_ADDRESS: "tickets@gorelo.example",
    ALLOWED_FORWARD_DESTINATIONS:
      "tickets@gorelo.example,alerts@gorelo.example,ops@gorelo.example",
    ...overrides,
  };
}

function request(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Request {
  return new Request(`https://worker.example${path}`, {
    ...init,
    headers: {
      ...(authenticated ? { authorization: `Bearer ${ADMIN_TOKEN}` } : {}),
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

async function createMailbox(
  db: D1Database,
  input: { name: string; address: string; enabled?: boolean },
  overrides: Partial<Env> = {},
): Promise<Record<string, unknown>> {
  const response = await handleFetch(
    request(MAILBOXES_PATH, {
      method: "POST",
      body: JSON.stringify(input),
    }),
    environment(db, overrides),
  );
  expect(response.status).toBe(201);
  const body = (await response.json()) as {
    mailbox: Record<string, unknown>;
  };
  return body.mailbox;
}

async function createRoutingRule(
  db: D1Database,
  mailboxId: string,
  overrides: Partial<Env> = {},
): Promise<Response> {
  return handleFetch(
    request("/api/v1/rules", {
      method: "POST",
      body: JSON.stringify({
        name: "Route monitoring email",
        conditions: [
          {
            field: "from_domain",
            operator: "equals",
            value: "vendor.example",
          },
        ],
        action: { type: "forward", mailboxId },
      }),
    }),
    environment(db, overrides),
  );
}

afterEach(() => {
  while (databases.length > 0) databases.pop()!.close();
});

describe("Gorelo mailbox API", () => {
  it("requires authentication and bootstraps the configured default on GET", async () => {
    const db = database();
    const unauthenticated = await handleFetch(
      request(MAILBOXES_PATH, {}, false),
      environment(db),
    );
    expect(unauthenticated.status).toBe(401);

    const response = await handleFetch(
      request(MAILBOXES_PATH),
      environment(db),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      defaultMailboxId: "00000000-0000-4000-8000-000000000001",
      version: 1,
      mailboxes: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          name: "Default Gorelo mailbox",
          address: "tickets@gorelo.example",
          enabled: true,
          isDefault: true,
          allowlisted: true,
          routable: true,
          version: 1,
        },
      ],
    });

    const row = db
      .prepare("SELECT COUNT(*) AS count FROM gorelo_mailboxes")
      .first<{ count: number }>();
    await expect(row).resolves.toEqual({ count: 1 });
  });

  it("gates creation by the deployment allowlist and reports duplicates", async () => {
    const db = database();
    const denied = await handleFetch(
      request(MAILBOXES_PATH, {
        method: "POST",
        body: JSON.stringify({
          name: "Outside route",
          address: "outside@gorelo.example",
        }),
      }),
      environment(db),
    );
    expect(denied.status).toBe(400);
    await expect(denied.json()).resolves.toMatchObject({
      error: { title: expect.stringContaining("ALLOWED_FORWARD_DESTINATIONS") },
    });

    const created = await createMailbox(db, {
      name: "Alert intake",
      address: " Alerts@Gorelo.Example ",
    });
    expect(created).toMatchObject({
      name: "Alert intake",
      address: "alerts@gorelo.example",
      enabled: true,
      isDefault: false,
    });

    const duplicate = await handleFetch(
      request(MAILBOXES_PATH, {
        method: "POST",
        body: JSON.stringify({
          name: "alert INTAKE",
          address: "ops@gorelo.example",
        }),
      }),
      environment(db),
    );
    expect(duplicate.status).toBe(409);
  });

  it("renames destinations and guards default disable and deletion", async () => {
    const db = database();
    const defaultResponse = await handleFetch(
      request(MAILBOXES_PATH),
      environment(db),
    );
    const directory = (await defaultResponse.json()) as {
      defaultMailboxId: string;
    };
    const disableDefault = await handleFetch(
      request(`${MAILBOXES_PATH}/${directory.defaultMailboxId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: "Default Gorelo mailbox",
          enabled: false,
          version: 1,
        }),
      }),
      environment(db),
    );
    expect(disableDefault.status).toBe(409);

    const mailbox = await createMailbox(db, {
      name: "Alert intake",
      address: "alerts@gorelo.example",
    });
    const renamed = await handleFetch(
      request(`${MAILBOXES_PATH}/${String(mailbox.id)}`, {
        method: "PUT",
        body: JSON.stringify({
          name: "Priority alerts",
          enabled: true,
          version: mailbox.version,
        }),
      }),
      environment(db),
    );
    expect(renamed.status).toBe(200);
    await expect(renamed.json()).resolves.toMatchObject({
      mailbox: {
        id: mailbox.id,
        name: "Priority alerts",
        address: "alerts@gorelo.example",
        version: 2,
      },
    });

    const deleteDefault = await handleFetch(
      request(`${MAILBOXES_PATH}/${directory.defaultMailboxId}?version=1`, {
        method: "DELETE",
      }),
      environment(db),
    );
    expect(deleteDefault.status).toBe(409);
  });

  it("switches the default with the settings version and rejects stale changes", async () => {
    const db = database();
    await handleFetch(request(MAILBOXES_PATH), environment(db));
    const mailbox = await createMailbox(db, {
      name: "Alert intake",
      address: "alerts@gorelo.example",
    });

    const changed = await handleFetch(
      request(`${MAILBOXES_PATH}/default`, {
        method: "PUT",
        body: JSON.stringify({ mailboxId: mailbox.id, version: 1 }),
      }),
      environment(db),
    );
    expect(changed.status).toBe(200);
    await expect(changed.json()).resolves.toMatchObject({
      mailbox: { id: mailbox.id, isDefault: true },
      settings: { defaultMailboxId: mailbox.id, version: 2 },
    });

    const stale = await handleFetch(
      request(`${MAILBOXES_PATH}/default`, {
        method: "PUT",
        body: JSON.stringify({
          mailboxId: "00000000-0000-4000-8000-000000000001",
          version: 1,
        }),
      }),
      environment(db),
    );
    expect(stale.status).toBe(409);

    const deleteNewDefault = await handleFetch(
      request(`${MAILBOXES_PATH}/${String(mailbox.id)}?version=1`, {
        method: "DELETE",
      }),
      environment(db),
    );
    expect(deleteNewDefault.status).toBe(409);
  });

  it("accepts only registered, enabled, allowlisted mailbox rule targets", async () => {
    const db = database();
    await handleFetch(request(MAILBOXES_PATH), environment(db));
    const mailbox = await createMailbox(db, {
      name: "Alert intake",
      address: "alerts@gorelo.example",
    });
    const disabled = await createMailbox(db, {
      name: "Disabled intake",
      address: "ops@gorelo.example",
      enabled: false,
    });

    const accepted = await createRoutingRule(db, String(mailbox.id));
    expect(accepted.status).toBe(201);
    await expect(accepted.json()).resolves.toMatchObject({
      rule: {
        action: { type: "forward", mailboxId: mailbox.id },
      },
    });

    const unknown = await createRoutingRule(
      db,
      "11111111-1111-4111-8111-111111111111",
    );
    expect(unknown.status).toBe(400);

    const disabledRule = await createRoutingRule(db, String(disabled.id));
    expect(disabledRule.status).toBe(400);

    const noLongerAllowed = await createRoutingRule(db, String(mailbox.id), {
      ALLOWED_FORWARD_DESTINATIONS: "tickets@gorelo.example,ops@gorelo.example",
    });
    expect(noLongerAllowed.status).toBe(400);

    const disableReferenced = await handleFetch(
      request(`${MAILBOXES_PATH}/${String(mailbox.id)}`, {
        method: "PUT",
        body: JSON.stringify({
          name: mailbox.name,
          enabled: false,
          version: mailbox.version,
        }),
      }),
      environment(db),
    );
    expect(disableReferenced.status).toBe(409);
    const deleteReferenced = await handleFetch(
      request(
        `${MAILBOXES_PATH}/${String(mailbox.id)}?version=${String(mailbox.version)}`,
        { method: "DELETE" },
      ),
      environment(db),
    );
    expect(deleteReferenced.status).toBe(409);
  });
});
