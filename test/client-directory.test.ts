import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  ClientAliasCanonicalConflictError,
  ClientAliasConflictError,
  createClientAlias,
  createClientAliases,
  deleteClientAlias,
  importGoreloClients,
  listGoreloClients,
  normalizeClientIdentity,
  resolveClientIdentity,
  searchGoreloClients,
  updateClientAlias,
} from "../src/client-directory";
import type { GoreloClientCatalogItem } from "../src/gorelo";

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
    this.sqlite.exec(
      readFileSync("migrations/0003_parser_captures.sql", "utf8"),
    );
    this.sqlite.exec(
      readFileSync("migrations/0004_inbound_webhooks.sql", "utf8"),
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

function database(): { db: D1Database; sqlite: DatabaseSync } {
  const testDatabase = new TestDatabase();
  databases.push(testDatabase);
  return {
    db: testDatabase as unknown as D1Database,
    sqlite: testDatabase.sqlite,
  };
}

afterEach(() => {
  while (databases.length > 0) databases.pop()!.close();
});

function client(
  id: number,
  name: string,
  overrides: Partial<GoreloClientCatalogItem> = {},
): GoreloClientCatalogItem {
  return {
    id,
    name,
    billingName: null,
    alternateName: null,
    status: "Active",
    isDefault: false,
    domains: [],
    ...overrides,
  };
}

describe("Gorelo client directory", () => {
  it("atomically imports clients and retains missing clients as stale", async () => {
    const { db } = database();
    await expect(
      importGoreloClients(
        db,
        [
          client(1, "Acme MSP", {
            billingName: "Acme Billing",
            domains: ["ACME.EXAMPLE", "acme.example"],
            isDefault: true,
          }),
          client(2, "Beta Co"),
        ],
        { syncedAt: new Date("2026-08-09T00:00:00.000Z") },
      ),
    ).resolves.toMatchObject({
      importedCount: 2,
      createdCount: 2,
      updatedCount: 0,
    });

    await expect(
      importGoreloClients(db, [client(1, "Acme Managed Services")], {
        syncedAt: new Date("2026-08-09T01:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      importedCount: 1,
      createdCount: 0,
      updatedCount: 1,
    });
    const page = await listGoreloClients(db);
    expect(page.sync).toEqual({
      totalClients: 2,
      currentClients: 1,
      staleClients: 1,
      lastSyncedAt: "2026-08-09T01:00:00.000Z",
    });
    expect(page.items).toEqual([
      expect.objectContaining({
        id: 1,
        name: "Acme Managed Services",
        domains: [],
        importedAt: "2026-08-09T00:00:00.000Z",
        lastSeenAt: "2026-08-09T01:00:00.000Z",
        stale: false,
      }),
      expect.objectContaining({ id: 2, name: "Beta Co", stale: true }),
    ]);
  });

  it("records an empty successful sync and marks retained clients stale", async () => {
    const { db } = database();
    await importGoreloClients(db, [client(1, "Acme")], {
      syncedAt: new Date("2026-08-09T00:00:00.000Z"),
    });
    await createClientAlias(db, { clientId: 1, alias: "Acme North" });
    const result = await importGoreloClients(db, [], {
      syncedAt: new Date("2026-08-09T01:00:00.000Z"),
    });
    expect(result).toMatchObject({
      importedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      sync: {
        totalClients: 1,
        currentClients: 0,
        staleClients: 1,
        lastSyncedAt: "2026-08-09T01:00:00.000Z",
      },
    });
    await expect(listGoreloClients(db)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: 1, stale: true })],
    });
    await expect(resolveClientIdentity(db, "Acme North")).resolves.toEqual({
      status: "not_found",
      normalizedIdentity: "acme north",
      reason: "stale_alias",
      aliasScope: "global",
    });
    await expect(resolveClientIdentity(db, "Acme")).resolves.toEqual({
      status: "not_found",
      normalizedIdentity: "acme",
    });
  });

  it("does not let an older completed import roll back a newer snapshot", async () => {
    const { db } = database();
    await importGoreloClients(
      db,
      [client(1, "Current Acme"), client(2, "Current Beta")],
      { syncedAt: new Date("2026-08-09T02:00:00.000Z") },
    );

    const staleCompletion = await importGoreloClients(
      db,
      [client(1, "Outdated Acme")],
      { syncedAt: new Date("2026-08-09T01:00:00.000Z") },
    );

    expect(staleCompletion).toEqual({
      importedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      syncedAt: "2026-08-09T02:00:00.000Z",
      sync: {
        totalClients: 2,
        currentClients: 2,
        staleClients: 0,
        lastSyncedAt: "2026-08-09T02:00:00.000Z",
      },
    });
    await expect(listGoreloClients(db)).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          id: 1,
          name: "Current Acme",
          lastSeenAt: "2026-08-09T02:00:00.000Z",
          stale: false,
        }),
        expect.objectContaining({
          id: 2,
          name: "Current Beta",
          lastSeenAt: "2026-08-09T02:00:00.000Z",
          stale: false,
        }),
      ],
    });
  });

  it("serializes equal sync markers instead of merging complete snapshots", async () => {
    const { db } = database();
    const marker = new Date("2026-08-09T02:00:00.000Z");
    await importGoreloClients(db, [client(1, "First snapshot")], {
      syncedAt: marker,
    });

    const duplicateMarker = await importGoreloClients(
      db,
      [client(2, "Conflicting snapshot")],
      { syncedAt: marker },
    );

    expect(duplicateMarker).toMatchObject({
      importedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      syncedAt: marker.toISOString(),
      sync: {
        totalClients: 1,
        currentClients: 1,
        staleClients: 0,
      },
    });
    const page = await listGoreloClients(db);
    expect(page.items).toEqual([
      expect.objectContaining({ id: 1, name: "First snapshot", stale: false }),
    ]);
  });

  it("validates the complete import before writing any rows", async () => {
    const { db } = database();
    await importGoreloClients(db, [client(1, "Original")], {
      syncedAt: new Date("2026-08-09T00:00:00.000Z"),
    });

    await expect(
      importGoreloClients(
        db,
        [client(1, "Should not persist"), client(2, "")],
        { syncedAt: new Date("2026-08-09T01:00:00.000Z") },
      ),
    ).rejects.toThrow("must not be empty");
    await expect(
      importGoreloClients(db, [client(1, "One"), client(1, "Duplicate")]),
    ).rejects.toThrow("duplicate client ID 1");

    const page = await listGoreloClients(db);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: 1,
      name: "Original",
      lastSeenAt: "2026-08-09T00:00:00.000Z",
    });
  });

  it("normalizes aliases, searches them, and rejects scoped conflicts", async () => {
    const { db } = database();
    await importGoreloClients(db, [client(1, "Acme"), client(2, "Beta")]);
    const alias = await createClientAlias(db, {
      clientId: 1,
      alias: "  Ｎorth   Region  ",
      now: new Date("2026-08-09T00:00:00.000Z"),
    });
    expect(alias).toMatchObject({
      alias: "North Region",
      normalizedAlias: "north region",
      scope: "global",
      version: 1,
    });
    expect(normalizeClientIdentity(" ＮORTH\u00a0REGION ")).toBe(
      "north region",
    );
    await expect(
      createClientAlias(db, {
        clientId: 2,
        alias: "north region",
        scope: "GLOBAL",
      }),
    ).rejects.toBeInstanceOf(ClientAliasConflictError);
    await expect(
      createClientAlias(db, {
        clientId: 2,
        alias: "north region",
        scope: "vendor-a",
      }),
    ).resolves.toMatchObject({ clientId: 2, scope: "vendor-a" });

    const search = await searchGoreloClients(db, "NORTH");
    expect(search.items.map((item) => item.id)).toEqual([1, 2]);
    expect(search.items[0]?.aliases).toHaveLength(1);
    expect(() => normalizeClientIdentity("bad\nvalue")).toThrow(
      "control characters",
    );
  });

  it("paginates complete clients without splitting their alias groups", async () => {
    const { db } = database();
    await importGoreloClients(
      db,
      Array.from({ length: 600 }, (_, index) =>
        client(index + 1, `Client ${String(index + 1).padStart(4, "0")}`),
      ),
    );
    await createClientAliases(db, {
      clientId: 600,
      aliases: [{ alias: "Last customer" }, { alias: "Tenant 0600" }],
    });

    const first = await listGoreloClients(db, { limit: 500 });
    const second = await listGoreloClients(db, { limit: 500, offset: 500 });
    expect(first).toMatchObject({ total: 600, limit: 500, offset: 0 });
    expect(first.items).toHaveLength(500);
    expect(second).toMatchObject({ total: 600, limit: 500, offset: 500 });
    expect(second.items).toHaveLength(100);
    expect(second.items.at(-1)).toMatchObject({
      id: 600,
      aliases: [
        expect.objectContaining({ alias: "Last customer" }),
        expect.objectContaining({ alias: "Tenant 0600" }),
      ],
    });
  });

  it("creates multiple aliases for one client atomically", async () => {
    const { db } = database();
    await importGoreloClients(db, [client(1, "Acme")]);

    const aliases = await createClientAliases(db, {
      clientId: 1,
      aliases: [
        { alias: "Acme North" },
        { alias: "ACME Services" },
        { alias: "Tenant 0042", scope: "vendor-a" },
      ],
      now: new Date("2026-08-09T01:00:00.000Z"),
    });

    expect(aliases).toHaveLength(3);
    expect(
      aliases.map(({ alias, scope, version }) => ({
        alias,
        scope,
        version,
      })),
    ).toEqual([
      { alias: "Acme North", scope: "global", version: 1 },
      { alias: "ACME Services", scope: "global", version: 1 },
      { alias: "Tenant 0042", scope: "vendor-a", version: 1 },
    ]);
    await expect(
      resolveClientIdentity(db, "acme services"),
    ).resolves.toMatchObject({
      status: "resolved",
      client: { id: 1 },
      matchedBy: "global_alias",
    });
    await expect(
      resolveClientIdentity(db, "tenant 0042", { scope: "vendor-a" }),
    ).resolves.toMatchObject({
      status: "resolved",
      client: { id: 1 },
      matchedBy: "scoped_alias",
    });
  });

  it("creates none of a batch when an existing or normalized duplicate conflicts", async () => {
    const { db } = database();
    await importGoreloClients(db, [client(1, "Acme")]);
    await createClientAlias(db, { clientId: 1, alias: "Already assigned" });

    await expect(
      createClientAliases(db, {
        clientId: 1,
        aliases: [
          { alias: "Would otherwise work" },
          { alias: "ALREADY ASSIGNED" },
        ],
      }),
    ).rejects.toMatchObject({
      name: "ClientAliasConflictError",
      scope: "global",
      normalizedAlias: "already assigned",
    });
    await expect(
      searchGoreloClients(db, "would otherwise work"),
    ).resolves.toMatchObject({ total: 0, items: [] });

    await expect(
      createClientAliases(db, {
        clientId: 1,
        aliases: [
          { alias: "Ｎorth  Site", scope: "Vendor-A" },
          { alias: "north site", scope: "vendor-a" },
        ],
      }),
    ).rejects.toBeInstanceOf(ClientAliasConflictError);
    await expect(searchGoreloClients(db, "north site")).resolves.toMatchObject({
      total: 0,
      items: [],
    });
  });

  it("rejects aliases that match another current client's exact identity", async () => {
    const { db } = database();
    await importGoreloClients(db, [
      client(1, "Acme"),
      client(2, "Beta", {
        billingName: "Beta Billing",
        domains: ["beta.example"],
      }),
    ]);

    await expect(
      createClientAlias(db, { clientId: 1, alias: "Beta" }),
    ).rejects.toBeInstanceOf(ClientAliasCanonicalConflictError);
    await expect(
      createClientAlias(db, {
        clientId: 1,
        alias: "BETA.EXAMPLE",
        scope: "vendor-a",
      }),
    ).rejects.toBeInstanceOf(ClientAliasCanonicalConflictError);

    const alias = await createClientAlias(db, {
      clientId: 1,
      alias: "Safe source name",
    });
    await expect(
      updateClientAlias(db, alias.id, alias.version, {
        alias: "Beta Billing",
        scope: "vendor-a",
      }),
    ).rejects.toBeInstanceOf(ClientAliasCanonicalConflictError);
    await expect(
      searchGoreloClients(db, "Safe source name"),
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          id: 1,
          aliases: [expect.objectContaining({ version: 1 })],
        }),
      ],
    });
  });

  it("updates and deletes aliases with optimistic concurrency", async () => {
    const { db } = database();
    await importGoreloClients(db, [client(1, "Acme")]);
    const alias = await createClientAlias(db, {
      clientId: 1,
      alias: "Old name",
    });

    await expect(
      updateClientAlias(db, alias.id, 9, { alias: "New name" }),
    ).resolves.toMatchObject({
      status: "conflict",
      current: { alias: "Old name", version: 1 },
    });
    const updated = await updateClientAlias(db, alias.id, 1, {
      alias: "New name",
      scope: "Parser One",
      now: new Date("2026-08-09T01:00:00.000Z"),
    });
    expect(updated).toMatchObject({
      status: "updated",
      alias: {
        alias: "New name",
        normalizedAlias: "new name",
        scope: "parser one",
        version: 2,
      },
    });
    await expect(deleteClientAlias(db, alias.id, 1)).resolves.toMatchObject({
      status: "conflict",
      current: { version: 2 },
    });
    await expect(deleteClientAlias(db, alias.id, 2)).resolves.toEqual({
      status: "deleted",
    });
    await expect(deleteClientAlias(db, alias.id, 2)).resolves.toEqual({
      status: "not_found",
    });
  });

  it("resolves scoped and global aliases before exact catalog identities", async () => {
    const { db } = database();
    await importGoreloClients(db, [
      client(1, "Alpha", {
        billingName: "Shared Billing",
        alternateName: "Alpha Trading",
        domains: ["alpha.example"],
      }),
      client(2, "Beta", {
        billingName: "Shared Billing",
        domains: ["beta.example"],
      }),
    ]);
    await createClientAlias(db, {
      clientId: 1,
      alias: "Customer One",
    });
    await createClientAlias(db, {
      clientId: 2,
      alias: "Customer One",
      scope: "vendor-a",
    });

    await expect(
      resolveClientIdentity(db, "customer one", { scope: "vendor-a" }),
    ).resolves.toMatchObject({
      status: "resolved",
      client: { id: 2 },
      matchedBy: "scoped_alias",
      aliasScope: "vendor-a",
    });
    await expect(
      resolveClientIdentity(db, "customer one", { scope: "vendor-b" }),
    ).resolves.toMatchObject({
      status: "resolved",
      client: { id: 1 },
      matchedBy: "global_alias",
    });
    await expect(
      resolveClientIdentity(db, "BETA.EXAMPLE"),
    ).resolves.toMatchObject({
      status: "resolved",
      client: { id: 2 },
      matchedBy: "domain",
    });
    await expect(
      resolveClientIdentity(db, "Shared Billing"),
    ).resolves.toMatchObject({
      status: "ambiguous",
      candidates: [{ clientId: 1 }, { clientId: 2 }],
    });
    await expect(resolveClientIdentity(db, "Alph")).resolves.toEqual({
      status: "not_found",
      normalizedIdentity: "alph",
    });
  });

  it("stops at stale scoped and global aliases without falling through", async () => {
    const { db } = database();
    await importGoreloClients(
      db,
      [client(1, "Retired customer"), client(2, "Initial current name")],
      { syncedAt: new Date("2026-08-09T00:00:00.000Z") },
    );
    await createClientAlias(db, {
      clientId: 1,
      alias: "Shared Source",
      scope: "vendor-a",
    });
    await createClientAlias(db, {
      clientId: 1,
      alias: "Current Catalog Name",
    });
    await createClientAlias(db, {
      clientId: 2,
      alias: "Shared Source",
    });

    await importGoreloClients(db, [client(2, "Current Catalog Name")], {
      syncedAt: new Date("2026-08-09T01:00:00.000Z"),
    });

    await expect(
      resolveClientIdentity(db, "Shared Source", { scope: "vendor-a" }),
    ).resolves.toEqual({
      status: "not_found",
      normalizedIdentity: "shared source",
      reason: "stale_alias",
      aliasScope: "vendor-a",
    });
    await expect(
      resolveClientIdentity(db, "Current Catalog Name"),
    ).resolves.toEqual({
      status: "not_found",
      normalizedIdentity: "current catalog name",
      reason: "stale_alias",
      aliasScope: "global",
    });
  });

  it("fails closed when an import creates scoped and global canonical collisions", async () => {
    const { db } = database();
    await importGoreloClients(
      db,
      [client(1, "Mapped customer"), client(2, "Initial current name")],
      { syncedAt: new Date("2026-08-09T00:00:00.000Z") },
    );
    await createClientAlias(db, {
      clientId: 1,
      alias: "Future Name",
    });
    await createClientAlias(db, {
      clientId: 1,
      alias: "Future Billing",
      scope: "vendor-a",
    });

    await importGoreloClients(
      db,
      [
        client(1, "Mapped customer"),
        client(2, "Future Name", { billingName: "Future Billing" }),
      ],
      { syncedAt: new Date("2026-08-09T01:00:00.000Z") },
    );

    await expect(resolveClientIdentity(db, "Future Name")).resolves.toEqual({
      status: "ambiguous",
      normalizedIdentity: "future name",
      candidates: [
        {
          clientId: 1,
          clientName: "Mapped customer",
          matchedBy: "global_alias",
        },
        { clientId: 2, clientName: "Future Name", matchedBy: "name" },
      ],
    });
    await expect(
      resolveClientIdentity(db, "Future Billing", { scope: "vendor-a" }),
    ).resolves.toEqual({
      status: "ambiguous",
      normalizedIdentity: "future billing",
      candidates: [
        {
          clientId: 1,
          clientName: "Mapped customer",
          matchedBy: "scoped_alias",
        },
        {
          clientId: 2,
          clientName: "Future Name",
          matchedBy: "billing_name",
        },
      ],
    });
  });

  it("cascades aliases when an imported client is explicitly removed", async () => {
    const { db, sqlite } = database();
    await importGoreloClients(db, [client(1, "Acme")]);
    await createClientAlias(db, { clientId: 1, alias: "Acme AU" });
    sqlite.prepare("DELETE FROM gorelo_clients WHERE id = 1").run();
    const count = sqlite
      .prepare("SELECT COUNT(*) AS count FROM client_aliases")
      .get() as { count: number };
    expect(Number(count.count)).toBe(0);
  });
});
