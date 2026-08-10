import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleFetch } from "../src/api";
import type { Env } from "../src/types";

const ADMIN_TOKEN = "test-admin-token-0123456789-abcdef";
const API_KEY = "test-gorelo-key-not-a-real-secret";

class TestStatement {
  private bindings: unknown[] = [];

  constructor(private readonly statement: StatementSync) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.bindings = values;
    return this as unknown as D1PreparedStatement;
  }

  async run<T>(): Promise<D1Result<T>> {
    const result = this.statement.run(...(this.bindings as never[]));
    return {
      success: true,
      results: [],
      meta: { changes: Number(result.changes) },
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
    this.sqlite.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
  }

  prepare(query: string): D1PreparedStatement {
    return new TestStatement(
      this.sqlite.prepare(query),
    ) as unknown as D1PreparedStatement;
  }

  close(): void {
    this.sqlite.close();
  }
}

const databases: TestDatabase[] = [];

function environment(): Env {
  const database = new TestDatabase();
  databases.push(database);
  return {
    DB: database as unknown as D1Database,
    ADMIN_API_TOKEN: ADMIN_TOKEN,
    GORELO_API_KEY: API_KEY,
    GORELO_API_BASE_URL: "https://api.aue.gorelo.io",
    DEFAULT_GORELO_ADDRESS: "tickets@gorelo.example",
  };
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`https://worker.example${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${ADMIN_TOKEN}`,
      ...init.headers,
    },
  });
}

function page(totalCount: number): Response {
  return Response.json({
    data: [],
    totalCount,
    nextCursor: null,
    previousCursor: null,
    hasMore: false,
    hasPrevious: false,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  while (databases.length > 0) databases.pop()!.close();
});

describe("Gorelo integration API", () => {
  it("tests every selector catalog, caches it, and never returns the key", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        expect(init?.headers).toMatchObject({ "X-API-Key": API_KEY });
        if (url.pathname === "/v1/clients") return page(12);
        if (url.pathname === "/v1/assets/agents") return page(40);
        if (url.pathname === "/v1/organization/users") return page(7);
        if (url.pathname === "/v1/organization/groups")
          return Response.json([]);
        if (url.pathname === "/v1/tickets/statuses") return Response.json([]);
        if (url.pathname === "/v1/tickets/tags") return Response.json([]);
        if (url.pathname === "/v1/tickets/types") return Response.json([]);
        return new Response(null, { status: 404 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const env = environment();

    const response = await handleFetch(
      request("/api/v1/integrations/gorelo/test", { method: "POST" }),
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      gorelo: {
        connected: true,
        baseUrl: "https://api.aue.gorelo.io",
        catalogCounts: {
          clients: 12,
          "agent-assets": 40,
          users: 7,
          groups: 0,
          "ticket-statuses": 0,
          "ticket-tags": 0,
          "ticket-types": 0,
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain(API_KEY);
    expect(fetchMock).toHaveBeenCalledTimes(8);

    const cached = await handleFetch(
      request("/api/v1/integrations/gorelo/catalogs/clients"),
      env,
    );
    expect(cached.status).toBe(200);
    await expect(cached.json()).resolves.toMatchObject({
      catalog: { kind: "clients", totalCount: 12, cached: true },
    });
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("requires client scoping for contact and location catalogs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleFetch(
      request("/api/v1/integrations/gorelo/catalogs/contacts"),
      environment(),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { details: { code: "client_required" } },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns complete bounded selector catalogs across Gorelo pages", async () => {
    const firstId = "ce7cb8a4-29d5-4b60-adba-fab15873446c";
    const secondId = "8911dad4-32b1-4a9d-a0df-a0af7fa9415e";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/v1/assets/agents");
      const secondPage = url.searchParams.get("cursor") === "assets-page-2";
      return Response.json({
        data: [
          {
            id: secondPage ? secondId : firstId,
            displayName: secondPage ? "Second page asset" : "First page asset",
            clientId: 42,
          },
        ],
        totalCount: 2,
        nextCursor: secondPage ? null : "assets-page-2",
        previousCursor: secondPage ? "assets-page-1" : null,
        hasMore: !secondPage,
        hasPrevious: secondPage,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleFetch(
      request("/api/v1/integrations/gorelo/catalogs/agent-assets"),
      environment(),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      catalog: {
        items: [{ id: firstId }, { id: secondId }],
        totalCount: 2,
        pagination: { nextCursor: null, hasMore: false },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
