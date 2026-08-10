import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  beginQuarantineRelease,
  completeQuarantineRelease,
  deleteEventsBefore,
  dismissQuarantine,
  failQuarantineRelease,
  getEvent,
  getEventStorage,
  getQuarantineStorage,
  listEvents,
  listEventsPage,
  listExpiredArchiveKeys,
  listQuarantine,
  listQuarantinePage,
  markQuarantineReleaseUncertain,
  recordEvent,
} from "../src/repository";
import type { ProcessingEvent } from "../src/types";

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

function database(): D1Database {
  const db = new TestDatabase();
  databases.push(db);
  return db as unknown as D1Database;
}

afterEach(() => {
  while (databases.length > 0) databases.pop()!.close();
});

function processingEvent(
  overrides: Partial<ProcessingEvent> = {},
): ProcessingEvent {
  const createdAt = "2026-08-08T04:00:00.000Z";
  return {
    id: crypto.randomUUID(),
    messageId: "<message@example.com>",
    envelopeFrom: "sender@example.com",
    envelopeTo: "support@alerts.example.net",
    subject: "Printer alert",
    rawSize: 1_024,
    spamScore: 6,
    spamReasons: ["subject phrase: free money"],
    decision: "quarantine",
    status: "quarantined",
    audit: {
      decisionReason: "spam threshold met",
      spamThreshold: 5,
      mimeParsed: true,
      bodyTruncated: false,
      headers: { "message-id": "<message@example.com>" },
      bodyPreview: "Review this message",
      attachments: [
        { filename: "alert.txt", mimeType: "text/plain", size: 12 },
      ],
      trace: [
        {
          stage: "decision",
          outcome: "warning",
          detail: "Held for review",
          at: createdAt,
        },
      ],
    },
    quarantine: {
      state: "pending",
      version: 1,
      expiresAt: "2026-09-07T04:00:00.000Z",
      rawAvailable: true,
    },
    createdAt,
    ...overrides,
  };
}

describe("processing event review repository", () => {
  it("stores audit and private quarantine archive metadata", async () => {
    const db = database();
    const event = processingEvent();
    await recordEvent(db, event, {
      objectKey: `messages/2026/08/08/${event.id}.eml`,
      sha256: "abc123",
    });

    const [listed] = await listEvents(db, 10);
    expect(listed).toMatchObject({
      id: event.id,
      audit: {
        decisionReason: "spam threshold met",
        rawAvailable: true,
      },
      quarantine: { state: "pending", version: 1, rawAvailable: true },
    });
    expect(JSON.stringify(listed)).not.toContain("messages/2026");

    const detail = await getEvent(db, event.id);
    expect(detail?.quarantine?.timeline?.map((entry) => entry.action)).toEqual([
      "quarantined",
    ]);
    await expect(getEventStorage(db, event.id)).resolves.toEqual({
      objectKey: `messages/2026/08/08/${event.id}.eml`,
      sha256: "abc123",
    });
    await expect(getQuarantineStorage(db, event.id)).resolves.toMatchObject({
      eventId: event.id,
      objectKey: `messages/2026/08/08/${event.id}.eml`,
      state: "pending",
      version: 1,
    });
    await expect(
      listQuarantine(db, { state: "pending" }),
    ).resolves.toHaveLength(1);
  });

  it("uses state and version guards for release and dismissal", async () => {
    const db = database();
    const event = processingEvent();
    await recordEvent(db, event, { objectKey: `messages/${event.id}.eml` });

    const started = await beginQuarantineRelease(
      db,
      event.id,
      1,
      "Tickets@Gorelo.Example",
      "Looks legitimate",
      "reviewer@example.com",
    );
    expect(started).toMatchObject({
      status: "updated",
      review: { state: "releasing", version: 2 },
    });
    await expect(
      beginQuarantineRelease(
        db,
        event.id,
        1,
        "tickets@gorelo.example",
        undefined,
        "reviewer@example.com",
      ),
    ).resolves.toEqual({ status: "conflict" });

    const failed = await failQuarantineRelease(
      db,
      event.id,
      2,
      "temporary\nSMTP failure",
      "reviewer@example.com",
    );
    expect(failed).toMatchObject({
      status: "updated",
      review: {
        state: "release_failed",
        version: 3,
        lastError: "temporary SMTP failure",
      },
    });
    await beginQuarantineRelease(
      db,
      event.id,
      3,
      "tickets@gorelo.example",
      undefined,
      "reviewer@example.com",
    );
    const completed = await completeQuarantineRelease(
      db,
      event.id,
      4,
      "released-message-id",
      "reviewer@example.com",
    );
    expect(completed).toMatchObject({
      status: "updated",
      review: {
        state: "released",
        version: 5,
        releaseMessageId: "released-message-id",
      },
    });
    await expect(
      dismissQuarantine(db, event.id, 5, "Too late", "reviewer@example.com"),
    ).resolves.toEqual({ status: "conflict" });

    const actions = (await getEvent(db, event.id))?.quarantine?.timeline?.map(
      (entry) => entry.action,
    );
    expect(actions).toEqual([
      "quarantined",
      "release_started",
      "release_failed",
      "release_started",
      "released",
    ]);
  });

  it("keeps an uncertain post-dispatch release non-actionable", async () => {
    const db = database();
    const event = processingEvent();
    await recordEvent(db, event, { objectKey: `messages/${event.id}.eml` });

    const started = await beginQuarantineRelease(
      db,
      event.id,
      1,
      "tickets@gorelo.example",
      undefined,
      "reviewer@example.com",
    );
    expect(started.status).toBe("updated");

    const uncertain = await markQuarantineReleaseUncertain(
      db,
      event.id,
      2,
      "audit_completion_unknown",
      "reviewer@example.com",
      "accepted-message-id",
    );
    expect(uncertain).toMatchObject({
      status: "updated",
      review: {
        state: "releasing",
        version: 3,
        releaseMessageId: "accepted-message-id",
        lastError:
          "Cloudflare accepted the release, but audit completion is uncertain; automatic retry is disabled",
      },
    });

    await expect(
      beginQuarantineRelease(
        db,
        event.id,
        3,
        "tickets@gorelo.example",
        undefined,
        "reviewer@example.com",
      ),
    ).resolves.toEqual({ status: "conflict" });
    await expect(
      dismissQuarantine(
        db,
        event.id,
        3,
        "Do not mutate an ambiguous release",
        "reviewer@example.com",
      ),
    ).resolves.toEqual({ status: "conflict" });

    const review = (await getEvent(db, event.id))?.quarantine;
    expect(review?.timeline?.map((entry) => entry.action)).toEqual([
      "quarantined",
      "release_started",
      "release_uncertain",
    ]);
    expect(review?.timeline?.at(-1)?.detail).toEqual({
      reason: "audit_completion_unknown",
      expectedVersion: 2,
      messageId: "accepted-message-id",
    });
  });

  it("paginates and searches retained events without gaps or duplicates", async () => {
    const db = database();
    for (const id of ["event-a", "event-b", "event-c", "event-d"]) {
      const event = processingEvent({
        id,
        subject: id === "event-b" ? "Needle in retained history" : id,
        status: id === "event-a" ? "failed" : "quarantined",
        quarantine: {
          state: id === "event-c" ? "dismissed" : "pending",
          version: 1,
          expiresAt: "2026-09-07T04:00:00.000Z",
          rawAvailable: false,
        },
      });
      await recordEvent(db, event);
    }

    const first = await listEventsPage(db, { limit: 2 });
    expect(first.items.map((event) => event.id)).toEqual([
      "event-d",
      "event-c",
    ]);
    expect(first.nextCursor).toEqual({
      createdAt: "2026-08-08T04:00:00.000Z",
      id: "event-c",
    });

    const second = await listEventsPage(db, {
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items.map((event) => event.id)).toEqual([
      "event-b",
      "event-a",
    ]);
    expect(second.nextCursor).toBeUndefined();

    await expect(
      listEventsPage(db, { query: "NEEDLE" }),
    ).resolves.toMatchObject({ items: [{ id: "event-b" }] });
    await expect(
      listEventsPage(db, { status: "failed" }),
    ).resolves.toMatchObject({ items: [{ id: "event-a" }] });
    await expect(
      listQuarantinePage(db, { state: "dismissed", query: "EVENT-C" }),
    ).resolves.toMatchObject({ items: [{ id: "event-c" }] });
  });

  it("lists archive keys before deleting retained events", async () => {
    const db = database();
    const oldEvent = processingEvent({
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    delete oldEvent.quarantine;
    const recentEvent = processingEvent({
      createdAt: "2026-08-08T00:00:00.000Z",
    });
    delete recentEvent.quarantine;
    await recordEvent(db, oldEvent, {
      objectKey: `messages/${oldEvent.id}.eml`,
    });
    await recordEvent(db, recentEvent, {
      objectKey: `messages/${recentEvent.id}.eml`,
    });

    await expect(
      listExpiredArchiveKeys(db, "2026-02-01T00:00:00.000Z"),
    ).resolves.toEqual([
      { eventId: oldEvent.id, objectKey: `messages/${oldEvent.id}.eml` },
    ]);
    await expect(
      deleteEventsBefore(db, "2026-02-01T00:00:00.000Z"),
    ).resolves.toBe(1);
    await expect(getEvent(db, oldEvent.id)).resolves.toBeNull();
    await expect(getEvent(db, recentEvent.id)).resolves.not.toBeNull();
  });
});
