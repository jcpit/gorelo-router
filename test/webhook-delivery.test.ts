import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  claimDelivery,
  createOrGetDelivery,
  getDelivery,
} from "../src/delivery-repository";
import {
  MAX_AUTOMATIC_WEBHOOK_ATTEMPTS,
  STALE_WEBHOOK_CLAIM_AGE_MS,
  executeWebhookDelivery,
  retryClaimableWebhookDeliveries,
} from "../src/webhook-delivery";
import {
  createWebhookDestination,
  updateWebhookDestination,
} from "../src/webhook-repository";
import type { Env } from "../src/types";
import { WEBHOOK_IDEMPOTENCY_HEADER } from "../src/webhooks";
import { config as runtimeConfig } from "./helpers";

const SIGNING_SECRET = "test-webhook-signing-secret-at-least-32-bytes";
const EVENT_TIME = "2026-08-09T00:00:00.000Z";

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

function database(): D1Database {
  const db = new TestDatabase();
  databases.push(db);
  return db as unknown as D1Database;
}

function environment(db: D1Database, overrides: Partial<Env> = {}): Env {
  return {
    DB: db,
    DEFAULT_GORELO_ADDRESS: "tickets@gorelo.example",
    WEBHOOK_SIGNING_SECRET: SIGNING_SECRET,
    ...overrides,
  };
}

async function addEvent(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO processing_events
         (id, envelope_from, envelope_to, raw_size, spam_score,
          spam_reasons_json, decision, status, created_at)
       VALUES (?, 'sender@example.com', 'parser@example.net', 100, 0,
               '[]', 'forward', 'forwarded', ?)`,
    )
    .bind(id, EVENT_TIME)
    .run();
}

async function addDestination(db: D1Database, enabled = true) {
  return createWebhookDestination(db, {
    name: enabled ? "Automation intake" : "Paused automation",
    url: enabled
      ? "https://hooks.example.com/mail-parser"
      : "https://hooks.example.com/paused",
    host: "hooks.example.com",
    enabled,
  });
}

function configured() {
  return runtimeConfig({
    allowedWebhookHosts: new Set(["hooks.example.com"]),
    webhookSigningConfigured: true,
    webhookTimeoutMs: 8_000,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  while (databases.length > 0) databases.pop()!.close();
});

describe("webhook delivery orchestration", () => {
  it("sends once with the durable delivery ID and stores only a safe payload snapshot", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(EVENT_TIME));
    const db = database();
    await addEvent(db, "event-success");
    const destination = await addDestination(db);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const input = {
      eventId: "event-success",
      actionIndex: 0,
      destinationId: destination.id,
      eventType: "mail.parsed",
      data: { subject: "Disk offline", client: "Northwind" },
      ruleSnapshotId: "rule:disk-alert:2",
    } as const;
    const result = await executeWebhookDelivery(
      environment(db),
      configured(),
      input,
    );

    expect(result).toMatchObject({
      status: "succeeded",
      delivery: {
        state: "succeeded",
        actionType: "send_webhook",
        attemptCount: 1,
        ruleSnapshotId: "rule:disk-alert:2",
      },
    });
    if (result.status !== "succeeded") throw new Error("delivery failed");
    const detail = await getDelivery(db, result.delivery.id);
    expect(detail?.payloadSnapshot).toEqual({
      destinationId: destination.id,
      destinationVersion: destination.version,
      destinationEndpointDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      eventType: "mail.parsed",
      data: { client: "Northwind", subject: "Disk offline" },
    });
    const serializedSnapshot = JSON.stringify(detail?.payloadSnapshot);
    expect(serializedSnapshot).not.toContain(destination.url);
    expect(serializedSnapshot).not.toContain(SIGNING_SECRET);
    expect(detail?.attemptHistory).toMatchObject([
      { attemptNumber: 1, outcome: "succeeded", httpStatus: 202 },
    ]);

    const headers = new Headers(fetchMock.mock.calls[0]![1]?.headers);
    expect(headers.get(WEBHOOK_IDEMPOTENCY_HEADER)).toBe(result.delivery.id);
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as {
      deliveryId: string;
      data: unknown;
    };
    expect(body).toMatchObject({
      deliveryId: result.delivery.id,
      data: input.data,
    });

    await expect(
      executeWebhookDelivery(environment(db), configured(), input),
    ).resolves.toMatchObject({
      status: "skipped",
      reason: "already_succeeded",
      delivery: { id: result.delivery.id },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("records missing, disabled, and unconfigured destinations as terminal failures", async () => {
    const db = database();
    const disabled = await addDestination(db, false);
    const enabled = await addDestination(db, true);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const cases = [
      {
        eventId: "event-missing",
        destinationId: "missing-destination",
        expectedError: "Webhook destination is not available",
        env: environment(db),
        config: configured(),
      },
      {
        eventId: "event-disabled",
        destinationId: disabled.id,
        expectedError: "Webhook destination is disabled",
        env: environment(db),
        config: configured(),
      },
      {
        eventId: "event-unconfigured",
        destinationId: enabled.id,
        expectedError: "Webhook delivery is not configured",
        env: {
          DB: db,
          DEFAULT_GORELO_ADDRESS: "tickets@gorelo.example",
        },
        config: runtimeConfig({
          allowedWebhookHosts: new Set(["hooks.example.com"]),
          webhookSigningConfigured: false,
        }),
      },
    ] as const;

    for (const [actionIndex, testCase] of cases.entries()) {
      await addEvent(db, testCase.eventId);
      const input = {
        eventId: testCase.eventId,
        actionIndex,
        destinationId: testCase.destinationId,
        eventType: "mail.parsed",
        data: { subject: "Safe payload" },
      };
      const result = await executeWebhookDelivery(
        testCase.env,
        testCase.config,
        input,
      );
      expect(result).toMatchObject({
        status: "failed",
        delivery: {
          state: "failed",
          safeError: testCase.expectedError,
          attemptCount: 1,
        },
      });
      expect(result.delivery.nextAttemptAt).toBeUndefined();
      await expect(
        executeWebhookDelivery(testCase.env, testCase.config, input),
      ).resolves.toMatchObject({
        status: "skipped",
        reason: "terminal_failure",
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(
      retryClaimableWebhookDeliveries(environment(db), configured()),
    ).resolves.toMatchObject({ scanned: 0, attempted: 0 });
  });

  it("records extraction preflight errors without storing or sending their content", async () => {
    const db = database();
    await addEvent(db, "event-extraction-failed");
    const destination = await addDestination(db);
    const unsafeError =
      "Failed at https://hooks.example.com/private with secret=never-log-this and email body text";
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeWebhookDelivery(environment(db), configured(), {
      eventId: "event-extraction-failed",
      actionIndex: 0,
      destinationId: destination.id,
      eventType: "mail.parsed",
      data: {},
      preflightError: unsafeError,
    });

    expect(result).toMatchObject({
      status: "failed",
      delivery: {
        state: "failed",
        safeError: "Webhook field extraction failed",
      },
    });
    expect(result.delivery.safeError).not.toContain(unsafeError);
    expect(result.delivery.safeError).not.toContain("never-log-this");
    expect(result.delivery.nextAttemptAt).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("schedules bounded retryable failures and retries only when due", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(EVENT_TIME));
    const db = database();
    await addEvent(db, "event-retry");
    const destination = await addDestination(db);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      eventId: "event-retry",
      actionIndex: 0,
      destinationId: destination.id,
      eventType: "mail.parsed",
      data: { alert: "Router offline" },
    } as const;

    const failed = await executeWebhookDelivery(
      environment(db),
      configured(),
      input,
    );
    expect(failed).toMatchObject({
      status: "failed",
      delivery: {
        state: "failed",
        safeError: "Webhook endpoint returned a retryable response",
        nextAttemptAt: "2026-08-09T00:00:30.000Z",
      },
    });
    await expect(
      executeWebhookDelivery(environment(db), configured(), input),
    ).resolves.toMatchObject({ status: "skipped", reason: "not_due" });
    expect(fetchMock).toHaveBeenCalledOnce();

    vi.setSystemTime(new Date("2026-08-09T00:00:30.000Z"));
    const retryBatch = await retryClaimableWebhookDeliveries(
      environment(db),
      configured(),
    );
    expect(retryBatch).toMatchObject({
      scanned: 1,
      attempted: 1,
      succeeded: 1,
      failed: 0,
      uncertain: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstIdempotencyKey = new Headers(
      fetchMock.mock.calls[0]![1]?.headers,
    ).get(WEBHOOK_IDEMPOTENCY_HEADER);
    const secondIdempotencyKey = new Headers(
      fetchMock.mock.calls[1]![1]?.headers,
    ).get(WEBHOOK_IDEMPOTENCY_HEADER);
    expect(secondIdempotencyKey).toBe(firstIdempotencyKey);

    const detail = await getDelivery(db, failed.delivery.id);
    expect(detail).toMatchObject({ state: "succeeded", attemptCount: 2 });
    expect(detail?.attemptHistory).toMatchObject([
      { attemptNumber: 1, outcome: "failed", httpStatus: 503 },
      { attemptNumber: 2, outcome: "succeeded", httpStatus: 204 },
    ]);
  });

  it("moves a delivery to manual review when its registered endpoint changes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(EVENT_TIME));
    const db = database();
    await addEvent(db, "event-destination-drift");
    const destination = await addDestination(db);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 503 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const failed = await executeWebhookDelivery(environment(db), configured(), {
      eventId: "event-destination-drift",
      actionIndex: 0,
      destinationId: destination.id,
      eventType: "mail.parsed",
      data: { subject: "Endpoint must stay bound" },
    });
    expect(failed).toMatchObject({
      status: "failed",
      delivery: { nextAttemptAt: "2026-08-09T00:00:30.000Z" },
    });

    await expect(
      updateWebhookDestination(db, destination.id, destination.version, {
        name: destination.name,
        url: "https://hooks.example.com/replacement",
        host: destination.host,
        enabled: true,
      }),
    ).resolves.toMatchObject({ status: "updated" });

    vi.setSystemTime(new Date("2026-08-09T00:00:30.000Z"));
    await expect(
      retryClaimableWebhookDeliveries(environment(db), configured()),
    ).resolves.toMatchObject({
      attempted: 1,
      succeeded: 0,
      uncertain: 1,
    });
    expect(fetchMock).toHaveBeenCalledOnce();

    const detail = await getDelivery(db, failed.delivery.id);
    expect(detail).toMatchObject({
      state: "uncertain",
      safeError: "Webhook destination changed after delivery was created",
      attemptCount: 2,
      attemptHistory: [
        { attemptNumber: 1, outcome: "failed", httpStatus: 503 },
        { attemptNumber: 2, outcome: "uncertain" },
      ],
    });
    expect(JSON.stringify(detail?.payloadSnapshot)).not.toContain(
      "hooks.example.com",
    );
  });

  it("ages an abandoned claim into uncertain without resending it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(EVENT_TIME));
    const db = database();
    await addEvent(db, "event-stale-claim");
    const created = await createOrGetDelivery(db, {
      eventId: "event-stale-claim",
      actionIndex: 0,
      actionType: "send_webhook",
      payloadSnapshot: {
        destinationId: "destination-stale",
        eventType: "mail.parsed",
        data: { subject: "May already have been sent" },
      },
      createdAt: EVENT_TIME,
    });
    await claimDelivery(
      db,
      created.delivery.id,
      created.delivery.version,
      EVENT_TIME,
    );
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    vi.setSystemTime(
      new Date(Date.parse(EVENT_TIME) + STALE_WEBHOOK_CLAIM_AGE_MS + 1),
    );
    await expect(
      retryClaimableWebhookDeliveries(environment(db), configured()),
    ).resolves.toMatchObject({
      reconciled: 1,
      scanned: 0,
      attempted: 0,
      uncertain: 1,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(getDelivery(db, created.delivery.id)).resolves.toMatchObject({
      state: "uncertain",
      safeError: "Webhook delivery claim expired with an uncertain outcome",
      attemptCount: 1,
      attemptHistory: [{ attemptNumber: 1, outcome: "uncertain" }],
    });
  });

  it("stops automatic delivery after the bounded attempt ceiling", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(EVENT_TIME));
    const db = database();
    await addEvent(db, "event-attempt-ceiling");
    const destination = await addDestination(db);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 503 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = await executeWebhookDelivery(environment(db), configured(), {
      eventId: "event-attempt-ceiling",
      actionIndex: 0,
      destinationId: destination.id,
      eventType: "mail.parsed",
      data: { subject: "Persistent outage" },
    });
    let detail = await getDelivery(db, first.delivery.id);
    while (
      detail &&
      detail.attemptCount < MAX_AUTOMATIC_WEBHOOK_ATTEMPTS &&
      detail.nextAttemptAt
    ) {
      vi.setSystemTime(new Date(detail.nextAttemptAt));
      await retryClaimableWebhookDeliveries(environment(db), configured());
      detail = await getDelivery(db, first.delivery.id);
    }

    expect(fetchMock).toHaveBeenCalledTimes(MAX_AUTOMATIC_WEBHOOK_ATTEMPTS);
    expect(detail).toMatchObject({
      state: "failed",
      attemptCount: MAX_AUTOMATIC_WEBHOOK_ATTEMPTS,
    });
    expect(detail?.nextAttemptAt).toBeUndefined();

    vi.setSystemTime(new Date("2026-08-10T00:00:00.000Z"));
    await expect(
      retryClaimableWebhookDeliveries(environment(db), configured()),
    ).resolves.toMatchObject({ scanned: 0, attempted: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(MAX_AUTOMATIC_WEBHOOK_ATTEMPTS);
  });

  it("holds timed-out attempts as uncertain and never automatically resends them", async () => {
    const db = database();
    await addEvent(db, "event-timeout");
    const destination = await addDestination(db);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Promise<Response>(() => undefined),
    );
    vi.stubGlobal("fetch", fetchMock);
    const config = runtimeConfig({
      allowedWebhookHosts: new Set(["hooks.example.com"]),
      webhookSigningConfigured: true,
      webhookTimeoutMs: 50,
    });
    const input = {
      eventId: "event-timeout",
      actionIndex: 0,
      destinationId: destination.id,
      eventType: "mail.parsed",
      data: { subject: "Timeout test" },
    } as const;

    const result = await executeWebhookDelivery(environment(db), config, input);
    expect(result).toMatchObject({
      status: "uncertain",
      delivery: {
        state: "uncertain",
        safeError: "Webhook delivery outcome is uncertain after timeout",
      },
    });
    await expect(
      executeWebhookDelivery(environment(db), config, input),
    ).resolves.toMatchObject({
      status: "skipped",
      reason: "manual_review_required",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("redacts destination, payload, and secret values from configuration failures", async () => {
    const db = database();
    await addEvent(db, "event-invalid-config");
    const rawUrl = "https://blocked.example.net/private/path";
    const destination = await createWebhookDestination(db, {
      name: "Invalid destination",
      url: rawUrl,
      host: "blocked.example.net",
      enabled: true,
    });
    const payloadMarker = "PAYLOAD-MARKER-DO-NOT-LOG";
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeWebhookDelivery(environment(db), configured(), {
      eventId: "event-invalid-config",
      actionIndex: 0,
      destinationId: destination.id,
      eventType: "mail.parsed",
      data: { value: payloadMarker },
    });
    expect(result).toMatchObject({
      status: "failed",
      delivery: {
        safeError: "Webhook delivery configuration is invalid",
      },
    });
    const safeError = result.delivery.safeError ?? "";
    expect(safeError).not.toContain(rawUrl);
    expect(safeError).not.toContain(payloadMarker);
    expect(safeError).not.toContain(SIGNING_SECRET);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not resend a delivery already claimed by another worker", async () => {
    const db = database();
    await addEvent(db, "event-in-progress");
    const destination = await addDestination(db);
    const input = {
      eventId: "event-in-progress",
      actionIndex: 0,
      destinationId: destination.id,
      eventType: "mail.parsed",
      data: { subject: "In progress" },
    } as const;
    const created = await createOrGetDelivery(db, {
      eventId: input.eventId,
      actionIndex: input.actionIndex,
      actionType: "send_webhook",
      payloadSnapshot: {
        destinationId: input.destinationId,
        eventType: input.eventType,
        data: input.data,
      },
    });
    await claimDelivery(db, created.delivery.id, created.delivery.version);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      executeWebhookDelivery(environment(db), configured(), input),
    ).resolves.toMatchObject({ status: "skipped", reason: "in_progress" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
