import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleFetch } from "../src/api";
import type { Env } from "../src/types";

const ADMIN_TOKEN = "test-admin-token-0123456789-abcdef";
const GORELO_KEY = "test-gorelo-key-not-a-real-secret";
const WEBHOOK_SECRET = "test-webhook-signing-secret-0123456789abcdef";

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

function environment(overrides: Partial<Env> = {}): Env {
  const database = new TestDatabase();
  databases.push(database);
  return {
    DB: database as unknown as D1Database,
    ADMIN_API_TOKEN: ADMIN_TOKEN,
    DEFAULT_GORELO_ADDRESS: "tickets@gorelo.example",
    ...overrides,
  };
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`https://worker.example${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${ADMIN_TOKEN}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  while (databases.length > 0) databases.pop()!.close();
});

describe("Gorelo client directory API", () => {
  it("imports clients, manages aliases, and exposes exact resolution", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: [
          {
            id: 42,
            name: "Acme Managed Services",
            billingName: "Acme Billing",
            alternateName: null,
            status: { id: 1, name: "Active" },
            isDefault: true,
            domains: [{ id: 1, name: "ACME.EXAMPLE" }],
          },
        ],
        totalCount: 1,
        nextCursor: null,
        previousCursor: null,
        hasMore: false,
        hasPrevious: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const env = environment({ GORELO_API_KEY: GORELO_KEY });

    const imported = await handleFetch(
      request("/api/v1/integrations/gorelo/clients/import", {
        method: "POST",
      }),
      env,
    );
    expect(imported.status).toBe(200);
    await expect(imported.json()).resolves.toMatchObject({
      import: { created: 1, updated: 0, total: 1 },
    });
    expect(fetchMock).toHaveBeenCalledOnce();

    const created = await handleFetch(
      request("/api/v1/integrations/gorelo/client-aliases", {
        method: "POST",
        body: JSON.stringify({
          clientId: 42,
          alias: "  ACME North  ",
          scope: "global",
        }),
      }),
      env,
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      alias: { id: string; version: number };
    };

    const directory = await handleFetch(
      request("/api/v1/integrations/gorelo/clients?limit=100"),
      env,
    );
    await expect(directory.json()).resolves.toMatchObject({
      total: 1,
      clients: [
        {
          id: 42,
          name: "Acme Managed Services",
          domains: ["acme.example"],
          aliases: [{ alias: "ACME North", scope: "global", version: 1 }],
        },
      ],
    });

    const resolution = await handleFetch(
      request(
        "/api/v1/integrations/gorelo/client-resolution?identity=acme%20north",
      ),
      env,
    );
    await expect(resolution.json()).resolves.toMatchObject({
      resolution: {
        status: "resolved",
        matchedBy: "global_alias",
        client: { id: 42 },
      },
    });

    const removed = await handleFetch(
      request(
        `/api/v1/integrations/gorelo/client-aliases/${createdBody.alias.id}?version=${String(createdBody.alias.version)}`,
        { method: "DELETE" },
      ),
      env,
    );
    expect(removed.status).toBe(204);
  });

  it("imports official Gorelo clients with blank optional metadata", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        StatusCode: 200,
        IsSuccess: true,
        Data: [
          {
            Id: 42,
            Name: "Acme Managed Services",
            BillingName: "",
            AlternateName: " \t\u00a0 ",
            Status: { Id: 1, Name: "\u00a0" },
            IsDefault: false,
            Domains: [
              { Id: 1, Name: "" },
              { Id: 2, Name: " \t\u00a0 " },
              { Id: 3, Name: "ACME.EXAMPLE" },
            ],
          },
        ],
        DataContext: {
          Pagination: {
            TotalCount: 1,
            NextCursor: null,
            PreviousCursor: null,
            HasMore: false,
            HasPrevious: false,
          },
        },
        Notifications: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const env = environment({ GORELO_API_KEY: GORELO_KEY });

    const imported = await handleFetch(
      request("/api/v1/integrations/gorelo/clients/import", {
        method: "POST",
      }),
      env,
    );

    expect(imported.status).toBe(200);
    await expect(imported.json()).resolves.toMatchObject({
      import: { created: 1, updated: 0, total: 1 },
    });

    const directory = await handleFetch(
      request("/api/v1/integrations/gorelo/clients?limit=100"),
      env,
    );
    expect(directory.status).toBe(200);
    await expect(directory.json()).resolves.toMatchObject({
      total: 1,
      clients: [
        {
          id: 42,
          name: "Acme Managed Services",
          billingName: null,
          alternateName: null,
          status: null,
          domains: ["acme.example"],
          stale: false,
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("reports a redacted service error when client persistence fails", async () => {
    const privateStorageError = "private D1 persistence details";
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.stubGlobal("fetch", async () =>
      Response.json({
        data: [{ id: 1, name: "Acme" }],
        totalCount: 1,
        nextCursor: null,
        previousCursor: null,
        hasMore: false,
        hasPrevious: false,
      }),
    );
    const env = environment({ GORELO_API_KEY: GORELO_KEY });
    vi.spyOn(env.DB, "batch").mockRejectedValueOnce(
      new Error(privateStorageError),
    );

    const response = await handleFetch(
      request("/api/v1/integrations/gorelo/clients/import", {
        method: "POST",
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      error: {
        title: "Gorelo client directory could not be saved",
        details: {
          code: "storage_error",
          stage: "client-storage",
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain(privateStorageError);
    expect(JSON.stringify(body)).not.toContain("Internal server error");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      privateStorageError,
    );
  });

  it("reports invalid imported client data without reflecting its contents", async () => {
    const privateClientName = "Sensitive\nClient";
    vi.stubGlobal("fetch", async () =>
      Response.json({
        data: [{ id: 1, name: privateClientName }],
        totalCount: 1,
        nextCursor: null,
        previousCursor: null,
        hasMore: false,
        hasPrevious: false,
      }),
    );
    const env = environment({ GORELO_API_KEY: GORELO_KEY });

    const response = await handleFetch(
      request("/api/v1/integrations/gorelo/clients/import", {
        method: "POST",
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      error: {
        title: "Gorelo returned client data that could not be imported",
        details: {
          code: "invalid_client_data",
          stage: "client-validation",
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain(privateClientName);
    expect(JSON.stringify(body)).not.toContain("Sensitive");
    expect(JSON.stringify(body)).not.toContain("Internal server error");
  });

  it("returns a safe conflict for duplicate aliases", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        data: [
          { id: 1, name: "One" },
          { id: 2, name: "Two" },
        ],
        totalCount: 2,
        nextCursor: null,
        previousCursor: null,
        hasMore: false,
        hasPrevious: false,
      }),
    );
    const env = environment({ GORELO_API_KEY: GORELO_KEY });
    await handleFetch(
      request("/api/v1/integrations/gorelo/clients/import", { method: "POST" }),
      env,
    );
    for (const clientId of [1, 2]) {
      const response = await handleFetch(
        request("/api/v1/integrations/gorelo/client-aliases", {
          method: "POST",
          body: JSON.stringify({ clientId, alias: "same source" }),
        }),
        env,
      );
      expect(response.status).toBe(clientId === 1 ? 201 : 409);
    }

    const canonicalConflict = await handleFetch(
      request("/api/v1/integrations/gorelo/client-aliases", {
        method: "POST",
        body: JSON.stringify({
          clientId: 1,
          alias: "Two",
          scope: "vendor-a",
        }),
      }),
      env,
    );
    expect(canonicalConflict.status).toBe(409);
    await expect(canonicalConflict.json()).resolves.toMatchObject({
      error: {
        details: { code: "canonical_identity_conflict" },
      },
    });
  });

  it("batch-creates aliases atomically and version-updates alias and scope", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        data: [{ id: 1, name: "Acme Managed Services" }],
        totalCount: 1,
        nextCursor: null,
        previousCursor: null,
        hasMore: false,
        hasPrevious: false,
      }),
    );
    const env = environment({ GORELO_API_KEY: GORELO_KEY });
    await handleFetch(
      request("/api/v1/integrations/gorelo/clients/import", { method: "POST" }),
      env,
    );

    const created = await handleFetch(
      request("/api/v1/integrations/gorelo/client-aliases/batch", {
        method: "POST",
        body: JSON.stringify({
          clientId: 1,
          aliases: [
            { alias: "Acme North", scope: "global" },
            { alias: "Tenant 0042", scope: "vendor-a" },
            { alias: "Acme Legacy", scope: "global" },
          ],
        }),
      }),
      env,
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      created: number;
      aliases: { id: string; alias: string; scope: string; version: number }[];
    };
    expect(createdBody).toMatchObject({
      created: 3,
      aliases: [
        { alias: "Acme North", scope: "global", version: 1 },
        { alias: "Tenant 0042", scope: "vendor-a", version: 1 },
        { alias: "Acme Legacy", scope: "global", version: 1 },
      ],
    });

    const scoped = createdBody.aliases[1]!;
    const scopePreservingUpdate = await handleFetch(
      request(
        `/api/v1/integrations/gorelo/client-aliases/${encodeURIComponent(scoped.id)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            alias: "Tenant 0042 renamed",
            version: scoped.version,
          }),
        },
      ),
      env,
    );
    expect(scopePreservingUpdate.status).toBe(200);
    await expect(scopePreservingUpdate.json()).resolves.toMatchObject({
      alias: {
        alias: "Tenant 0042 renamed",
        scope: "vendor-a",
        version: 2,
      },
    });

    const first = createdBody.aliases[0]!;
    const updated = await handleFetch(
      request(
        `/api/v1/integrations/gorelo/client-aliases/${encodeURIComponent(first.id)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            alias: "Acme Northern Region",
            scope: "monitoring-vendor",
            version: first.version,
          }),
        },
      ),
      env,
    );
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      alias: {
        alias: "Acme Northern Region",
        scope: "monitoring-vendor",
        version: 2,
      },
    });

    const staleUpdate = await handleFetch(
      request(
        `/api/v1/integrations/gorelo/client-aliases/${encodeURIComponent(first.id)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            alias: "Stale edit",
            scope: "global",
            version: 1,
          }),
        },
      ),
      env,
    );
    expect(staleUpdate.status).toBe(409);
    await expect(staleUpdate.json()).resolves.toMatchObject({
      error: { details: { currentVersion: 2 } },
    });

    const conflictingBatch = await handleFetch(
      request("/api/v1/integrations/gorelo/client-aliases/batch", {
        method: "POST",
        body: JSON.stringify({
          clientId: 1,
          aliases: [{ alias: "Must not persist" }, { alias: "ACME LEGACY" }],
        }),
      }),
      env,
    );
    expect(conflictingBatch.status).toBe(409);
    const directory = await handleFetch(
      request("/api/v1/integrations/gorelo/clients?query=must%20not%20persist"),
      env,
    );
    await expect(directory.json()).resolves.toMatchObject({
      total: 0,
      clients: [],
    });
  });

  it("bounds and validates alias batches", async () => {
    const env = environment({ GORELO_API_KEY: GORELO_KEY });
    const empty = await handleFetch(
      request("/api/v1/integrations/gorelo/client-aliases/batch", {
        method: "POST",
        body: JSON.stringify({ clientId: 1, aliases: [] }),
      }),
      env,
    );
    expect(empty.status).toBe(400);

    const tooMany = await handleFetch(
      request("/api/v1/integrations/gorelo/client-aliases/batch", {
        method: "POST",
        body: JSON.stringify({
          clientId: 1,
          aliases: Array.from({ length: 101 }, (_, index) => ({
            alias: `Alias ${String(index)}`,
          })),
        }),
      }),
      env,
    );
    expect(tooMany.status).toBe(400);

    const controlCharacter = await handleFetch(
      request("/api/v1/integrations/gorelo/client-aliases/batch", {
        method: "POST",
        body: JSON.stringify({
          clientId: 1,
          aliases: [{ alias: "Customer\nTwo" }],
        }),
      }),
      env,
    );
    expect(controlCharacter.status).toBe(400);

    const expandsPastLimit = await handleFetch(
      request("/api/v1/integrations/gorelo/client-aliases/batch", {
        method: "POST",
        body: JSON.stringify({
          clientId: 1,
          aliases: [{ alias: "\ufb03".repeat(171) }],
        }),
      }),
      env,
    );
    expect(expandsPastLimit.status).toBe(400);
  });
});

describe("webhook destination API", () => {
  it("reports disabled capability without exposing a secret", async () => {
    const response = await handleFetch(
      request("/api/v1/webhooks"),
      environment(),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      webhooks: [],
      capability: {
        configured: false,
        allowedHosts: [],
        signingConfigured: false,
      },
    });
    expect(JSON.stringify(body)).not.toContain(WEBHOOK_SECRET);
  });

  it("registers only allow-listed HTTPS destinations with versioned changes", async () => {
    const env = environment({
      ALLOWED_WEBHOOK_HOSTS: "hooks.example.com",
      WEBHOOK_SIGNING_SECRET: WEBHOOK_SECRET,
    });
    const outside = await handleFetch(
      request("/api/v1/webhooks", {
        method: "POST",
        body: JSON.stringify({
          name: "Outside",
          url: "https://other.example.com/mail",
          enabled: true,
        }),
      }),
      env,
    );
    expect(outside.status).toBe(400);

    const created = await handleFetch(
      request("/api/v1/webhooks", {
        method: "POST",
        body: JSON.stringify({
          name: "Automation intake",
          url: "https://hooks.example.com/mail",
          enabled: true,
        }),
      }),
      env,
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      webhook: { id: string; version: number; url: string };
    };
    expect(createdBody.webhook).toMatchObject({
      version: 1,
      url: "https://hooks.example.com/mail",
    });

    const stale = await handleFetch(
      request(`/api/v1/webhooks/${createdBody.webhook.id}`, {
        method: "PUT",
        body: JSON.stringify({
          version: 9,
          name: "Automation intake",
          url: "https://hooks.example.com/mail",
          enabled: false,
        }),
      }),
      env,
    );
    expect(stale.status).toBe(409);

    const removed = await handleFetch(
      request(
        `/api/v1/webhooks/${createdBody.webhook.id}?version=${String(createdBody.webhook.version)}`,
        { method: "DELETE" },
      ),
      env,
    );
    expect(removed.status).toBe(204);
  });

  it("refuses registration until both server-side controls are configured", async () => {
    const response = await handleFetch(
      request("/api/v1/webhooks", {
        method: "POST",
        body: JSON.stringify({
          name: "Automation intake",
          url: "https://hooks.example.com/mail",
          enabled: true,
        }),
      }),
      environment({ ALLOWED_WEBHOOK_HOSTS: "hooks.example.com" }),
    );
    expect(response.status).toBe(409);
  });
});
