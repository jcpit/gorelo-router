import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleFetch } from "../src/api";
import { getEvent, recordEvent } from "../src/repository";
import type { Env, ProcessingEvent, QuarantineState } from "../src/types";

const ADMIN_TOKEN = "test-admin-token-0123456789-abcdef";

class TestStatement {
  private bindings: unknown[] = [];

  constructor(
    private readonly statement: StatementSync,
    readonly query: string,
  ) {}

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
  failNextReleaseCompletion = false;

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
      query,
    ) as unknown as D1PreparedStatement;
  }

  async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    if (
      this.failNextReleaseCompletion &&
      statements.some((statement) =>
        (statement as unknown as TestStatement).query.includes(
          "SET state = 'released'",
        ),
      )
    ) {
      this.failNextReleaseCompletion = false;
      throw new Error("simulated release completion outage");
    }
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

function environment(db: D1Database, overrides: Partial<Env> = {}): Env {
  return {
    DB: db,
    ADMIN_API_TOKEN: ADMIN_TOKEN,
    DEFAULT_GORELO_ADDRESS: "tickets@gorelo.example",
    ALLOWED_FORWARD_DESTINATIONS: "tickets@gorelo.example",
    QUARANTINE_MODE: "internal",
    ARCHIVE_MODE: "all",
    ...overrides,
  };
}

function apiRequest(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Request {
  const headers = new Headers(init.headers);
  if (authenticated) headers.set("authorization", `Bearer ${ADMIN_TOKEN}`);
  if (init.body) headers.set("content-type", "application/json");
  return new Request(`https://worker.example${path}`, {
    ...init,
    headers,
  });
}

async function seedQuarantine(
  db: D1Database,
  options: {
    id?: string;
    state?: QuarantineState;
    version?: number;
    objectKey?: string;
    sha256?: string;
  } = {},
): Promise<ProcessingEvent> {
  const id = options.id ?? crypto.randomUUID();
  const createdAt = "2026-08-08T04:00:00.000Z";
  const event: ProcessingEvent = {
    id,
    messageId: `<${id}@example.com>`,
    envelopeFrom: "sender@example.com",
    envelopeTo: "support@alerts.example.net",
    subject: `Review ${id}`,
    rawSize: 128,
    spamScore: 6,
    spamReasons: ["subject phrase: free money"],
    decision: "quarantine",
    status: "quarantined",
    audit: {
      decisionReason: "spam threshold met",
      spamThreshold: 5,
      mimeParsed: false,
      bodyTruncated: false,
      headers: { "message-id": `<${id}@example.com>` },
      bodyPreview: "",
      attachments: [],
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
      state: options.state ?? "pending",
      version: options.version ?? 1,
      expiresAt: "2099-01-01T00:00:00.000Z",
      rawAvailable: Boolean(options.objectKey),
    },
    createdAt,
  };
  await recordEvent(db, event, {
    ...(options.objectKey ? { objectKey: options.objectKey } : {}),
    ...(options.sha256 ? { sha256: options.sha256 } : {}),
    actor: "system",
  });
  return event;
}

function archivedObject(key: string, raw: Uint8Array): R2ObjectBody {
  const bytes = raw.slice();
  return {
    key,
    size: bytes.byteLength,
    body: new Blob([bytes]).stream(),
    arrayBuffer: async () => bytes.slice().buffer,
  } as unknown as R2ObjectBody;
}

function archiveBucket(
  key: string,
  raw: Uint8Array,
): { bucket: R2Bucket; get: ReturnType<typeof vi.fn> } {
  const get = vi.fn(async (requestedKey: string) =>
    requestedKey === key ? archivedObject(key, raw) : null,
  );
  return { bucket: { get } as unknown as R2Bucket, get };
}

describe("quarantine HTTP API", () => {
  it("reports authenticated runtime capabilities", async () => {
    const archive = archiveBucket("unused", new TextEncoder().encode("unused"));
    const release = {
      send: vi.fn(async () => ({ messageId: "unused" })),
    } as unknown as SendEmail;
    const response = await handleFetch(
      apiRequest("/api/v1/runtime"),
      environment({} as D1Database, {
        MESSAGE_ARCHIVE: archive.bucket,
        RELEASE_EMAIL: release,
        RELEASE_FROM_ADDRESS: "release@alerts.example.net",
        SPAM_ACTION: "quarantine",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      runtime: {
        quarantineMode: "internal",
        archiveMode: "all",
        spamAction: "quarantine",
        features: { rawQuarantine: true, release: true },
      },
    });
  });

  it("lists and reads quarantined messages with review metadata", async () => {
    const db = database();
    const pending = await seedQuarantine(db, { id: "pending-message" });
    await seedQuarantine(db, {
      id: "dismissed-message",
      state: "dismissed",
      version: 2,
    });
    const env = environment(db);

    const listResponse = await handleFetch(
      apiRequest("/api/v1/quarantine?state=pending&limit=10"),
      env,
    );
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      items: [
        {
          id: pending.id,
          quarantine: { state: "pending", version: 1 },
        },
      ],
      summary: { pending: 1, dismissed: 1, releaseFailed: 0, released: 0 },
    });

    const detailResponse = await handleFetch(
      apiRequest(`/api/v1/quarantine/${pending.id}`),
      env,
    );
    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toMatchObject({
      event: {
        id: pending.id,
        audit: { decisionReason: "spam threshold met" },
        quarantine: {
          state: "pending",
          timeline: [{ action: "quarantined", actor: "system" }],
        },
      },
    });
  });

  it("pages and searches the full retained quarantine and audit history", async () => {
    const db = database();
    for (const id of ["history-a", "history-b", "history-c"]) {
      await seedQuarantine(db, { id });
    }
    const env = environment(db);

    const firstResponse = await handleFetch(
      apiRequest("/api/v1/quarantine?state=pending&limit=2"),
      env,
    );
    const first = (await firstResponse.json()) as {
      items: ProcessingEvent[];
      nextCursor: string | null;
    };
    expect(first.items.map((event) => event.id)).toEqual([
      "history-c",
      "history-b",
    ]);
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);

    const secondResponse = await handleFetch(
      apiRequest(
        `/api/v1/quarantine?state=pending&limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`,
      ),
      env,
    );
    await expect(secondResponse.json()).resolves.toMatchObject({
      items: [{ id: "history-a" }],
      nextCursor: null,
    });

    const searchResponse = await handleFetch(
      apiRequest("/api/v1/events?q=HISTORY-A&status=quarantined"),
      env,
    );
    await expect(searchResponse.json()).resolves.toMatchObject({
      events: [{ id: "history-a" }],
      nextCursor: null,
    });

    const invalidCursor = await handleFetch(
      apiRequest("/api/v1/events?cursor=not.a.cursor"),
      env,
    );
    expect(invalidCursor.status).toBe(400);
    const invalidStatus = await handleFetch(
      apiRequest("/api/v1/events?status=unknown"),
      env,
    );
    expect(invalidStatus.status).toBe(400);
  });

  it("rejects an invalid quarantine state", async () => {
    const response = await handleFetch(
      apiRequest("/api/v1/quarantine?state=unknown"),
      environment({} as D1Database),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { title: "Invalid quarantine state" },
    });
  });

  it("protects raw downloads and returns safe attachment headers", async () => {
    const db = database();
    const objectKey = "messages/2026/08/08/raw-message.eml";
    const raw = new TextEncoder().encode(
      "From: sender@example.com\r\nSubject: Test\r\n\r\nBody\r\n",
    );
    const event = await seedQuarantine(db, {
      id: "raw-message",
      objectKey,
    });
    const archive = archiveBucket(objectKey, raw);
    const env = environment(db, { MESSAGE_ARCHIVE: archive.bucket });

    const unauthorized = await handleFetch(
      apiRequest(`/api/v1/quarantine/${event.id}/raw`, {}, false),
      env,
    );
    expect(unauthorized.status).toBe(401);
    expect(archive.get).not.toHaveBeenCalled();

    const response = await handleFetch(
      apiRequest(`/api/v1/quarantine/${event.id}/raw`),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("message/rfc822");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="message-raw-message.eml"',
    );
    expect(response.headers.get("content-length")).toBe(String(raw.byteLength));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; sandbox",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(raw);

    const missingArchive = archiveBucket("another-key", raw);
    const missingResponse = await handleFetch(
      apiRequest(`/api/v1/quarantine/${event.id}/raw`),
      environment(db, { MESSAGE_ARCHIVE: missingArchive.bucket }),
    );
    expect(missingResponse.status).toBe(410);
    await expect(missingResponse.json()).resolves.toMatchObject({
      error: { title: "The retained original is no longer available" },
    });
  });

  it("rejects raw downloads when retained bytes fail digest verification", async () => {
    const db = database();
    const objectKey = "messages/2026/08/08/tampered-message.eml";
    const raw = new TextEncoder().encode(
      "From: sender@example.com\r\nSubject: Tampered\r\n\r\nBody\r\n",
    );
    const event = await seedQuarantine(db, {
      id: "tampered-message",
      objectKey,
      sha256: "0".repeat(64),
    });
    const archive = archiveBucket(objectKey, raw);

    const response = await handleFetch(
      apiRequest(`/api/v1/quarantine/${event.id}/raw`),
      environment(db, { MESSAGE_ARCHIVE: archive.bucket }),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: { title: "Archived message integrity verification failed" },
    });
  });

  it("returns 503 when automated release bindings are missing", async () => {
    const db = database();
    const event = await seedQuarantine(db, { id: "release-message" });
    const response = await handleFetch(
      apiRequest(`/api/v1/quarantine/${event.id}/release`, {
        method: "POST",
        body: JSON.stringify({ version: 1 }),
      }),
      environment(db),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { title: "Automated quarantine release is not configured" },
    });
  });

  it("keeps definite pre-dispatch preparation failures retryable", async () => {
    const db = database();
    const objectKey = "messages/missing-release.eml";
    const event = await seedQuarantine(db, {
      id: "missing-release",
      objectKey,
    });
    const archive = archiveBucket(
      "another-object.eml",
      new TextEncoder().encode("unused"),
    );
    const send = vi.fn(async () => ({ messageId: "must-not-send" }));
    const response = await handleFetch(
      apiRequest(`/api/v1/quarantine/${event.id}/release`, {
        method: "POST",
        body: JSON.stringify({ version: 1 }),
      }),
      environment(db, {
        MESSAGE_ARCHIVE: archive.bucket,
        RELEASE_EMAIL: { send } as unknown as SendEmail,
        RELEASE_FROM_ADDRESS: "release@alerts.example.net",
      }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: { status: 502, title: "Quarantine release preparation failed" },
    });
    expect(send).not.toHaveBeenCalled();
    await expect(getEvent(db, event.id)).resolves.toMatchObject({
      quarantine: {
        state: "release_failed",
        version: 3,
        lastError: "Quarantine release preparation failed",
        timeline: [
          { action: "quarantined" },
          { action: "release_started" },
          { action: "release_failed" },
        ],
      },
    });
  });

  it("blocks retry when dispatch rejects with an ambiguous outcome", async () => {
    const db = database();
    const objectKey = "messages/uncertain-dispatch.eml";
    const raw = new TextEncoder().encode(
      "From: sender@example.com\r\n" +
        "To: alerts@example.net\r\n" +
        "Subject: Alert\r\n\r\n" +
        "Body\r\n",
    );
    const event = await seedQuarantine(db, {
      id: "uncertain-dispatch",
      objectKey,
    });
    const archive = archiveBucket(objectKey, raw);
    const sensitiveUpstreamError =
      "private provider error api-token=do-not-leak";
    const send = vi.fn(async () => {
      throw new Error(sensitiveUpstreamError);
    });
    const env = environment(db, {
      MESSAGE_ARCHIVE: archive.bucket,
      RELEASE_EMAIL: { send } as unknown as SendEmail,
      RELEASE_FROM_ADDRESS: "release@alerts.example.net",
    });

    const response = await handleFetch(
      apiRequest(`/api/v1/quarantine/${event.id}/release`, {
        method: "POST",
        body: JSON.stringify({ version: 1 }),
      }),
      env,
    );
    expect(response.status).toBe(502);
    const responseBody = await response.text();
    expect(responseBody).toContain(
      "Quarantine release outcome is uncertain; manual review is required",
    );
    expect(responseBody).not.toContain(sensitiveUpstreamError);

    const uncertain = await getEvent(db, event.id);
    expect(uncertain).toMatchObject({
      quarantine: {
        state: "releasing",
        version: 3,
        lastError:
          "Release dispatch outcome is uncertain; automatic retry is disabled",
        timeline: [
          { action: "quarantined" },
          { action: "release_started" },
          {
            action: "release_uncertain",
            detail: {
              reason: "dispatch_outcome_unknown",
              expectedVersion: 2,
            },
          },
        ],
      },
    });
    expect(JSON.stringify(uncertain)).not.toContain(sensitiveUpstreamError);

    const retry = await handleFetch(
      apiRequest(`/api/v1/quarantine/${event.id}/release`, {
        method: "POST",
        body: JSON.stringify({ version: 3 }),
      }),
      env,
    );
    expect(retry.status).toBe(409);
    expect(send).toHaveBeenCalledOnce();
  });

  it("blocks retry when Cloudflare accepts but the completion write fails", async () => {
    const testDb = new TestDatabase();
    databases.push(testDb);
    const db = testDb as unknown as D1Database;
    const objectKey = "messages/uncertain-completion.eml";
    const raw = new TextEncoder().encode(
      "From: sender@example.com\r\n" +
        "To: alerts@example.net\r\n" +
        "Subject: Alert\r\n\r\n" +
        "Body\r\n",
    );
    const event = await seedQuarantine(db, {
      id: "uncertain-completion",
      objectKey,
    });
    const archive = archiveBucket(objectKey, raw);
    const send = vi.fn(async () => ({ messageId: "accepted-message-id" }));
    const env = environment(db, {
      MESSAGE_ARCHIVE: archive.bucket,
      RELEASE_EMAIL: { send } as unknown as SendEmail,
      RELEASE_FROM_ADDRESS: "release@alerts.example.net",
    });
    testDb.failNextReleaseCompletion = true;

    const response = await handleFetch(
      apiRequest(`/api/v1/quarantine/${event.id}/release`, {
        method: "POST",
        body: JSON.stringify({ version: 1 }),
      }),
      env,
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        title:
          "Cloudflare accepted the release, but audit completion is uncertain; manual review is required",
      },
    });

    await expect(getEvent(db, event.id)).resolves.toMatchObject({
      quarantine: {
        state: "releasing",
        version: 3,
        releaseMessageId: "accepted-message-id",
        lastError:
          "Cloudflare accepted the release, but audit completion is uncertain; automatic retry is disabled",
        timeline: [
          { action: "quarantined" },
          { action: "release_started" },
          {
            action: "release_uncertain",
            detail: {
              reason: "audit_completion_unknown",
              messageId: "accepted-message-id",
            },
          },
        ],
      },
    });

    const retry = await handleFetch(
      apiRequest(`/api/v1/quarantine/${event.id}/release`, {
        method: "POST",
        body: JSON.stringify({ version: 3 }),
      }),
      env,
    );
    expect(retry.status).toBe(409);
    expect(send).toHaveBeenCalledOnce();
  });

  it("dismisses using the expected version and rejects a stale retry", async () => {
    const db = database();
    const event = await seedQuarantine(db, { id: "dismiss-message" });
    const env = environment(db);
    const headers = {
      "cf-access-authenticated-user-email": "Reviewer@Example.com",
      "cf-access-jwt-assertion": "test-assertion",
    };
    const response = await handleFetch(
      apiRequest(`/api/v1/quarantine/${event.id}/dismiss`, {
        method: "POST",
        headers,
        body: JSON.stringify({ version: 1, note: "Confirmed spam" }),
      }),
      env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      event: {
        id: event.id,
        quarantine: {
          state: "dismissed",
          version: 2,
          reviewer: "reviewer@example.com",
          note: "Confirmed spam",
          timeline: [
            { action: "quarantined" },
            { action: "dismissed", actor: "reviewer@example.com" },
          ],
        },
      },
    });

    const stale = await handleFetch(
      apiRequest(`/api/v1/quarantine/${event.id}/dismiss`, {
        method: "POST",
        body: JSON.stringify({ version: 1 }),
      }),
      env,
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: { title: expect.stringContaining("changed") },
    });
  });
});
