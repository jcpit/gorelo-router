import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  ActiveParserCaptureError,
  MAX_ACTIVE_PARSER_CAPTURES,
  ParserCaptureLimitError,
  cancelParserCapture,
  claimMatchingParserCapture,
  createParserCapture,
  deleteTerminalParserCapturesBefore,
  expireCapturedParserCapture,
  expirePendingParserCaptures,
  failParserCapture,
  finalizeParserCapture,
  getParserCapture,
  getParserCaptureStorage,
  listExpiredParserCaptureSamples,
  listParserCaptures,
  recoverStaleParserCaptureClaims,
  updatePendingParserCapture,
  type ParserCapture,
  type ParserCaptureMutationResult,
} from "../src/parser-capture-repository";

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

async function addEvent(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO processing_events
         (id, envelope_from, envelope_to, raw_size, spam_score,
          spam_reasons_json, decision, status, created_at)
       VALUES (?, 'alerts@vendor.example', 'help@example.net', 100, 0,
               '[]', 'forward', 'forwarded', '2026-08-10T00:00:00.000Z')`,
    )
    .bind(id)
    .run();
}

function updated(result: ParserCaptureMutationResult): ParserCapture {
  if (result.status !== "updated") {
    throw new Error(`Expected updated capture, received ${result.status}`);
  }
  return result.capture;
}

async function capture(
  db: D1Database,
  overrides: Partial<Parameters<typeof createParserCapture>[1]> = {},
): Promise<ParserCapture> {
  return createParserCapture(db, {
    match: {
      recipient: "help@example.net",
      senderMode: "domain",
      senderValue: "vendor.example",
      subjectContains: "server",
    },
    requestedBy: "operator@example.net",
    createdAt: "2026-08-10T00:00:00.000Z",
    waitExpiresAt: "2026-08-10T00:15:00.000Z",
    ...overrides,
  });
}

async function claimedCapture(
  db: D1Database,
  eventId: string,
): Promise<ParserCapture> {
  const created = await capture(db);
  const result = await claimMatchingParserCapture(
    db,
    {
      eventId,
      envelopeFrom: "alerts@vendor.example",
      envelopeTo: "HELP@example.net",
      subject: "SERVER offline",
    },
    "2026-08-10T00:01:00.000Z",
  );
  expect(result.status).toBe("claimed");
  if (result.status !== "claimed") throw new Error("capture was not claimed");
  expect(result.capture.id).toBe(created.id);
  return result.capture;
}

afterEach(() => {
  while (databases.length > 0) databases.pop()!.close();
});

describe("parser capture repository", () => {
  it("creates, lists, edits, and cancels bounded public metadata", async () => {
    const db = database();
    await addEvent(db, "source-event");
    const created = await capture(db, { sourceEventId: "source-event" });

    expect(created).toMatchObject({
      sourceEventId: "source-event",
      state: "pending",
      match: {
        recipient: "help@example.net",
        senderMode: "domain",
        senderValue: "vendor.example",
        subjectContains: "server",
      },
      sampleAvailable: false,
      version: 1,
    });
    expect(
      await listParserCaptures(db, { sourceEventId: "source-event" }),
    ).toEqual([created]);

    const edited = updated(
      await updatePendingParserCapture(db, created.id, {
        expectedVersion: 1,
        match: {
          recipient: "parser@example.net",
          senderMode: "address",
          senderValue: "Alerts@Vendor.Example",
        },
        updatedAt: "2026-08-10T00:02:00.000Z",
        waitExpiresAt: "2026-08-10T00:20:00.000Z",
      }),
    );
    expect(edited).toMatchObject({
      version: 2,
      match: {
        recipient: "parser@example.net",
        senderMode: "address",
        senderValue: "alerts@vendor.example",
      },
    });
    await expect(
      updatePendingParserCapture(db, created.id, {
        expectedVersion: 1,
        match: edited.match,
        updatedAt: "2026-08-10T00:03:00.000Z",
        waitExpiresAt: "2026-08-10T00:25:00.000Z",
      }),
    ).resolves.toEqual({ status: "conflict" });

    const cancelled = updated(
      await cancelParserCapture(db, created.id, 2, "2026-08-10T00:03:00.000Z"),
    );
    expect(cancelled).toMatchObject({ state: "cancelled", version: 3 });
    expect(JSON.stringify(cancelled)).not.toMatch(
      /objectKey|sha256|claimEventId/,
    );
  });

  it("enforces one active request per recipient and the global active cap", async () => {
    const db = database();
    await capture(db);
    await expect(capture(db)).rejects.toBeInstanceOf(ActiveParserCaptureError);

    for (let index = 1; index < MAX_ACTIVE_PARSER_CAPTURES; index += 1) {
      await capture(db, {
        match: {
          recipient: `help-${String(index)}@example.net`,
          senderMode: "any",
        },
      });
    }
    await expect(
      capture(db, {
        match: { recipient: "over-limit@example.net", senderMode: "any" },
      }),
    ).rejects.toBeInstanceOf(ParserCaptureLimitError);
  });

  it("expires elapsed pending requests before admitting replacements", async () => {
    const db = database();
    const elapsed = await capture(db, {
      waitExpiresAt: "2026-08-10T00:05:00.000Z",
    });
    const replacement = await capture(db, {
      createdAt: "2026-08-10T00:06:00.000Z",
      waitExpiresAt: "2026-08-10T00:21:00.000Z",
    });

    expect(replacement.id).not.toBe(elapsed.id);
    expect(await getParserCapture(db, elapsed.id)).toMatchObject({
      state: "expired",
      version: 2,
    });
    await expect(
      updatePendingParserCapture(db, elapsed.id, {
        expectedVersion: 2,
        match: elapsed.match,
        updatedAt: "2026-08-10T00:07:00.000Z",
        waitExpiresAt: "2026-08-10T00:22:00.000Z",
      }),
    ).resolves.toEqual({ status: "conflict" });
  });

  it("validates bounded matching and retention inputs before persistence", async () => {
    const db = database();
    await expect(
      capture(db, {
        match: {
          recipient: "help@example.net",
          senderMode: "any",
          senderValue: "vendor.example",
        },
      }),
    ).rejects.toThrow(/not allowed/);
    await expect(
      capture(db, {
        match: {
          recipient: "help@example.net",
          senderMode: "domain",
          senderValue: "not a domain",
        },
      }),
    ).rejects.toThrow(/invalid/);
    await expect(
      capture(db, {
        match: {
          recipient: "help@example.net",
          senderMode: "any",
          subjectContains: "x".repeat(201),
        },
      }),
    ).rejects.toThrow(/200/);
    await expect(
      capture(db, { waitExpiresAt: "2026-08-10T02:00:00.000Z" }),
    ).rejects.toThrow(/within one hour/);
    await expect(listParserCaptures(db)).resolves.toEqual([]);
  });

  it("claims only a fully matching next message and only once", async () => {
    const db = database();
    const created = await capture(db);
    await expect(
      claimMatchingParserCapture(
        db,
        {
          eventId: "wrong-sender",
          envelopeFrom: "alerts@other.example",
          envelopeTo: "help@example.net",
          subject: "Server offline",
        },
        "2026-08-10T00:01:00.000Z",
      ),
    ).resolves.toEqual({ status: "none" });
    await expect(
      claimMatchingParserCapture(
        db,
        {
          eventId: "wrong-subject",
          envelopeFrom: "alerts@vendor.example",
          envelopeTo: "help@example.net",
          subject: "Everything is fine",
        },
        "2026-08-10T00:01:00.000Z",
      ),
    ).resolves.toEqual({ status: "none" });

    const attempts = await Promise.all([
      claimMatchingParserCapture(
        db,
        {
          eventId: "incoming-one",
          envelopeFrom: "alerts@vendor.example",
          envelopeTo: "HELP@example.net",
          subject: "Critical SERVER outage",
        },
        "2026-08-10T00:02:00.000Z",
      ),
      claimMatchingParserCapture(
        db,
        {
          eventId: "incoming-two",
          envelopeFrom: "alerts@vendor.example",
          envelopeTo: "help@example.net",
          subject: "Critical server outage",
        },
        "2026-08-10T00:02:00.000Z",
      ),
    ]);
    expect(
      attempts.filter((result) => result.status === "claimed"),
    ).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "none")).toHaveLength(
      1,
    );
    expect(await getParserCapture(db, created.id)).toMatchObject({
      state: "claimed",
      version: 2,
    });
    expect(
      JSON.stringify(await getParserCapture(db, created.id)),
    ).not.toContain("incoming-");
  });

  it("finalizes a claim with private storage while exposing only safe metadata", async () => {
    const db = database();
    const claimed = await claimedCapture(db, "captured-event");
    await addEvent(db, "captured-event");
    const objectKey = `parser-samples/2026/08/10/${claimed.id}.json`;
    const digest = "a".repeat(64);
    const finalized = updated(
      await finalizeParserCapture(db, claimed.id, {
        expectedVersion: claimed.version,
        claimEventId: "captured-event",
        capturedEventId: "captured-event",
        objectKey,
        sha256: digest,
        size: 1024,
        capturedAt: "2026-08-10T00:02:00.000Z",
        sampleExpiresAt: "2026-08-10T00:32:00.000Z",
      }),
    );

    expect(finalized).toMatchObject({
      state: "captured",
      capturedEventId: "captured-event",
      sampleAvailable: true,
      version: 3,
    });
    expect(JSON.stringify(finalized)).not.toContain(objectKey);
    expect(JSON.stringify(finalized)).not.toContain(digest);
    await expect(
      getParserCaptureStorage(db, claimed.id, "2026-08-10T00:10:00.000Z"),
    ).resolves.toEqual({
      captureId: claimed.id,
      capturedEventId: "captured-event",
      objectKey,
      sha256: digest,
      size: 1024,
      expiresAt: "2026-08-10T00:32:00.000Z",
      version: 3,
    });
    await expect(
      getParserCaptureStorage(db, claimed.id, "2026-08-10T00:32:00.000Z"),
    ).resolves.toBeNull();
    await expect(
      finalizeParserCapture(db, claimed.id, {
        expectedVersion: claimed.version,
        claimEventId: "captured-event",
        capturedEventId: "captured-event",
        objectKey,
        sha256: digest,
        size: 1024,
        capturedAt: "2026-08-10T00:02:00.000Z",
        sampleExpiresAt: "2026-08-10T00:32:00.000Z",
      }),
    ).resolves.toEqual({ status: "conflict" });
  });

  it("fails a claimed capture with a bounded machine code", async () => {
    const db = database();
    const claimed = await claimedCapture(db, "failed-event");
    await expect(
      failParserCapture(db, claimed.id, {
        expectedVersion: claimed.version,
        claimEventId: "failed-event",
        safeErrorCode: "API key was leaked",
        failedAt: "2026-08-10T00:02:00.000Z",
      }),
    ).rejects.toThrow(/machine code/);
    const failed = updated(
      await failParserCapture(db, claimed.id, {
        expectedVersion: claimed.version,
        claimEventId: "failed-event",
        safeErrorCode: "sample_parse_failed",
        failedAt: "2026-08-10T00:02:00.000Z",
      }),
    );
    expect(failed).toMatchObject({
      state: "failed",
      safeErrorCode: "sample_parse_failed",
      version: 3,
    });
  });

  it("recovers stale claims and expires stale or unclaimed requests", async () => {
    const db = database();
    const recoverable = await capture(db, {
      match: { recipient: "recover@example.net", senderMode: "any" },
    });
    await claimMatchingParserCapture(
      db,
      {
        eventId: "recover-event",
        envelopeFrom: "sender@example.org",
        envelopeTo: "recover@example.net",
        subject: "Anything",
      },
      "2026-08-10T00:01:00.000Z",
    );
    const expiring = await capture(db, {
      match: { recipient: "expire-claim@example.net", senderMode: "any" },
      waitExpiresAt: "2026-08-10T00:05:00.000Z",
    });
    await claimMatchingParserCapture(
      db,
      {
        eventId: "expire-event",
        envelopeFrom: "sender@example.org",
        envelopeTo: "expire-claim@example.net",
        subject: "Anything",
      },
      "2026-08-10T00:01:00.000Z",
    );
    const pending = await capture(db, {
      match: { recipient: "pending@example.net", senderMode: "any" },
      waitExpiresAt: "2026-08-10T00:05:00.000Z",
    });

    await expect(
      recoverStaleParserCaptureClaims(db, {
        staleBefore: "2026-08-10T00:02:00.000Z",
        recoveredAt: "2026-08-10T00:10:00.000Z",
      }),
    ).resolves.toEqual({ recovered: 1, expired: 1 });
    expect(await getParserCapture(db, recoverable.id)).toMatchObject({
      state: "pending",
      version: 3,
    });
    expect(await getParserCapture(db, expiring.id)).toMatchObject({
      state: "expired",
      version: 3,
    });
    await expect(
      expirePendingParserCaptures(db, "2026-08-10T00:10:00.000Z"),
    ).resolves.toBe(1);
    expect(await getParserCapture(db, pending.id)).toMatchObject({
      state: "expired",
      version: 2,
    });
  });

  it("lists expired private objects for delete-first cleanup", async () => {
    const db = database();
    const claimed = await claimedCapture(db, "cleanup-event");
    await addEvent(db, "cleanup-event");
    const objectKey = `parser-samples/2026/08/10/${claimed.id}.json`;
    const captured = updated(
      await finalizeParserCapture(db, claimed.id, {
        expectedVersion: claimed.version,
        claimEventId: "cleanup-event",
        capturedEventId: "cleanup-event",
        objectKey,
        sha256: "b".repeat(64),
        size: 2048,
        capturedAt: "2026-08-10T00:02:00.000Z",
        sampleExpiresAt: "2026-08-10T00:12:00.000Z",
      }),
    );

    await expect(
      expireCapturedParserCapture(
        db,
        captured.id,
        captured.version,
        "2026-08-10T00:11:00.000Z",
      ),
    ).resolves.toEqual({ status: "not_due" });
    await expect(
      listExpiredParserCaptureSamples(db, "2026-08-10T00:13:00.000Z"),
    ).resolves.toEqual([
      {
        captureId: captured.id,
        capturedEventId: "cleanup-event",
        objectKey,
        sha256: "b".repeat(64),
        size: 2048,
        expiresAt: "2026-08-10T00:12:00.000Z",
        version: captured.version,
      },
    ]);

    const expired = updated(
      await expireCapturedParserCapture(
        db,
        captured.id,
        captured.version,
        "2026-08-10T00:13:00.000Z",
      ),
    );
    expect(expired).toMatchObject({
      state: "expired",
      capturedEventId: "cleanup-event",
      sampleAvailable: false,
      version: 4,
    });
    await expect(getParserCaptureStorage(db, captured.id)).resolves.toBeNull();
    await expect(
      deleteTerminalParserCapturesBefore(db, "2026-08-10T00:14:00.000Z"),
    ).resolves.toBe(1);
    await expect(getParserCapture(db, captured.id)).resolves.toBeNull();
  });
});
