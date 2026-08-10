import { describe, expect, it, vi } from "vitest";
import { handleFetch } from "../src/api";
import type { Env } from "../src/types";

const ADMIN_TOKEN = "test-admin-token-0123456789-abcdef";

function env(db: D1Database, overrides: Partial<Env> = {}): Env {
  return {
    DB: db,
    ADMIN_API_TOKEN: ADMIN_TOKEN,
    DEFAULT_GORELO_ADDRESS: "tickets@gorelo.example",
    ALLOWED_FORWARD_DESTINATIONS: "tickets@gorelo.example",
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

function readinessDatabase(options: {
  directGorelo?: number;
  webhooks?: number;
  unavailableWebhookDestinations?: number;
  currentClients?: number;
}): D1Database {
  let mailboxInitialized = false;
  const mailbox = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Default Gorelo mailbox",
    address: "tickets@gorelo.example",
    enabled: 1,
    is_default: 1,
    version: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  const db = {
    prepare: vi.fn((sql: string) => {
      const statement = {
        bind: vi.fn(() => statement),
        all: vi.fn(async () => ({
          results:
            sql.includes("FROM gorelo_mailboxes") && mailboxInitialized
              ? [mailbox]
              : [],
        })),
        first: vi.fn(async () => {
          if (sql.includes("COUNT(*) AS count FROM gorelo_mailboxes")) {
            return { count: mailboxInitialized ? 1 : 0 };
          }
          if (sql.includes("FROM gorelo_mailbox_settings")) {
            return mailboxInitialized
              ? {
                  default_mailbox_id: mailbox.id,
                  version: 1,
                  updated_at: mailbox.updated_at,
                }
              : null;
          }
          if (sql.includes("FROM gorelo_mailboxes m")) {
            return mailboxInitialized ? mailbox : null;
          }
          return sql.includes("AS direct_gorelo")
            ? {
                direct_gorelo: options.directGorelo ?? 0,
                webhooks: options.webhooks ?? 0,
                unavailable_webhook_destinations:
                  options.unavailableWebhookDestinations ?? 0,
              }
            : sql.includes("COUNT(*) AS count")
              ? { count: options.currentClients ?? 0 }
              : null;
        }),
        run: vi.fn(async () => {
          if (sql.includes("INSERT INTO gorelo_mailbox_settings")) {
            mailboxInitialized = true;
          }
          return { success: true, meta: { changes: 1 } };
        }),
      };
      return statement;
    }),
    batch: vi.fn(async (statements: D1PreparedStatement[]) =>
      Promise.all(statements.map((statement) => statement.run())),
    ),
  };
  return db as unknown as D1Database;
}

describe("HTTP API", () => {
  it("identifies the service as Gorelo Router", async () => {
    const response = await handleFetch(
      new Request("https://worker.example/"),
      env({} as D1Database),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      name: "Gorelo Router",
      health: "/healthz",
      admin: "/admin",
    });
  });

  it("keeps public liveness independent of D1", async () => {
    const prepare = vi.fn(() => {
      throw new Error("D1 should not be called");
    });
    const response = await handleFetch(
      new Request("https://worker.example/healthz"),
      env({ prepare } as unknown as D1Database),
    );
    expect(response.status).toBe(200);
    expect(prepare).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects the tracked local admin-token placeholder", async () => {
    const placeholder = "replace-with-a-long-random-token";
    const response = await handleFetch(
      new Request("https://worker.example/api/v1/runtime", {
        headers: { authorization: `Bearer ${placeholder}` },
      }),
      env({} as D1Database, { ADMIN_API_TOKEN: placeholder }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { title: "Admin API is not configured" },
    });
  });

  it("checks every migrated schema on authenticated readiness", async () => {
    const db = readinessDatabase({ currentClients: 0 });
    const prepare = vi.mocked(db.prepare);
    const response = await handleFetch(
      request("/api/v1/readiness"),
      env(db, {
        MESSAGE_ARCHIVE: {} as R2Bucket,
      }),
    );
    expect(response.status).toBe(200);
    const sql = prepare.mock.calls.map(([query]) => String(query)).join("\n");
    for (const table of [
      "rules",
      "processing_events",
      "quarantine_items",
      "message_review_actions",
      "outbound_deliveries",
      "delivery_attempts",
      "gorelo_catalog_cache",
      "gorelo_clients",
      "gorelo_client_sync",
      "client_aliases",
      "webhook_destinations",
      "gorelo_mailboxes",
      "gorelo_mailbox_settings",
      "parser_captures",
    ]) {
      expect(sql).toContain(table);
    }
  });

  it("fails readiness when an enabled Gorelo API rule loses its key", async () => {
    const response = await handleFetch(
      request("/api/v1/readiness"),
      env(readinessDatabase({ directGorelo: 1, currentClients: 1 }), {
        MESSAGE_ARCHIVE: {} as R2Bucket,
        ARCHIVE_MODE: "none",
      }),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        details: {
          missing: [expect.objectContaining({ key: "gorelo_api" })],
        },
      },
    });
  });

  it("fails readiness when an enabled webhook loses configuration or its destination", async () => {
    const missingConfig = await handleFetch(
      request("/api/v1/readiness"),
      env(readinessDatabase({ webhooks: 1 }), { ARCHIVE_MODE: "none" }),
    );
    expect(missingConfig.status).toBe(503);
    await expect(missingConfig.json()).resolves.toMatchObject({
      error: {
        details: {
          missing: [expect.objectContaining({ key: "webhooks" })],
        },
      },
    });

    const unavailableDestination = await handleFetch(
      request("/api/v1/readiness"),
      env(
        readinessDatabase({
          webhooks: 1,
          unavailableWebhookDestinations: 1,
        }),
        {
          ARCHIVE_MODE: "none",
          ALLOWED_WEBHOOK_HOSTS: "hooks.example.com",
          WEBHOOK_SIGNING_SECRET: "x".repeat(32),
        },
      ),
    );
    expect(unavailableDestination.status).toBe(503);
    await expect(unavailableDestination.json()).resolves.toMatchObject({
      error: {
        details: {
          missing: [expect.objectContaining({ key: "webhook_destinations" })],
        },
      },
    });
  });

  it("reports a non-secret forward-only setup profile", async () => {
    const all = vi.fn(async () => ({ results: [] }));
    const prepare = vi.fn(() => ({ all }));
    const response = await handleFetch(
      request("/api/v1/setup/status"),
      env({ prepare } as unknown as D1Database),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      setup: {
        profile: "forward-only",
        gorelo: {
          configured: false,
          region: "aue",
          secretName: "GORELO_API_KEY",
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain("ADMIN_TOKEN");
  });

  it("does not attempt a Gorelo connection until its Worker secret is configured", async () => {
    const response = await handleFetch(
      request("/api/v1/integrations/gorelo/test", { method: "POST" }),
      env({} as D1Database),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        title: expect.stringContaining("GORELO_API_KEY"),
        details: {
          code: "not_configured",
          stage: "connection",
          phase: "request",
        },
      },
    });
  });

  it("validates outbound delivery filters before querying D1", async () => {
    const prepare = vi.fn();
    const response = await handleFetch(
      request("/api/v1/deliveries?state=maybe"),
      env({ prepare } as unknown as D1Database),
    );
    expect(response.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("does not expose the removed branding routes", async () => {
    const environment = env({} as D1Database);
    const responses = await Promise.all([
      handleFetch(
        new Request("https://worker.example/admin/branding"),
        environment,
      ),
      handleFetch(request("/api/v1/branding"), environment),
      handleFetch(
        request("/api/v1/branding/publish", { method: "POST" }),
        environment,
      ),
      handleFetch(request("/api/v1/branding/logo"), environment),
    ]);
    expect(responses.map((response) => response.status)).toEqual([
      404, 404, 404, 404,
    ]);
  });

  it("returns 400 for a destination outside the configured allow-list", async () => {
    const response = await handleFetch(
      request("/api/v1/rules", {
        method: "POST",
        body: JSON.stringify({
          name: "Invalid route",
          conditions: [
            { field: "from_domain", operator: "equals", value: "example.com" },
          ],
          action: { type: "forward", destination: "outside@example.net" },
        }),
      }),
      env({} as D1Database),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { title: expect.stringContaining("not allowed") },
    });
  });

  it("returns 400 for quarantine without a review destination", async () => {
    const response = await handleFetch(
      request("/api/v1/rules", {
        method: "POST",
        body: JSON.stringify({
          name: "Missing quarantine",
          conditions: [
            { field: "subject", operator: "contains", value: "suspicious" },
          ],
          action: { type: "quarantine" },
        }),
      }),
      env({} as D1Database),
    );
    expect(response.status).toBe(400);
  });

  it("stops reading an oversized chunked JSON body", async () => {
    const response = await handleFetch(
      request("/api/v1/rules", {
        method: "POST",
        body: JSON.stringify({ padding: "x".repeat(300_000) }),
      }),
      env({} as D1Database),
    );
    expect(response.status).toBe(413);
  });
});
