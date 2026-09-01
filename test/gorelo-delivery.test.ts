import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  claimDelivery,
  createOrGetDelivery,
  getDelivery,
  markDeliveryFailed,
  markDeliverySucceeded,
  markDeliveryUncertain,
} from "../src/delivery-repository";
import {
  GORELO_DELIVERY_SCHEMA_VERSION,
  STALE_GORELO_CLAIM_AGE_MS,
  executeGoreloDelivery,
  processPendingGoreloDeliveries,
} from "../src/gorelo-delivery";
import type {
  GoreloCreateAlertRequest,
  GoreloCreateTicketRequest,
} from "../src/gorelo";
import type { Env } from "../src/types";
import { config as runtimeConfig } from "./helpers";

const API_KEY = "test-gorelo-key-that-must-never-be-persisted";
const EVENT_TIME = "2026-08-09T00:00:00.000Z";
const TICKET_ID = "ce7cb8a4-29d5-4b60-adba-fab15873446c";

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

function environment(db: D1Database): Env {
  return {
    DB: db,
    DEFAULT_GORELO_ADDRESS: "tickets@gorelo.example",
    GORELO_API_KEY: API_KEY,
  };
}

function configured(region: "aue" | "usw" = "aue") {
  return runtimeConfig({
    goreloApiConfigured: true,
    goreloRegion: region,
    goreloApiBaseUrl:
      region === "aue"
        ? "https://api.aue.gorelo.io"
        : "https://api.usw.gorelo.io",
  });
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

function ticketRequest(title = "Disk full"): GoreloCreateTicketRequest {
  return {
    Title: title,
    ClientId: 42,
    StatusId: 10,
    GroupId: 9,
    TypeId: 12,
    Description: "Disk usage exceeded 95 percent",
    SendTicketCreatedEmail: false,
    IsUnread: true,
  };
}

function alertRequest(): GoreloCreateAlertRequest {
  return {
    Name: "Disk usage",
    ClientId: 42,
    Resource: "srv-01",
    Severity: 1,
  };
}

function ticketSuccess(): Response {
  return Response.json({
    StatusCode: 200,
    IsSuccess: true,
    Data: { Id: TICKET_ID },
    DataContext: { TraceId: "trace-safe" },
  });
}

function alertSuccess(): Response {
  return Response.json({ StatusCode: 200, IsSuccess: true, Data: true });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  while (databases.length > 0) databases.pop()!.close();
});

describe("durable Gorelo create orchestration", () => {
  it("creates one ticket and stores the immutable request without credentials", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(EVENT_TIME));
    const db = database();
    await addEvent(db, "event-ticket-success");
    const fetchMock = vi.fn<typeof fetch>(async () => ticketSuccess());
    vi.stubGlobal("fetch", fetchMock);
    const request = ticketRequest();
    const input = {
      eventId: "event-ticket-success",
      actionIndex: 0,
      actionType: "create_ticket",
      request,
      data: {
        variables: { title: "Disk full", asset: "srv-01" },
        goreloClient: { id: 42, name: "Acme", matchedBy: "global_alias" },
      },
      ruleSnapshotId: "rule:disk:4",
    } as const;

    const result = await executeGoreloDelivery(
      environment(db),
      configured(),
      input,
    );

    expect(result).toMatchObject({
      status: "succeeded",
      delivery: {
        actionType: "create_ticket",
        state: "succeeded",
        attemptCount: 1,
        providerId: TICKET_ID,
        ruleSnapshotId: "rule:disk:4",
      },
    });
    const detail = await getDelivery(db, result.delivery.id);
    expect(detail?.payloadSnapshot).toEqual({
      schemaVersion: GORELO_DELIVERY_SCHEMA_VERSION,
      region: "aue",
      request,
      data: input.data,
    });
    expect(detail?.attemptHistory).toMatchObject([
      { attemptNumber: 1, outcome: "succeeded" },
    ]);
    expect(JSON.stringify(detail?.payloadSnapshot)).not.toContain(API_KEY);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.aue.gorelo.io/v1/tickets");
    expect(JSON.parse(String(init?.body))).toEqual(request);
    expect(new Headers(init?.headers).get("x-api-key")).toBe(API_KEY);

    await expect(
      executeGoreloDelivery(environment(db), configured(), input),
    ).resolves.toMatchObject({
      status: "skipped",
      reason: "already_succeeded",
      delivery: { id: result.delivery.id },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("creates an alert successfully without inventing a provider ID", async () => {
    const db = database();
    await addEvent(db, "event-alert-success");
    const fetchMock = vi.fn<typeof fetch>(async () => alertSuccess());
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeGoreloDelivery(environment(db), configured(), {
      eventId: "event-alert-success",
      actionIndex: 0,
      actionType: "create_alert",
      request: alertRequest(),
      data: { variables: { resource: "srv-01" } },
    });

    expect(result).toMatchObject({
      status: "succeeded",
      delivery: {
        actionType: "create_alert",
        state: "succeeded",
        attemptCount: 1,
      },
    });
    expect(result.delivery.providerId).toBeUndefined();
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://api.aue.gorelo.io/v1/alerts/",
    );
  });

  it("uses the local unique delivery and CAS claim to suppress concurrent creates", async () => {
    const db = database();
    await addEvent(db, "event-concurrent");
    const fetchMock = vi.fn<typeof fetch>(async () => ticketSuccess());
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      eventId: "event-concurrent",
      actionIndex: 0,
      actionType: "create_ticket",
      request: ticketRequest("Only once"),
      data: { variables: {} },
    } as const;

    const results = await Promise.all([
      executeGoreloDelivery(environment(db), configured(), input),
      executeGoreloDelivery(environment(db), configured(), input),
    ]);

    expect(
      results.filter((result) => result.status === "succeeded"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "skipped"),
    ).toHaveLength(1);
    expect(results[0]!.delivery.id).toBe(results[1]!.delivery.id);
    expect(fetchMock).toHaveBeenCalledOnce();
    await expect(
      getDelivery(db, results[0]!.delivery.id),
    ).resolves.toMatchObject({
      state: "succeeded",
      attemptCount: 1,
      attemptHistory: [{ attemptNumber: 1, outcome: "succeeded" }],
    });
  });

  it("records a fixed terminal preflight error with a null request", async () => {
    const db = database();
    await addEvent(db, "event-preflight");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const unsafe =
      "client_resolution_failed secret=do-not-store body customer content";

    const result = await executeGoreloDelivery(environment(db), configured(), {
      eventId: "event-preflight",
      actionIndex: 0,
      actionType: "create_ticket",
      data: { variables: {} },
      preflightError: unsafe,
    });

    expect(result).toMatchObject({
      status: "failed",
      delivery: {
        state: "failed",
        safeError: "Gorelo action preparation failed",
        attemptCount: 1,
      },
    });
    expect(result.delivery.safeError).not.toContain("do-not-store");
    expect(result.delivery.nextAttemptAt).toBeUndefined();
    expect(
      (await getDelivery(db, result.delivery.id))?.payloadSnapshot,
    ).toMatchObject({ request: null, data: { variables: {} } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records entity resolution failures as a fixed audit-safe category", async () => {
    const db = database();
    await addEvent(db, "event-entity-preflight");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeGoreloDelivery(environment(db), configured(), {
      eventId: "event-entity-preflight",
      actionIndex: 0,
      actionType: "create_ticket",
      data: {
        variables: {},
        entityResolutions: {
          contact: { status: "ambiguous", matchedBy: "email" },
        },
      },
      preflightError: "entity_resolution_failed",
    });

    expect(result).toMatchObject({
      status: "failed",
      delivery: {
        state: "failed",
        safeError: "Gorelo ticket association resolution failed",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [400, "Gorelo rejected the create request"],
    [401, "Gorelo API authorization failed"],
    [403, "Gorelo API authorization failed"],
    [404, "Gorelo rejected the create request"],
    [
      429,
      "Gorelo rate limited the create request; automatic replay is disabled",
    ],
  ] as const)(
    "treats definitive HTTP %i as a terminal non-retryable failure",
    async (status, safeError) => {
      const db = database();
      const eventId = `event-http-${String(status)}`;
      await addEvent(db, eventId);
      const responseMarker = `PRIVATE-RESPONSE-${String(status)}`;
      const fetchMock = vi.fn<typeof fetch>(
        async () => new Response(responseMarker, { status }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const input = {
        eventId,
        actionIndex: 0,
        actionType: "create_ticket",
        request: ticketRequest(),
        data: { variables: {} },
      } as const;

      const result = await executeGoreloDelivery(
        environment(db),
        configured(),
        input,
      );
      expect(result).toMatchObject({
        status: "failed",
        delivery: {
          state: "failed",
          safeError,
          attemptCount: 1,
        },
      });
      expect(result.delivery.safeError).not.toContain(responseMarker);
      expect(result.delivery.safeError).not.toContain(API_KEY);
      expect(result.delivery.nextAttemptAt).toBeUndefined();
      await expect(
        executeGoreloDelivery(environment(db), configured(), input),
      ).resolves.toMatchObject({
        status: "skipped",
        reason: "terminal_failure",
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it("holds network, server, and invalid-success outcomes for manual review", async () => {
    const cases = [
      {
        name: "network",
        response: async () => {
          throw new Error(`network ${API_KEY} PRIVATE-BODY`);
        },
        safeError:
          "Gorelo API create outcome is uncertain after a network failure",
      },
      {
        name: "server",
        response: async () =>
          new Response("PRIVATE-SERVER-BODY", { status: 503 }),
        safeError: "Gorelo API returned an uncertain server response",
      },
      {
        name: "redirect",
        response: async () =>
          new Response(null, {
            status: 307,
            headers: {
              location: `https://redirect.example/${API_KEY}/PRIVATE-LOCATION`,
            },
          }),
        safeError:
          "Gorelo API create outcome is uncertain after a blocked redirect",
      },
      {
        name: "invalid-response",
        response: async () =>
          Response.json({
            IsSuccess: true,
            Data: { private: "PRIVATE-SUCCESS-BODY" },
          }),
        safeError: "Gorelo API create outcome is not confirmed",
      },
    ];

    for (const [index, testCase] of cases.entries()) {
      const db = database();
      const eventId = `event-${testCase.name}`;
      await addEvent(db, eventId);
      const fetchMock = vi.fn<typeof fetch>(testCase.response);
      vi.stubGlobal("fetch", fetchMock);
      const input = {
        eventId,
        actionIndex: index,
        actionType: "create_ticket",
        request: ticketRequest(),
        data: { variables: {} },
      } as const;

      const result = await executeGoreloDelivery(
        environment(db),
        configured(),
        input,
      );
      expect(result).toMatchObject({
        status: "uncertain",
        delivery: {
          state: "uncertain",
          safeError: testCase.safeError,
          attemptCount: 1,
        },
      });
      const serialized = JSON.stringify(
        await getDelivery(db, result.delivery.id),
      );
      expect(serialized).not.toContain("PRIVATE-");
      expect(serialized).not.toContain(API_KEY);
      await expect(
        executeGoreloDelivery(environment(db), configured(), input),
      ).resolves.toMatchObject({
        status: "skipped",
        reason: "manual_review_required",
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      vi.unstubAllGlobals();
    }
  });

  it("holds a timeout for manual review and never replays it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(EVENT_TIME));
    const db = database();
    await addEvent(db, "event-timeout");
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Promise<Response>(() => undefined),
    );
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      eventId: "event-timeout",
      actionIndex: 0,
      actionType: "create_alert",
      request: alertRequest(),
      data: { variables: {} },
    } as const;

    const pending = executeGoreloDelivery(environment(db), configured(), input);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(8_001);
    const result = await pending;

    expect(result).toMatchObject({
      status: "uncertain",
      delivery: {
        state: "uncertain",
        safeError: "Gorelo API create outcome is uncertain after timeout",
      },
    });
    await expect(
      processPendingGoreloDeliveries(environment(db), configured()),
    ).resolves.toMatchObject({ scanned: 0, attempted: 0 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("processes only never-claimed pending rows", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(EVENT_TIME));
    const db = database();
    for (const id of ["event-pending", "event-failed", "event-uncertain"]) {
      await addEvent(db, id);
    }
    const snapshot = {
      schemaVersion: GORELO_DELIVERY_SCHEMA_VERSION,
      region: "aue",
      request: ticketRequest(),
      data: { variables: {} },
    };
    const pending = await createOrGetDelivery(db, {
      eventId: "event-pending",
      actionIndex: 0,
      actionType: "create_ticket",
      payloadSnapshot: snapshot,
      createdAt: EVENT_TIME,
    });
    const failed = await createOrGetDelivery(db, {
      eventId: "event-failed",
      actionIndex: 0,
      actionType: "create_ticket",
      payloadSnapshot: snapshot,
      createdAt: EVENT_TIME,
    });
    const failedClaim = await claimDelivery(
      db,
      failed.delivery.id,
      failed.delivery.version,
      EVENT_TIME,
    );
    if (failedClaim.status !== "updated") throw new Error("claim failed");
    await markDeliveryFailed(db, failed.delivery.id, {
      expectedVersion: failedClaim.delivery.version,
      safeError: "Fixed terminal test failure",
      completedAt: EVENT_TIME,
    });
    const uncertain = await createOrGetDelivery(db, {
      eventId: "event-uncertain",
      actionIndex: 0,
      actionType: "create_ticket",
      payloadSnapshot: snapshot,
      createdAt: EVENT_TIME,
    });
    const uncertainClaim = await claimDelivery(
      db,
      uncertain.delivery.id,
      uncertain.delivery.version,
      EVENT_TIME,
    );
    if (uncertainClaim.status !== "updated") throw new Error("claim failed");
    await markDeliveryUncertain(db, uncertain.delivery.id, {
      expectedVersion: uncertainClaim.delivery.version,
      safeError: "Fixed uncertain test failure",
      completedAt: EVENT_TIME,
    });
    const fetchMock = vi.fn<typeof fetch>(async () => ticketSuccess());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      processPendingGoreloDeliveries(environment(db), configured()),
    ).resolves.toMatchObject({
      reconciled: 0,
      scanned: 1,
      attempted: 1,
      succeeded: 1,
      failed: 0,
      uncertain: 0,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    await expect(getDelivery(db, pending.delivery.id)).resolves.toMatchObject({
      state: "succeeded",
      attemptCount: 1,
    });
    await expect(getDelivery(db, failed.delivery.id)).resolves.toMatchObject({
      state: "failed",
      attemptCount: 1,
    });
    await expect(getDelivery(db, uncertain.delivery.id)).resolves.toMatchObject(
      { state: "uncertain", attemptCount: 1 },
    );
  });

  it("repairs a stale top-level event after delivery completion committed", async () => {
    const db = database();
    await addEvent(db, "event-summary-repair");
    const created = await createOrGetDelivery(db, {
      eventId: "event-summary-repair",
      actionIndex: 0,
      actionType: "create_ticket",
      payloadSnapshot: {
        schemaVersion: GORELO_DELIVERY_SCHEMA_VERSION,
        region: "aue",
        request: ticketRequest(),
        data: { variables: {} },
      },
      createdAt: EVENT_TIME,
    });
    const claim = await claimDelivery(
      db,
      created.delivery.id,
      created.delivery.version,
      EVENT_TIME,
    );
    if (claim.status !== "updated") throw new Error("claim failed");
    await markDeliverySucceeded(db, created.delivery.id, {
      expectedVersion: claim.delivery.version,
      completedAt: EVENT_TIME,
      providerId: TICKET_ID,
    });
    await db
      .prepare(
        "UPDATE processing_events SET status = 'failed', error = 'stale summary' WHERE id = ?",
      )
      .bind("event-summary-repair")
      .run();

    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      processPendingGoreloDeliveries(environment(db), configured()),
    ).resolves.toMatchObject({
      eventReconciled: 1,
      scanned: 0,
      attempted: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(
      db
        .prepare("SELECT status, error FROM processing_events WHERE id = ?")
        .bind("event-summary-repair")
        .first(),
    ).resolves.toEqual({ status: "forwarded", error: null });
  });

  it("reconciles stale ticket and alert claims without sending", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(EVENT_TIME));
    const db = database();
    const deliveries = [];
    for (const [index, actionType] of [
      "create_ticket",
      "create_alert",
    ].entries()) {
      const eventId = `event-stale-${String(index)}`;
      await addEvent(db, eventId);
      const created = await createOrGetDelivery(db, {
        eventId,
        actionIndex: 0,
        actionType: actionType as "create_ticket" | "create_alert",
        payloadSnapshot: {
          schemaVersion: GORELO_DELIVERY_SCHEMA_VERSION,
          region: "aue",
          request:
            actionType === "create_ticket" ? ticketRequest() : alertRequest(),
          data: { variables: {} },
        },
        createdAt: EVENT_TIME,
      });
      await claimDelivery(
        db,
        created.delivery.id,
        created.delivery.version,
        EVENT_TIME,
      );
      deliveries.push(created.delivery.id);
    }
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    vi.setSystemTime(
      new Date(Date.parse(EVENT_TIME) + STALE_GORELO_CLAIM_AGE_MS + 1),
    );

    await expect(
      processPendingGoreloDeliveries(environment(db), configured()),
    ).resolves.toMatchObject({
      reconciled: 2,
      scanned: 0,
      attempted: 0,
      uncertain: 2,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    for (const id of deliveries) {
      await expect(getDelivery(db, id)).resolves.toMatchObject({
        state: "uncertain",
        safeError: "Gorelo delivery claim expired with an uncertain outcome",
        attemptCount: 1,
        attemptHistory: [{ attemptNumber: 1, outcome: "uncertain" }],
      });
    }
  });

  it("terminalizes a malformed pending snapshot instead of rescanning it", async () => {
    const db = database();
    await addEvent(db, "event-invalid-snapshot");
    const created = await createOrGetDelivery(db, {
      eventId: "event-invalid-snapshot",
      actionIndex: 0,
      actionType: "create_ticket",
      payloadSnapshot: {
        schemaVersion: 999,
        region: "aue",
        request: ticketRequest(),
        data: { variables: {} },
      },
    });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      processPendingGoreloDeliveries(environment(db), configured()),
    ).resolves.toMatchObject({
      scanned: 1,
      attempted: 0,
      invalid: 1,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(getDelivery(db, created.delivery.id)).resolves.toMatchObject({
      state: "failed",
      safeError: "Stored Gorelo delivery payload is invalid",
      attemptCount: 1,
    });
    await expect(
      processPendingGoreloDeliveries(environment(db), configured()),
    ).resolves.toMatchObject({ scanned: 0, invalid: 0 });
  });

  it("refuses to redirect a pending create after the configured region changes", async () => {
    const db = database();
    await addEvent(db, "event-region-drift");
    await createOrGetDelivery(db, {
      eventId: "event-region-drift",
      actionIndex: 0,
      actionType: "create_ticket",
      payloadSnapshot: {
        schemaVersion: GORELO_DELIVERY_SCHEMA_VERSION,
        region: "usw",
        request: ticketRequest(),
        data: { variables: {} },
      },
    });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      processPendingGoreloDeliveries(environment(db), configured("aue")),
    ).resolves.toMatchObject({ attempted: 1, failed: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    const detail = await getDelivery(
      db,
      (
        await createOrGetDelivery(db, {
          eventId: "event-region-drift",
          actionIndex: 0,
          actionType: "create_ticket",
          payloadSnapshot: {
            schemaVersion: GORELO_DELIVERY_SCHEMA_VERSION,
            region: "usw",
            request: ticketRequest(),
            data: { variables: {} },
          },
        })
      ).delivery.id,
    );
    expect(detail).toMatchObject({
      state: "failed",
      safeError: "Gorelo API region changed after delivery was created",
    });
  });
});
