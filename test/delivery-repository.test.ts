import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  DeliveryIdentityConflictError,
  MAX_DELIVERY_PAYLOAD_BYTES,
  claimDelivery,
  createOrGetDelivery,
  digestDeliveryPayload,
  getDelivery,
  getDeliveryByEventAction,
  listClaimableDeliveries,
  listDeliveries,
  markDeliveryFailed,
  markDeliverySucceeded,
  markDeliveryUncertain,
} from "../src/delivery-repository";
import type { DeliveryMutationResult } from "../src/delivery-types";

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

async function addEvent(
  db: D1Database,
  id = crypto.randomUUID(),
): Promise<string> {
  await db
    .prepare(
      `INSERT INTO processing_events
         (id, envelope_from, envelope_to, raw_size, spam_score,
          spam_reasons_json, decision, status, created_at)
       VALUES (?, 'sender@example.com', 'parser@example.net', 100, 0,
               '[]', 'forward', 'forwarded', '2026-08-09T00:00:00.000Z')`,
    )
    .bind(id)
    .run();
  return id;
}

function updated(result: DeliveryMutationResult) {
  if (result.status !== "updated") {
    throw new Error(`Expected updated delivery, received ${result.status}`);
  }
  return result.delivery;
}

afterEach(() => {
  while (databases.length > 0) databases.pop()!.close();
});

describe("outbound delivery repository", () => {
  it("creates idempotently using a stable canonical payload digest", async () => {
    const db = database();
    const eventId = await addEvent(db);
    const first = await createOrGetDelivery(db, {
      eventId,
      actionIndex: 0,
      actionType: "create_ticket",
      parserSnapshotId: "parser:monitoring:3",
      ruleSnapshotId: "rule:printer-offline:8",
      payloadSnapshot: {
        title: "Printer offline",
        fields: { priorityId: 2, clientId: 42 },
      },
      createdAt: "2026-08-09T00:01:00Z",
    });
    const second = await createOrGetDelivery(db, {
      eventId,
      actionIndex: 0,
      actionType: "create_ticket",
      parserSnapshotId: "parser:monitoring:3",
      ruleSnapshotId: "rule:printer-offline:8",
      payloadSnapshot: {
        fields: { clientId: 42, priorityId: 2 },
        title: "Printer offline",
      },
      createdAt: "2026-08-09T00:02:00Z",
    });

    expect(first.status).toBe("created");
    expect(second.status).toBe("existing");
    expect(second.delivery.id).toBe(first.delivery.id);
    expect(second.delivery.payloadDigest).toBe(first.delivery.payloadDigest);
    await expect(digestDeliveryPayload({ b: 2, a: 1 })).resolves.toBe(
      await digestDeliveryPayload({ a: 1, b: 2 }),
    );

    const detail = await getDeliveryByEventAction(db, eventId, 0);
    expect(detail).toMatchObject({
      state: "pending",
      version: 1,
      attemptCount: 0,
      payloadSnapshot: {
        fields: { clientId: 42, priorityId: 2 },
        title: "Printer offline",
      },
      attemptHistory: [],
    });
    await expect(
      createOrGetDelivery(db, {
        eventId,
        actionIndex: 0,
        actionType: "create_ticket",
        parserSnapshotId: "parser:monitoring:3",
        ruleSnapshotId: "rule:printer-offline:8",
        payloadSnapshot: { title: "Changed after retry" },
      }),
    ).rejects.toBeInstanceOf(DeliveryIdentityConflictError);
  });

  it("rejects credential-shaped and oversized payload snapshots", async () => {
    const db = database();
    const eventId = await addEvent(db);
    await expect(
      createOrGetDelivery(db, {
        eventId,
        actionIndex: 0,
        actionType: "create_alert",
        payloadSnapshot: {
          headers: { "X-API-Key": "must-not-be-written" },
        },
      }),
    ).rejects.toThrow(/credentials/);
    await expect(
      createOrGetDelivery(db, {
        eventId,
        actionIndex: 2,
        actionType: "create_alert",
        payloadSnapshot: {
          variables: { smtp_password: "must-not-be-written" },
        },
      }),
    ).rejects.toThrow(/credentials/);
    await expect(
      createOrGetDelivery(db, {
        eventId,
        actionIndex: 1,
        actionType: "forward_email",
        payloadSnapshot: { body: "x".repeat(MAX_DELIVERY_PAYLOAD_BYTES) },
      }),
    ).rejects.toThrow(/UTF-8 bytes/);
    await expect(listDeliveries(db)).resolves.toEqual([]);
  });

  it("isolates claimable Gorelo and webhook work in a mixed backlog", async () => {
    const db = database();
    const eventId = await addEvent(db);
    const webhook = await createOrGetDelivery(db, {
      eventId,
      actionIndex: 0,
      actionType: "send_webhook",
      payloadSnapshot: { eventType: "mail.parsed" },
      createdAt: "2026-08-09T00:00:00Z",
    });
    const ticket = await createOrGetDelivery(db, {
      eventId,
      actionIndex: 1,
      actionType: "create_ticket",
      payloadSnapshot: { title: "Router offline", clientId: 42 },
      createdAt: "2026-08-09T00:01:00Z",
    });
    const alert = await createOrGetDelivery(db, {
      eventId,
      actionIndex: 2,
      actionType: "create_alert",
      payloadSnapshot: { name: "Router offline", clientId: 42 },
      createdAt: "2026-08-09T00:02:00Z",
    });

    await expect(
      listClaimableDeliveries(db, "2026-08-09T01:00:00Z", 1, 3, [
        "create_ticket",
        "create_alert",
      ]),
    ).resolves.toMatchObject([
      { id: ticket.delivery.id, actionType: "create_ticket" },
    ]);
    await expect(
      listClaimableDeliveries(
        db,
        "2026-08-09T01:00:00Z",
        10,
        3,
        ["send_webhook"],
        "forwarded",
      ),
    ).resolves.toMatchObject([
      { id: webhook.delivery.id, actionType: "send_webhook" },
    ]);
    await expect(
      listClaimableDeliveries(db, "2026-08-09T01:00:00Z", 10, 3, [
        "create_alert",
      ]),
    ).resolves.toMatchObject([
      { id: alert.delivery.id, actionType: "create_alert" },
    ]);
  });

  it("claims with CAS, schedules retries, and appends immutable outcomes", async () => {
    const db = database();
    const eventId = await addEvent(db);
    const created = await createOrGetDelivery(db, {
      eventId,
      actionIndex: 0,
      actionType: "create_ticket",
      payloadSnapshot: { title: "Router offline", clientId: 42 },
      createdAt: "2026-08-09T01:00:00Z",
    });
    await expect(
      listClaimableDeliveries(db, "2026-08-09T01:00:01Z"),
    ).resolves.toHaveLength(1);

    const firstClaim = updated(
      await claimDelivery(db, created.delivery.id, 1, "2026-08-09T01:01:00Z"),
    );
    expect(firstClaim).toMatchObject({
      state: "delivering",
      attemptCount: 1,
      version: 2,
    });
    await expect(
      claimDelivery(db, created.delivery.id, 1, "2026-08-09T01:01:01Z"),
    ).resolves.toEqual({ status: "conflict" });

    const failed = updated(
      await markDeliveryFailed(db, created.delivery.id, {
        expectedVersion: 2,
        safeError: "Authorization: Bearer super-secret\nHTTP timeout",
        httpStatus: 503,
        completedAt: "2026-08-09T01:02:00Z",
        nextAttemptAt: "2026-08-09T01:05:00Z",
      }),
    );
    expect(failed).toMatchObject({
      state: "failed",
      attemptCount: 1,
      nextAttemptAt: "2026-08-09T01:05:00.000Z",
      version: 3,
    });
    expect(failed.safeError).not.toContain("super-secret");
    await expect(
      listClaimableDeliveries(db, "2026-08-09T01:04:59Z"),
    ).resolves.toEqual([]);
    await expect(
      claimDelivery(db, created.delivery.id, 3, "2026-08-09T01:04:59Z"),
    ).resolves.toEqual({ status: "not_due" });

    const secondClaim = updated(
      await claimDelivery(db, created.delivery.id, 3, "2026-08-09T01:05:00Z"),
    );
    expect(secondClaim).toMatchObject({
      state: "delivering",
      attemptCount: 2,
      version: 4,
    });
    const succeeded = updated(
      await markDeliverySucceeded(db, created.delivery.id, {
        expectedVersion: 4,
        providerId: "ticket-a26f",
        httpStatus: 201,
        completedAt: "2026-08-09T01:06:00Z",
      }),
    );
    expect(succeeded).toMatchObject({
      state: "succeeded",
      attemptCount: 2,
      providerId: "ticket-a26f",
      version: 5,
    });
    expect(succeeded.safeError).toBeUndefined();

    const detail = await getDelivery(db, created.delivery.id);
    expect(detail?.attemptHistory).toMatchObject([
      {
        attemptNumber: 1,
        outcome: "failed",
        httpStatus: 503,
        startedAt: "2026-08-09T01:01:00.000Z",
        endedAt: "2026-08-09T01:02:00.000Z",
      },
      {
        attemptNumber: 2,
        outcome: "succeeded",
        httpStatus: 201,
        startedAt: "2026-08-09T01:05:00.000Z",
        endedAt: "2026-08-09T01:06:00.000Z",
      },
    ]);
    expect(detail?.attemptHistory[0]?.safeError).not.toContain("super-secret");
    await expect(
      markDeliverySucceeded(db, created.delivery.id, {
        expectedVersion: 4,
        completedAt: "2026-08-09T01:07:00Z",
      }),
    ).resolves.toEqual({ status: "conflict" });
  });

  it("holds ambiguous provider outcomes for manual reconciliation", async () => {
    const db = database();
    const eventId = await addEvent(db);
    const created = await createOrGetDelivery(db, {
      eventId,
      actionIndex: 1,
      actionType: "create_alert",
      payloadSnapshot: {
        clientId: 42,
        severity: 3,
        resource: "SERVER-01",
      },
      createdAt: "2026-08-09T02:00:00Z",
    });
    updated(
      await claimDelivery(db, created.delivery.id, 1, "2026-08-09T02:01:00Z"),
    );
    const uncertain = updated(
      await markDeliveryUncertain(db, created.delivery.id, {
        expectedVersion: 2,
        safeError: "Connection closed after request body was sent",
        completedAt: "2026-08-09T02:02:00Z",
      }),
    );
    expect(uncertain).toMatchObject({
      state: "uncertain",
      attemptCount: 1,
      version: 3,
    });
    await expect(
      listClaimableDeliveries(db, "2026-08-09T03:00:00Z"),
    ).resolves.toEqual([]);
    const listed = await listDeliveries(db, {
      eventId,
      state: "uncertain",
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("payloadSnapshot");
    expect(
      (await getDelivery(db, created.delivery.id))?.attemptHistory,
    ).toMatchObject([{ attemptNumber: 1, outcome: "uncertain" }]);
  });
});
