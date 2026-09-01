import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleFetch } from "../src/api";
import {
  claimMatchingParserCapture,
  createParserCapture,
  finalizeParserCapture,
} from "../src/parser-capture-repository";
import { storeParserSample } from "../src/parser-sample";
import { recordEvent } from "../src/repository";
import type { EmailFacts, Env, ProcessingEvent } from "../src/types";

const ADMIN_TOKEN = "test-admin-token-0123456789-abcdef";

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

class MemoryArchive {
  private readonly objects = new Map<string, Uint8Array>();

  readonly put = vi.fn(async (key: string, value: ArrayBuffer) => {
    this.objects.set(key, new Uint8Array(value).slice());
    return {} as R2Object;
  });

  readonly get = vi.fn(async (key: string) => {
    const stored = this.objects.get(key);
    if (!stored) return null;
    const bytes = stored.slice();
    return {
      key,
      size: bytes.byteLength,
      body: new Blob([bytes]).stream(),
      arrayBuffer: async () => bytes.slice().buffer,
    } as unknown as R2ObjectBody;
  });

  readonly bucket = {
    put: this.put,
    get: this.get,
    delete: vi.fn(async (key: string) => {
      this.objects.delete(key);
    }),
  } as unknown as R2Bucket;
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
  return new Request(`https://worker.example${path}`, { ...init, headers });
}

function event(
  id: string,
  overrides: Partial<ProcessingEvent> = {},
): ProcessingEvent {
  return {
    id,
    messageId: `<${id}@example.net>`,
    envelopeFrom: "alerts@vendor.example",
    envelopeTo: "help@example.net",
    subject: "Server offline",
    rawSize: 256,
    spamScore: 0,
    spamReasons: [],
    decision: "forward",
    destination: "tickets@gorelo.example",
    status: "forwarded",
    audit: {
      decisionReason: "default route",
      spamThreshold: 5,
      mimeParsed: false,
      bodyTruncated: false,
      headers: {},
      bodyPreview: "",
      attachments: [],
      trace: [],
    },
    createdAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

async function seedEvent(
  db: D1Database,
  id: string,
  overrides: Partial<ProcessingEvent> = {},
): Promise<ProcessingEvent> {
  const seeded = event(id, overrides);
  await recordEvent(db, seeded);
  return seeded;
}

function captureBody(sourceEventId: string, recipient = "help@example.net") {
  return {
    sourceEventId,
    match: {
      recipient,
      senderMode: "domain",
      senderValue: "vendor.example",
      subjectContains: "server",
    },
    expiresInSeconds: 900,
  };
}

describe("parser training sample HTTP API", () => {
  it("requires admin authentication", async () => {
    const db = database();
    const eventId = "00000000-0000-4000-8000-000000000101";
    await seedEvent(db, eventId);

    const sampleResponse = await handleFetch(
      apiRequest(`/api/v1/events/${eventId}/training-sample`, {}, false),
      environment(db),
    );
    const captureResponse = await handleFetch(
      apiRequest("/api/v1/parser-captures", {}, false),
      environment(db),
    );

    expect(sampleResponse.status).toBe(401);
    expect(captureResponse.status).toBe(401);
  });

  it("returns a safe unavailable result when no body was retained", async () => {
    const db = database();
    const eventId = "00000000-0000-4000-8000-000000000102";
    await seedEvent(db, eventId);

    const response = await handleFetch(
      apiRequest(`/api/v1/events/${eventId}/training-sample`),
      environment(db),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      sample: {
        eventId,
        from: "alerts@vendor.example",
        to: "help@example.net",
        subject: "Server offline",
        bodyText: "",
        body: { status: "unavailable", source: "none" },
        createdAt: "2026-08-10T00:00:00.000Z",
      },
      canCaptureNext: false,
      warnings: [],
    });
  });

  it("uses the existing audit preview and reports truncation", async () => {
    const db = database();
    const archive = new MemoryArchive();
    const eventId = "00000000-0000-4000-8000-000000000103";
    await seedEvent(db, eventId, {
      audit: {
        decisionReason: "default route",
        spamThreshold: 5,
        mimeParsed: true,
        bodyTruncated: true,
        headers: {},
        bodyPreview: "Device: router-01\nState: offline",
        attachments: [],
        trace: [],
      },
    });

    const response = await handleFetch(
      apiRequest(`/api/v1/events/${eventId}/training-sample`),
      environment(db, { MESSAGE_ARCHIVE: archive.bucket }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sample: {
        eventId,
        bodyText: "Device: router-01\nState: offline",
        body: { status: "truncated", source: "audit_preview" },
      },
      canCaptureNext: true,
      warnings: [],
    });
  });

  it("serves a verified temporary sample without exposing its private locator or digest", async () => {
    const db = database();
    const archive = new MemoryArchive();
    const sourceEventId = "00000000-0000-4000-8000-000000000104";
    const capturedEventId = "00000000-0000-4000-8000-000000000105";
    await seedEvent(db, sourceEventId);
    await seedEvent(db, capturedEventId, {
      subject: "Server offline: branch router",
    });

    const now = Date.now();
    const createdAt = new Date(now - 1_000).toISOString();
    const capturedAt = new Date(now).toISOString();
    const capture = await createParserCapture(db, {
      sourceEventId,
      match: {
        recipient: "help@example.net",
        senderMode: "domain",
        senderValue: "vendor.example",
        subjectContains: "server",
      },
      requestedBy: "admin-api",
      createdAt,
      waitExpiresAt: new Date(now + 15 * 60_000).toISOString(),
    });
    const claim = await claimMatchingParserCapture(
      db,
      {
        eventId: capturedEventId,
        envelopeFrom: "alerts@vendor.example",
        envelopeTo: "help@example.net",
        subject: "Server offline: branch router",
      },
      capturedAt,
    );
    if (claim.status !== "claimed") throw new Error("capture was not claimed");

    const facts: EmailFacts = {
      envelopeFrom: "alerts@vendor.example",
      fromDomain: "vendor.example",
      envelopeTo: "help@example.net",
      toLocalPart: "help",
      subject: "Server offline: branch router",
      bodyText: "Device: router-01\nState: offline\nClient: Example Co",
      headers: {},
      attachments: [],
      hasAttachments: false,
      messageId: "<capture@example.net>",
      rawSize: 256,
      mimeParsed: true,
    };
    const stored = await storeParserSample(
      archive.bucket,
      capturedEventId,
      facts,
      capturedAt,
    );
    const finalized = await finalizeParserCapture(db, capture.id, {
      expectedVersion: claim.capture.version,
      claimEventId: capturedEventId,
      capturedEventId,
      objectKey: stored.objectKey,
      sha256: stored.sha256,
      size: stored.size,
      capturedAt,
      sampleExpiresAt: new Date(now + 30 * 60_000).toISOString(),
    });
    expect(finalized.status).toBe("updated");

    const response = await handleFetch(
      apiRequest(`/api/v1/events/${capturedEventId}/training-sample`),
      environment(db, { MESSAGE_ARCHIVE: archive.bucket }),
    );
    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({
      sample: {
        eventId: capturedEventId,
        from: "alerts@vendor.example",
        to: "help@example.net",
        subject: "Server offline: branch router",
        bodyText: "Device: router-01\nState: offline\nClient: Example Co",
        body: {
          status: "complete",
          source: "temporary_capture",
        },
      },
      canCaptureNext: true,
      warnings: [],
    });

    const statusResponse = await handleFetch(
      apiRequest(`/api/v1/parser-captures/${capture.id}`),
      environment(db, { MESSAGE_ARCHIVE: archive.bucket }),
    );
    expect(statusResponse.status).toBe(200);
    const statusBody = await statusResponse.json();
    expect(statusBody).toMatchObject({
      capture: {
        id: capture.id,
        state: "captured",
        capturedEventId,
        sampleAvailable: true,
      },
    });
    const publicResponses = JSON.stringify([responseBody, statusBody]);
    expect(publicResponses).not.toContain("parser-samples/");
    expect(publicResponses).not.toContain(stored.objectKey);
    expect(publicResponses).not.toContain(stored.sha256);
    expect(publicResponses).not.toMatch(/sample_(object_key|sha256)/i);
  });
});

describe("parser capture HTTP API", () => {
  it("requires a private archive binding and an existing source event", async () => {
    const db = database();
    const sourceEventId = "00000000-0000-4000-8000-000000000201";
    await seedEvent(db, sourceEventId);

    const noArchive = await handleFetch(
      apiRequest("/api/v1/parser-captures", {
        method: "POST",
        body: JSON.stringify(captureBody(sourceEventId)),
      }),
      environment(db),
    );
    expect(noArchive.status).toBe(503);

    const archive = new MemoryArchive();
    const missingEvent = await handleFetch(
      apiRequest("/api/v1/parser-captures", {
        method: "POST",
        body: JSON.stringify(
          captureBody("00000000-0000-4000-8000-000000000299"),
        ),
      }),
      environment(db, { MESSAGE_ARCHIVE: archive.bucket }),
    );
    expect(missingEvent.status).toBe(404);
  });

  it.each([
    {
      name: "requires senderValue for a domain match",
      match: {
        recipient: "help@example.net",
        senderMode: "domain",
      },
    },
    {
      name: "forbids senderValue for an any-sender match",
      match: {
        recipient: "help@example.net",
        senderMode: "any",
        senderValue: "vendor.example",
      },
    },
  ])("validates match invariants: $name", async ({ match }) => {
    const db = database();
    const archive = new MemoryArchive();
    const sourceEventId = "00000000-0000-4000-8000-000000000202";
    await seedEvent(db, sourceEventId);

    const response = await handleFetch(
      apiRequest("/api/v1/parser-captures", {
        method: "POST",
        body: JSON.stringify({
          sourceEventId,
          match,
          expiresInSeconds: 900,
        }),
      }),
      environment(db, { MESSAGE_ARCHIVE: archive.bucket }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { title: "Validation failed" },
    });
  });

  it("creates, lists, reads, conflicts, and cancels using versioned public metadata", async () => {
    const db = database();
    const archive = new MemoryArchive();
    const sourceEventId = "00000000-0000-4000-8000-000000000203";
    await seedEvent(db, sourceEventId);
    const env = environment(db, { MESSAGE_ARCHIVE: archive.bucket });

    const createResponse = await handleFetch(
      apiRequest("/api/v1/parser-captures", {
        method: "POST",
        body: JSON.stringify(captureBody(sourceEventId)),
      }),
      env,
    );
    expect(createResponse.status).toBe(201);
    const createdBody = (await createResponse.json()) as {
      capture: { id: string; version: number };
    };
    expect(createdBody).toMatchObject({
      capture: {
        sourceEventId,
        state: "pending",
        requestedBy: "admin-api",
        match: {
          recipient: "help@example.net",
          senderMode: "domain",
          senderValue: "vendor.example",
          subjectContains: "server",
        },
        sampleAvailable: false,
        version: 1,
      },
    });

    const serializedCreate = JSON.stringify(createdBody);
    expect(serializedCreate).not.toMatch(/objectKey|sha256|sample_object/i);

    const conflict = await handleFetch(
      apiRequest("/api/v1/parser-captures", {
        method: "POST",
        body: JSON.stringify(captureBody(sourceEventId)),
      }),
      env,
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { details: { code: "capture_already_active" } },
    });

    const list = await handleFetch(apiRequest("/api/v1/parser-captures"), env);
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({
      captures: [{ id: createdBody.capture.id, state: "pending" }],
    });

    const status = await handleFetch(
      apiRequest(`/api/v1/parser-captures/${createdBody.capture.id}`),
      env,
    );
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({
      capture: { id: createdBody.capture.id, state: "pending", version: 1 },
    });

    const staleCancel = await handleFetch(
      apiRequest(`/api/v1/parser-captures/${createdBody.capture.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ version: createdBody.capture.version + 1 }),
      }),
      env,
    );
    expect(staleCancel.status).toBe(409);

    const cancel = await handleFetch(
      apiRequest(`/api/v1/parser-captures/${createdBody.capture.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ version: createdBody.capture.version }),
      }),
      env,
    );
    expect(cancel.status).toBe(200);
    await expect(cancel.json()).resolves.toMatchObject({
      capture: {
        id: createdBody.capture.id,
        state: "cancelled",
        sampleAvailable: false,
        version: 2,
      },
    });

    const secondCancel = await handleFetch(
      apiRequest(`/api/v1/parser-captures/${createdBody.capture.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ version: 2 }),
      }),
      env,
    );
    expect(secondCancel.status).toBe(409);
  });
});
