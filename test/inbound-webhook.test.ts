import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDeliveryByEventAction } from "../src/delivery-repository";
import {
  createInboundWebhookSource,
  extractInboundWebhookVariables,
  handleInboundWebhook,
  inboundWebhookSourceInputSchema,
  listInboundWebhookSources,
  rotateInboundWebhookSourceToken,
} from "../src/inbound-webhook";
import { getEvent } from "../src/repository";
import type { Env } from "../src/types";
import { createWebhookDestination } from "../src/webhook-repository";
import { config } from "./helpers";

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
    for (const migration of [
      "0001_initial.sql",
      "0002_mailboxes_and_parser_samples.sql",
      "0003_parser_captures.sql",
      "0004_inbound_webhooks.sql",
    ]) {
      this.sqlite.exec(readFileSync(`migrations/${migration}`, "utf8"));
    }
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  while (databases.length > 0) databases.pop()!.close();
});

function sourceInput(rateLimitPerMinute = 60) {
  return inboundWebhookSourceInputSchema.parse({
    name: "Monitoring platform",
    slug: "monitoring-platform",
    enabled: true,
    mappings: [
      { key: "customer", pointer: "/client/name", required: true },
      { key: "device", pointer: "/assets/0/hostname" },
    ],
    action: { type: "accept" },
    rateLimitPerMinute,
  });
}

describe("inbound webhook sources", () => {
  it("stores only the token digest and rotates with optimistic locking", async () => {
    const { db, sqlite } = database();
    const created = await createInboundWebhookSource(db, sourceInput());

    expect(created.token).toMatch(/^grwh_[A-Za-z0-9_-]{64}$/);
    expect(await listInboundWebhookSources(db)).toEqual([created.source]);
    const stored = sqlite
      .prepare(
        "SELECT token_hash, token_hint FROM inbound_webhook_sources WHERE id = ?",
      )
      .get(created.source.id) as { token_hash: string; token_hint: string };
    expect(stored.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.token_hash).not.toContain(created.token);
    expect(stored.token_hint).toBe(created.token.slice(-6));

    await expect(
      rotateInboundWebhookSourceToken(db, created.source.id, 2),
    ).resolves.toBe("conflict");
    const rotated = await rotateInboundWebhookSourceToken(
      db,
      created.source.id,
      1,
    );
    expect(rotated).not.toBeNull();
    expect(rotated).not.toBe("conflict");
    if (rotated && rotated !== "conflict") {
      expect(rotated.token).not.toBe(created.token);
      expect(rotated.source.version).toBe(2);
    }
  });

  it("extracts bounded scalar values with RFC 6901 pointers", () => {
    expect(
      extractInboundWebhookVariables({ "a/b": { "~name": true }, count: 12 }, [
        inboundWebhookSourceInputSchema.parse({
          ...sourceInput(),
          mappings: [{ key: "value", pointer: "/a~1b/~0name" }],
        }).mappings[0]!,
        { key: "count", pointer: "/count", required: true, maxCharacters: 1 },
      ]),
    ).toEqual({ value: "true", count: "1" });
  });

  it("rejects credential-like retained field names", () => {
    expect(() =>
      inboundWebhookSourceInputSchema.parse({
        ...sourceInput(),
        mappings: [{ key: "api_key", pointer: "/key" }],
      }),
    ).toThrow(/Credential-like/);
  });

  it("authenticates, audits mapped values, and deduplicates retries", async () => {
    const { db } = database();
    const created = await createInboundWebhookSource(db, sourceInput(10));
    const env = { DB: db } as Env;
    const makeRequest = (token: string) =>
      new Request("https://router.example/hooks/v1/monitoring-platform", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "idempotency-key": "vendor-event-42",
          "x-event-type": "monitor.offline",
        },
        body: JSON.stringify({
          client: { name: "Acme AU" },
          assets: [{ hostname: "SERVER-01" }],
          ignored: { secret: "ignored-secret-value" },
        }),
      });

    await expect(
      handleInboundWebhook(
        makeRequest("grwh_invalid-token-that-is-long-enough-for-checking"),
        env,
        config(),
        created.source.slug,
      ),
    ).rejects.toMatchObject({ status: 401, code: "unauthorized" });

    const first = await handleInboundWebhook(
      makeRequest(created.token),
      env,
      config(),
      created.source.slug,
    );
    expect(first).toMatchObject({ duplicate: false, status: "forwarded" });
    const event = await getEvent(db, first.eventId);
    expect(event).toMatchObject({
      ingress: {
        type: "webhook",
        sourceName: "Monitoring platform",
        eventType: "monitor.offline",
        idempotencyKey: "vendor-event-42",
        variables: { customer: "Acme AU", device: "SERVER-01" },
      },
    });
    expect(JSON.stringify(event)).not.toContain("ignored-secret-value");

    const cippRequest = new Request(
      `https://router.example/hooks/v1/monitoring-platform?token=${encodeURIComponent(created.token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client: { name: "CIPP" },
          assets: [{ hostname: "CIPP-01" }],
        }),
      },
    );
    const cipp = await handleInboundWebhook(
      cippRequest,
      env,
      config(),
      created.source.slug,
    );
    expect(cipp.duplicate).toBe(false);

    const duplicate = await handleInboundWebhook(
      makeRequest(created.token),
      env,
      config(),
      created.source.slug,
    );
    expect(duplicate).toEqual({
      eventId: first.eventId,
      duplicate: true,
      status: "forwarded",
    });
  });

  it("relays mapped values through the durable signed-webhook ledger", async () => {
    const { db, sqlite } = database();
    const destination = await createWebhookDestination(db, {
      name: "Automation intake",
      url: "https://hooks.example.com/router",
      host: "hooks.example.com",
      enabled: true,
    });
    const input = inboundWebhookSourceInputSchema.parse({
      ...sourceInput(),
      action: {
        type: "send_webhook",
        destinationId: destination.id,
        eventType: "router.monitor",
      },
    });
    const created = await createInboundWebhookSource(db, input);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      DB: db,
      WEBHOOK_SIGNING_SECRET:
        "test-signing-secret-that-is-at-least-32-characters",
    } as Env;
    const request = new Request(
      "https://router.example/hooks/v1/monitoring-platform",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${created.token}`,
          "content-type": "application/json",
          "idempotency-key": "relay-42",
        },
        body: JSON.stringify({
          client: { name: "Acme AU" },
          assets: [{ hostname: "SERVER-01" }],
        }),
      },
    );

    const result = await handleInboundWebhook(
      request,
      env,
      config({
        allowedWebhookHosts: new Set(["hooks.example.com"]),
        webhookSigningConfigured: true,
      }),
      created.source.slug,
    );

    expect(result).toMatchObject({ duplicate: false, status: "forwarded" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as {
      data: { variables: Record<string, string> };
    };
    expect(body.data.variables).toEqual({
      customer: "Acme AU",
      device: "SERVER-01",
    });
    await expect(
      getDeliveryByEventAction(db, result.eventId, 0),
    ).resolves.toMatchObject({
      state: "succeeded",
      actionType: "send_webhook",
    });
    expect(() =>
      sqlite
        .prepare("DELETE FROM webhook_destinations WHERE id = ?")
        .run(destination.id),
    ).toThrow(/referenced by an inbound source/);
  });
});
