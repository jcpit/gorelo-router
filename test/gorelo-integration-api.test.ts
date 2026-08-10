import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleFetch } from "../src/api";
import {
  GORELO_SETUP_DEFAULT_RATE_LIMIT_WAIT_MS,
  GORELO_SETUP_MAX_RATE_LIMIT_WAIT_MS,
  GORELO_SETUP_PROBE_INTERVAL_MS,
  GORELO_SETUP_PROBE_TIMEOUT_MS,
} from "../src/gorelo-integration";
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
    GORELO_API_KEY: API_KEY,
    GORELO_API_BASE_URL: "https://api.aue.gorelo.io",
    DEFAULT_GORELO_ADDRESS: "tickets@gorelo.example",
    ...overrides,
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

async function settleWithFakeTimers<T>(pending: Promise<T>): Promise<T> {
  let settled = false;
  void pending.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  for (let elapsed = 0; !settled && elapsed <= 24_000; elapsed += 50) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(50);
  }
  await new Promise<void>((resolve) => setImmediate(resolve));
  if (!settled) {
    throw new Error("operation did not settle inside the dashboard deadline");
  }
  return pending;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  while (databases.length > 0) databases.pop()!.close();
});

describe("Gorelo integration API", () => {
  it("probes every selector catalog sequentially with bounded requests without caching full catalogs", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const startedAt = new Date("2026-08-10T00:00:00.000Z").getTime();
    vi.setSystemTime(startedAt);
    const requests: string[] = [];
    const requestTimes: number[] = [];
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        requests.push(`${url.pathname}${url.search}`);
        requestTimes.push(Date.now());
        expect(init?.headers).toMatchObject({ "X-API-Key": API_KEY });
        expect(init?.redirect).toBe("manual");
        activeRequests += 1;
        maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
        await Promise.resolve();
        const response =
          url.pathname === "/v1/clients"
            ? page(12)
            : url.pathname === "/v1/assets/agents"
              ? page(40)
              : url.pathname === "/v1/organization/users"
                ? page(7)
                : [
                      "/v1/organization/groups",
                      "/v1/tickets/statuses",
                      "/v1/tickets/tags",
                      "/v1/tickets/types",
                    ].includes(url.pathname)
                  ? Response.json([])
                  : new Response(null, { status: 404 });
        activeRequests -= 1;
        return response;
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const env = environment();

    const pendingResponse = handleFetch(
      request("/api/v1/integrations/gorelo/test", { method: "POST" }),
      env,
    );
    const response = await settleWithFakeTimers(pendingResponse);
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
    expect(maximumActiveRequests).toBe(1);
    expect(requests).toEqual([
      "/v1/clients?pageSize=1",
      "/v1/assets/agents?pageSize=1",
      "/v1/organization/users?pageSize=1",
      "/v1/organization/groups",
      "/v1/tickets/statuses",
      "/v1/tickets/tags",
      "/v1/tickets/types",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(requestTimes[0]).toBeGreaterThanOrEqual(startedAt);
    expect(
      requestTimes.slice(1).map((time, index) => time - requestTimes[index]!),
    ).toEqual(Array(6).fill(GORELO_SETUP_PROBE_INTERVAL_MS));
    expect(
      GORELO_SETUP_PROBE_TIMEOUT_MS * 8 +
        GORELO_SETUP_PROBE_INTERVAL_MS * 6 +
        GORELO_SETUP_MAX_RATE_LIMIT_WAIT_MS,
    ).toBeLessThan(25_000);

    const cacheRow = databases
      .at(-1)!
      .sqlite.prepare("SELECT COUNT(*) AS count FROM gorelo_catalog_cache")
      .get() as { count: number };
    expect(cacheRow.count).toBe(0);
  });

  it("reports the failed setup stage and request phase without leaking network diagnostics", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const privateDiagnostic = `DNS lookup exposed ${API_KEY}`;
    const requests: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requests.push(url.pathname);
      if (url.pathname === "/v1/clients") return page(12);
      if (url.pathname === "/v1/assets/agents") {
        throw new TypeError(privateDiagnostic);
      }
      throw new Error("a later setup probe must not run");
    });
    vi.stubGlobal("fetch", fetchMock);

    const pendingResponse = handleFetch(
      request("/api/v1/integrations/gorelo/test", { method: "POST" }),
      environment(),
    );
    const response = await settleWithFakeTimers(pendingResponse);
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        details: {
          code: "network_error",
          stage: "agent-assets",
          phase: "request",
          reason: "fetch_failure",
        },
      },
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain(privateDiagnostic);
    expect(requests).toEqual(["/v1/clients", "/v1/assets/agents"]);
  });

  it("reports only an allow-listed response-shape reason for an invalid agent item", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const privateAssetName = `private-agent-${API_KEY}`;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/clients") return page(12);
      if (url.pathname === "/v1/assets/agents") {
        return Response.json({
          data: [{ id: "not-a-guid", name: privateAssetName }],
          totalCount: 1,
          nextCursor: null,
          previousCursor: null,
          hasMore: false,
          hasPrevious: false,
        });
      }
      throw new Error("a later setup probe must not run");
    });
    vi.stubGlobal("fetch", fetchMock);

    const pendingResponse = handleFetch(
      request("/api/v1/integrations/gorelo/test", { method: "POST" }),
      environment(),
    );
    const response = await settleWithFakeTimers(pendingResponse);

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        details: {
          code: "invalid_response",
          stage: "agent-assets",
          phase: "response",
          reason: "invalid_catalog_item",
        },
      },
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain(privateAssetName);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("classifies a redirect response without following or exposing its Location and stops probing", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const privateLocation = `https://private.example/tenant/${API_KEY}`;
    const requests: string[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        requests.push(url.pathname);
        expect(init?.redirect).toBe("manual");
        if (url.pathname === "/v1/organization/groups") {
          return new Response(null, {
            status: 302,
            headers: { location: privateLocation },
          });
        }
        if (
          url.pathname === "/v1/clients" ||
          url.pathname === "/v1/assets/agents" ||
          url.pathname === "/v1/organization/users"
        ) {
          return page(0);
        }
        throw new Error("a later setup probe must not run");
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const pendingResponse = handleFetch(
      request("/api/v1/integrations/gorelo/test", { method: "POST" }),
      environment(),
    );
    const response = await settleWithFakeTimers(pendingResponse);
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        details: {
          code: "redirect_error",
          stage: "groups",
          phase: "response",
          reason: "redirect_rejected",
          upstreamStatus: 302,
        },
      },
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain(privateLocation);
    expect(serialized).not.toContain("private.example");
    expect(requests).toEqual([
      "/v1/clients",
      "/v1/assets/agents",
      "/v1/organization/users",
      "/v1/organization/groups",
    ]);
  });

  it("classifies a response stream failure at its setup stage without leaking the stream error", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const privateDiagnostic = `response stream exposed ${API_KEY}`;
    const requests: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requests.push(url.pathname);
      if (url.pathname === "/v1/clients") return page(0);
      if (url.pathname === "/v1/assets/agents") return page(0);
      if (url.pathname === "/v1/organization/users") {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.error(new Error(privateDiagnostic));
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      throw new Error("a later setup probe must not run");
    });
    vi.stubGlobal("fetch", fetchMock);

    const pendingResponse = handleFetch(
      request("/api/v1/integrations/gorelo/test", { method: "POST" }),
      environment(),
    );
    const response = await settleWithFakeTimers(pendingResponse);
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        details: {
          code: "network_error",
          stage: "users",
          phase: "response",
          reason: "response_stream_failure",
        },
      },
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain(privateDiagnostic);
    expect(requests).toEqual([
      "/v1/clients",
      "/v1/assets/agents",
      "/v1/organization/users",
    ]);
  });

  it("classifies client construction failures as connection-stage diagnostics", async () => {
    const invalidSecret = ` ${API_KEY}`;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleFetch(
      request("/api/v1/integrations/gorelo/test", { method: "POST" }),
      environment({ GORELO_API_KEY: invalidSecret }),
    );
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        details: {
          code: "invalid_configuration",
          stage: "connection",
          phase: "request",
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain(invalidSecret);
    expect(JSON.stringify(body)).not.toContain(API_KEY);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the failed stage before the dashboard request deadline", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const privateDiagnostic = `slow-upstream-${API_KEY}`;
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error(privateDiagnostic)),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pendingResponse = handleFetch(
      request("/api/v1/integrations/gorelo/test", { method: "POST" }),
      environment(),
    );
    const response = await settleWithFakeTimers(pendingResponse);
    expect(response.status).toBe(504);
    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        details: {
          code: "timeout",
          stage: "clients",
          phase: "request",
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain(privateDiagnostic);
    expect(JSON.stringify(body)).not.toContain(API_KEY);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retries one rate-limited setup GET after Retry-After and completes the diagnostic", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const startedAt = new Date("2026-08-10T00:00:00.000Z").getTime();
    vi.setSystemTime(startedAt);
    const privateBody = `PRIVATE-UPSTREAM-${API_KEY}`;
    const requests: string[] = [];
    const ticketTypeRequestTimes: number[] = [];
    let ticketTypeAttempts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requests.push(url.pathname);
      if (url.pathname === "/v1/tickets/types") {
        ticketTypeAttempts += 1;
        ticketTypeRequestTimes.push(Date.now());
        if (ticketTypeAttempts === 1) {
          return Response.json(
            { privateBody },
            { status: 429, headers: { "Retry-After": "1" } },
          );
        }
        return Response.json([]);
      }
      if (
        url.pathname === "/v1/clients" ||
        url.pathname === "/v1/assets/agents" ||
        url.pathname === "/v1/organization/users"
      ) {
        return page(0);
      }
      return Response.json([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const pendingResponse = handleFetch(
      request("/api/v1/integrations/gorelo/test", { method: "POST" }),
      environment(),
    );
    const response = await settleWithFakeTimers(pendingResponse);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      gorelo: {
        connected: true,
        catalogCounts: { "ticket-types": 0 },
      },
    });
    expect(ticketTypeRequestTimes).toHaveLength(2);
    expect(ticketTypeRequestTimes[1]! - ticketTypeRequestTimes[0]!).toBe(1_000);
    expect(requests).toHaveLength(8);
    expect(
      requests.filter((path) => path === "/v1/tickets/types"),
    ).toHaveLength(2);
    expect(JSON.stringify(body)).not.toContain(privateBody);
    expect(JSON.stringify(body)).not.toContain(API_KEY);
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it.each([
    ["missing", undefined],
    ["malformed", `not-a-delay-${API_KEY}`],
  ] as const)(
    "retries a 429 only once using the short fallback for a %s Retry-After, then preserves the safe failure",
    async (_description, retryAfter) => {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      const startedAt = new Date("2026-08-10T00:00:00.000Z").getTime();
      vi.setSystemTime(startedAt);
      const privateBody = `PRIVATE-UPSTREAM-${API_KEY}`;
      const requestTimes: number[] = [];
      const fetchMock = vi.fn(async () => {
        requestTimes.push(Date.now());
        return Response.json(
          { privateBody },
          {
            status: 429,
            statusText: privateBody,
            ...(retryAfter === undefined
              ? {}
              : { headers: { "Retry-After": retryAfter } }),
          },
        );
      });
      vi.stubGlobal("fetch", fetchMock);

      const pendingResponse = handleFetch(
        request("/api/v1/integrations/gorelo/test", { method: "POST" }),
        environment(),
      );
      const response = await settleWithFakeTimers(pendingResponse);

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body).toMatchObject({
        error: {
          details: {
            code: "rate_limited",
            stage: "clients",
            phase: "response",
            upstreamStatus: 429,
          },
        },
      });
      expect(requestTimes[0]).toBeGreaterThanOrEqual(startedAt);
      expect(requestTimes).toHaveLength(2);
      expect(requestTimes[1]! - requestTimes[0]!).toBe(
        GORELO_SETUP_DEFAULT_RATE_LIMIT_WAIT_MS,
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(body)).not.toContain(privateBody);
      expect(JSON.stringify(body)).not.toContain(API_KEY);
    },
  );

  it("allows only one rate-limit retry across the complete setup diagnostic", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const requests: string[] = [];
    let clientAttempts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requests.push(url.pathname);
      if (url.pathname === "/v1/clients") {
        clientAttempts += 1;
        if (clientAttempts === 1) {
          return new Response(null, {
            status: 429,
            headers: { "Retry-After": "1" },
          });
        }
        return page(0);
      }
      if (url.pathname === "/v1/tickets/types") {
        return new Response(null, {
          status: 429,
          headers: { "Retry-After": "1" },
        });
      }
      if (
        url.pathname === "/v1/assets/agents" ||
        url.pathname === "/v1/organization/users"
      ) {
        return page(0);
      }
      return Response.json([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const pendingResponse = handleFetch(
      request("/api/v1/integrations/gorelo/test", { method: "POST" }),
      environment(),
    );
    const response = await settleWithFakeTimers(pendingResponse);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        details: {
          code: "rate_limited",
          stage: "ticket-types",
          phase: "response",
          upstreamStatus: 429,
        },
      },
    });
    expect(requests.filter((path) => path === "/v1/clients")).toHaveLength(2);
    expect(
      requests.filter((path) => path === "/v1/tickets/types"),
    ).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("does not wait or retry when Retry-After exceeds the diagnostic bound", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const privateBody = `PRIVATE-UPSTREAM-${API_KEY}`;
    const fetchMock = vi.fn(async () =>
      Response.json(
        { privateBody },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              GORELO_SETUP_MAX_RATE_LIMIT_WAIT_MS / 1_000 + 1,
            ),
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pendingResponse = handleFetch(
      request("/api/v1/integrations/gorelo/test", { method: "POST" }),
      environment(),
    );
    const response = await settleWithFakeTimers(pendingResponse);

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        details: {
          code: "rate_limited",
          stage: "clients",
          phase: "response",
          upstreamStatus: 429,
        },
      },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.stringify(body)).not.toContain(privateBody);
    expect(JSON.stringify(body)).not.toContain(API_KEY);
  });

  it.each([
    [401, 502, "authentication_failed"],
    [403, 502, "authentication_failed"],
  ] as const)(
    "reports upstream HTTP %i with a safe response-stage classification",
    async (upstreamStatus, responseStatus, code) => {
      const privateBody = `PRIVATE-UPSTREAM-${API_KEY}`;
      const fetchMock = vi.fn(async () =>
        Response.json(
          { privateBody },
          { status: upstreamStatus, statusText: privateBody },
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await handleFetch(
        request("/api/v1/integrations/gorelo/test", { method: "POST" }),
        environment(),
      );
      expect(response.status).toBe(responseStatus);
      const body = await response.json();
      expect(body).toMatchObject({
        error: {
          details: {
            code,
            stage: "clients",
            phase: "response",
            upstreamStatus,
          },
        },
      });
      expect(JSON.stringify(body)).not.toContain(privateBody);
      expect(JSON.stringify(body)).not.toContain(API_KEY);
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it("reports malformed provider JSON as a redacted response-stage failure", async () => {
    const privateBody = `not-json-${API_KEY}`;
    const fetchMock = vi.fn(async () => new Response(privateBody));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleFetch(
      request("/api/v1/integrations/gorelo/test", { method: "POST" }),
      environment(),
    );
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        details: {
          code: "invalid_response",
          stage: "clients",
          phase: "response",
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain(privateBody);
    expect(JSON.stringify(body)).not.toContain(API_KEY);
    expect(fetchMock).toHaveBeenCalledOnce();
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
