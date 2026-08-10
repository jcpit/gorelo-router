import { describe, expect, it, vi } from "vitest";
import { buildSetupStatus } from "../src/setup";
import type { Env } from "../src/types";
import { config } from "./helpers";

function database(ready = true): D1Database {
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
        all: vi.fn(async () => {
          if (!ready) throw new Error("missing table");
          if (sql.includes("FROM gorelo_mailboxes")) {
            return {
              success: true,
              results: mailboxInitialized ? [mailbox] : [],
              meta: {},
            };
          }
          return { success: true, results: [], meta: {} };
        }),
        first: vi.fn(async () => {
          if (!ready) throw new Error("missing table");
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
          return null;
        }),
        run: vi.fn(async () => {
          if (!ready) throw new Error("missing table");
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

function databaseWithEnabledRules(
  directGorelo: number,
  webhooks: number,
  options: {
    unavailableWebhookDestinations?: number;
    unavailableFixedClients?: number;
    currentClients?: number;
    webhookClientResolution?: number;
    webhookDestinationHosts?: string[];
  } = {},
): D1Database {
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
          success: true,
          results: sql.includes("FROM gorelo_mailboxes")
            ? mailboxInitialized
              ? [mailbox]
              : []
            : sql.includes("AS webhook_destination_host")
              ? (options.webhookDestinationHosts ?? []).map((host) => ({
                  webhook_destination_host: host,
                }))
              : [],
          meta: {},
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
                direct_gorelo: directGorelo,
                webhooks,
                webhook_client_resolution: sql.includes(
                  "AS webhook_client_resolution",
                )
                  ? (options.webhookClientResolution ?? 0)
                  : 0,
                unavailable_webhook_destinations:
                  options.unavailableWebhookDestinations ?? 0,
                unavailable_fixed_clients: options.unavailableFixedClients ?? 0,
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

function environment(overrides: Partial<Env> = {}): Env {
  return {
    DB: database(),
    DEFAULT_GORELO_ADDRESS: "tickets@gorelo.example",
    ...overrides,
  };
}

describe("setup status", () => {
  it("treats a complete forwarding deployment as ready without an API key", async () => {
    const status = await buildSetupStatus(
      environment({
        MESSAGE_ARCHIVE: {} as R2Bucket,
        RELEASE_EMAIL: {} as SendEmail,
      }),
      config({
        releaseFromAddress: "release@example.com",
        goreloApiConfigured: false,
      }),
    );
    expect(status.ready).toBe(true);
    expect(status.profile).toBe("forward-only");
    expect(status.gorelo).toMatchObject({
      configured: false,
      secretName: "GORELO_API_KEY",
    });
    expect(status.checks).toContainEqual(
      expect.objectContaining({ key: "gorelo_api", status: "optional" }),
    );
    expect(status.webhooks).toMatchObject({
      configured: false,
      allowedHosts: [],
      signingConfigured: false,
      secretName: "WEBHOOK_SIGNING_SECRET",
    });
  });

  it("reports structured mode without returning the secret", async () => {
    const status = await buildSetupStatus(
      environment({
        GORELO_API_KEY: "must-not-be-returned",
        MESSAGE_ARCHIVE: {} as R2Bucket,
      }),
      config({ goreloApiConfigured: true }),
    );
    expect(status.profile).toBe("structured-gorelo");
    expect(JSON.stringify(status)).not.toContain("must-not-be-returned");
    expect(status.gorelo.region).toBe("aue");
  });

  it("requires the Gorelo API when an enabled rule creates tickets or alerts", async () => {
    const status = await buildSetupStatus(
      environment({
        DB: databaseWithEnabledRules(1, 0),
        MESSAGE_ARCHIVE: {} as R2Bucket,
      }),
      config({ goreloApiConfigured: false }),
    );

    expect(status.ready).toBe(false);
    expect(status.checks).toContainEqual(
      expect.objectContaining({ key: "gorelo_api", status: "missing" }),
    );
  });

  it("requires a current client import for enabled structured rules", async () => {
    const status = await buildSetupStatus(
      environment({
        DB: databaseWithEnabledRules(1, 0),
        GORELO_API_KEY: "configured-test-key",
        MESSAGE_ARCHIVE: {} as R2Bucket,
      }),
      config({ goreloApiConfigured: true }),
    );

    expect(status.ready).toBe(false);
    expect(status.checks).toContainEqual(
      expect.objectContaining({ key: "gorelo_clients", status: "missing" }),
    );
  });

  it("requires signed webhook configuration when an enabled rule uses it", async () => {
    const status = await buildSetupStatus(
      environment({ DB: databaseWithEnabledRules(0, 1) }),
      config({
        allowedWebhookHosts: new Set<string>(),
        webhookSigningConfigured: false,
      }),
    );

    expect(status.ready).toBe(false);
    expect(status.checks).toContainEqual(
      expect.objectContaining({ key: "webhooks", status: "missing" }),
    );
  });

  it("requires a current client import for webhook client enrichment", async () => {
    const status = await buildSetupStatus(
      environment({
        DB: databaseWithEnabledRules(0, 1, {
          webhookClientResolution: 1,
        }),
        WEBHOOK_SIGNING_SECRET: "x".repeat(32),
      }),
      config({
        allowedWebhookHosts: new Set(["hooks.example.com"]),
        webhookSigningConfigured: true,
      }),
    );

    expect(status.ready).toBe(false);
    expect(status.checks).toContainEqual(
      expect.objectContaining({ key: "gorelo_clients", status: "missing" }),
    );
  });

  it("accepts a current client import for webhook client enrichment", async () => {
    const status = await buildSetupStatus(
      environment({
        DB: databaseWithEnabledRules(0, 1, {
          currentClients: 1,
          webhookClientResolution: 1,
        }),
        MESSAGE_ARCHIVE: {} as R2Bucket,
        WEBHOOK_SIGNING_SECRET: "x".repeat(32),
      }),
      config({
        allowedWebhookHosts: new Set(["hooks.example.com"]),
        webhookSigningConfigured: true,
      }),
    );

    expect(status.checks).toContainEqual(
      expect.objectContaining({ key: "gorelo_clients", status: "ready" }),
    );
  });

  it("reports a fixed Gorelo client that is absent from the current import", async () => {
    const status = await buildSetupStatus(
      environment({
        DB: databaseWithEnabledRules(1, 0, {
          currentClients: 3,
          unavailableFixedClients: 1,
        }),
        GORELO_API_KEY: "configured-test-key",
        MESSAGE_ARCHIVE: {} as R2Bucket,
      }),
      config({ goreloApiConfigured: true }),
    );

    expect(status.ready).toBe(false);
    expect(status.checks).toContainEqual(
      expect.objectContaining({ key: "gorelo_clients", status: "missing" }),
    );
  });

  it("reports enabled webhook rules with missing or disabled destinations", async () => {
    const status = await buildSetupStatus(
      environment({
        DB: databaseWithEnabledRules(0, 1, {
          unavailableWebhookDestinations: 1,
        }),
        WEBHOOK_SIGNING_SECRET: "x".repeat(32),
      }),
      config({
        allowedWebhookHosts: new Set(["hooks.example.com"]),
        webhookSigningConfigured: true,
      }),
    );

    expect(status.ready).toBe(false);
    expect(status.checks).toContainEqual(
      expect.objectContaining({
        key: "webhook_destinations",
        status: "missing",
      }),
    );
  });

  it("reports an enabled webhook destination outside the current host allowlist", async () => {
    const status = await buildSetupStatus(
      environment({
        DB: databaseWithEnabledRules(0, 1, {
          webhookDestinationHosts: ["retired-hooks.example.com"],
        }),
        WEBHOOK_SIGNING_SECRET: "x".repeat(32),
      }),
      config({
        allowedWebhookHosts: new Set(["hooks.example.com"]),
        webhookSigningConfigured: true,
      }),
    );

    expect(status.ready).toBe(false);
    expect(status.checks).toContainEqual(
      expect.objectContaining({
        key: "webhook_destinations",
        status: "missing",
      }),
    );
  });

  it("marks a missing baseline schema and required storage as not ready", async () => {
    const status = await buildSetupStatus(
      environment({ DB: database(false) }),
      config({ quarantineMode: "internal", archiveMode: "quarantine" }),
    );
    expect(status.ready).toBe(false);
    expect(status.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "database", status: "missing" }),
        expect.objectContaining({
          key: "message_archive",
          status: "missing",
        }),
      ]),
    );
  });

  it("detects a partial release configuration", async () => {
    const status = await buildSetupStatus(
      environment({
        MESSAGE_ARCHIVE: {} as R2Bucket,
        RELEASE_EMAIL: {} as SendEmail,
      }),
      config({ releaseFromAddress: undefined }),
    );
    expect(status.ready).toBe(false);
    expect(status.checks).toContainEqual(
      expect.objectContaining({ key: "release_email", status: "missing" }),
    );
  });

  it("requires both the webhook host allowlist and signing secret", async () => {
    const partial = await buildSetupStatus(
      environment(),
      config({ allowedWebhookHosts: new Set(["hooks.example.com"]) }),
    );
    expect(partial.ready).toBe(false);
    expect(partial.checks).toContainEqual(
      expect.objectContaining({ key: "webhooks", status: "missing" }),
    );

    const ready = await buildSetupStatus(
      environment(),
      config({
        allowedWebhookHosts: new Set(["hooks.example.com"]),
        webhookSigningConfigured: true,
      }),
    );
    expect(ready.webhooks).toMatchObject({
      configured: true,
      allowedHosts: ["hooks.example.com"],
      signingConfigured: true,
    });
    expect(ready.checks).toContainEqual(
      expect.objectContaining({ key: "webhooks", status: "ready" }),
    );
  });
});
