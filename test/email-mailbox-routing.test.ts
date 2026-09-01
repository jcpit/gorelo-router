import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleEmail } from "../src/email-handler";
import {
  createGoreloMailbox,
  ensureInitialGoreloMailbox,
} from "../src/mailbox-repository";
import {
  createParserCapture,
  getParserCapture,
  getParserCaptureStorage,
} from "../src/parser-capture-repository";
import { readParserSample } from "../src/parser-sample";
import { createRule, getEvent } from "../src/repository";
import type { Env } from "../src/types";
import { ruleInputSchema } from "../src/validation";

const DEFAULT_MAILBOX_ID = "00000000-0000-4000-8000-000000000001";
const DEFAULT_ADDRESS = "tickets@gorelo.example";
const ALERTS_ADDRESS = "alerts@gorelo.example";

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

interface TestArchive {
  readonly bucket: R2Bucket;
  readonly objects: Map<string, Uint8Array>;
  readonly put: ReturnType<typeof vi.fn>;
}

const databases: TestDatabase[] = [];

function database(): D1Database {
  const instance = new TestDatabase();
  databases.push(instance);
  return instance as unknown as D1Database;
}

function archive(): TestArchive {
  const objects = new Map<string, Uint8Array>();
  const put = vi.fn(async (key: string, value: ArrayBuffer) => {
    objects.set(key, new Uint8Array(value));
    return {} as R2Object;
  });
  const get = vi.fn(async (key: string) => {
    const value = objects.get(key);
    if (!value) return null;
    return {
      size: value.byteLength,
      body: new Blob([value]).stream(),
      async arrayBuffer() {
        return value.slice().buffer;
      },
    } as unknown as R2ObjectBody;
  });
  const remove = vi.fn(async (key: string | string[]) => {
    for (const item of Array.isArray(key) ? key : [key]) objects.delete(item);
  });
  return {
    bucket: { put, get, delete: remove } as unknown as R2Bucket,
    objects,
    put,
  };
}

function environment(db: D1Database, bucket?: R2Bucket): Env {
  return {
    DB: db,
    ...(bucket ? { MESSAGE_ARCHIVE: bucket } : {}),
    DEFAULT_GORELO_ADDRESS: DEFAULT_ADDRESS,
    ALLOWED_FORWARD_DESTINATIONS: DEFAULT_ADDRESS,
  };
}

function message(
  subject: string,
  body = "Host: edge-01\r\nStatus: offline\r\n",
  canBeForwarded = true,
): {
  inbound: ForwardableEmailMessage;
  forward: ReturnType<typeof vi.fn>;
  setReject: ReturnType<typeof vi.fn>;
} {
  const raw = new TextEncoder().encode(
    [
      "From: Monitor <monitor@vendor.example>",
      "To: support@alerts.example.net",
      `Subject: ${subject}`,
      "Message-ID: <mailbox-route-1@vendor.example>",
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
    ].join("\r\n"),
  );
  const forward = vi.fn(async () => ({}) as EmailSendResult);
  const setReject = vi.fn();
  return {
    inbound: {
      from: "monitor@vendor.example",
      to: "support@alerts.example.net",
      headers: new Headers({
        from: "Monitor <monitor@vendor.example>",
        to: "support@alerts.example.net",
        subject,
        "message-id": "<mailbox-route-1@vendor.example>",
        "content-type": "text/plain; charset=utf-8",
      }),
      raw: new Blob([raw]).stream(),
      rawSize: raw.byteLength,
      canBeForwarded,
      setReject,
      forward,
      async reply() {
        return {} as EmailSendResult;
      },
    } as ForwardableEmailMessage,
    forward,
    setReject,
  };
}

function executionContext(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {},
    props: {},
  } as unknown as ExecutionContext;
}

async function onlyEventId(db: D1Database): Promise<string> {
  const result = await db
    .prepare("SELECT id FROM processing_events ORDER BY created_at DESC")
    .all<{ id: string }>();
  expect(result.results).toHaveLength(1);
  return result.results[0]!.id;
}

async function seedPinnedMailboxRule(db: D1Database): Promise<{
  readonly id: string;
  readonly name: string;
}> {
  await ensureInitialGoreloMailbox(db, DEFAULT_ADDRESS);
  const mailbox = await createGoreloMailbox(db, {
    name: "Infrastructure alerts",
    address: ALERTS_ADDRESS,
    enabled: true,
  });
  await createRule(
    db,
    ruleInputSchema.parse({
      name: "Route infrastructure alerts",
      priority: 10,
      conditions: [
        {
          field: "subject",
          operator: "contains",
          value: "Infrastructure",
        },
      ],
      action: { type: "forward", mailboxId: mailbox.id },
    }),
  );
  return { id: mailbox.id, name: mailbox.name };
}

afterEach(() => {
  while (databases.length > 0) databases.pop()!.close();
});

describe("email mailbox routing", () => {
  it("forwards a matching rule to its pinned mailbox and snapshots that mailbox", async () => {
    const db = database();
    const mailbox = await seedPinnedMailboxRule(db);
    const mail = message("Infrastructure offline");

    await handleEmail(mail.inbound, environment(db), executionContext());

    expect(mail.forward).toHaveBeenCalledWith(
      ALERTS_ADDRESS,
      expect.any(Headers),
    );
    expect(mail.setReject).not.toHaveBeenCalled();
    await expect(getEvent(db, await onlyEventId(db))).resolves.toMatchObject({
      decision: "forward",
      status: "forwarded",
      matchedRuleName: "Route infrastructure alerts",
      destination: ALERTS_ADDRESS,
      destinationMailboxId: mailbox.id,
      destinationMailboxName: mailbox.name,
    });
  });

  it("routes an unmatched message to the named default mailbox and snapshots it", async () => {
    const db = database();
    const mail = message("Routine report");

    await handleEmail(mail.inbound, environment(db), executionContext());

    expect(mail.forward).toHaveBeenCalledWith(
      DEFAULT_ADDRESS,
      expect.any(Headers),
    );
    expect(mail.setReject).not.toHaveBeenCalled();
    await expect(getEvent(db, await onlyEventId(db))).resolves.toMatchObject({
      decision: "forward",
      status: "forwarded",
      destination: DEFAULT_ADDRESS,
      destinationMailboxId: DEFAULT_MAILBOX_ID,
      destinationMailboxName: "Default Gorelo mailbox",
    });
  });

  it("captures a teaching sample without changing the rule's mailbox decision", async () => {
    const db = database();
    const mailbox = await seedPinnedMailboxRule(db);
    const storage = archive();
    const now = Date.now();
    const capture = await createParserCapture(db, {
      match: {
        recipient: "support@alerts.example.net",
        senderMode: "domain",
        senderValue: "vendor.example",
        subjectContains: "Infrastructure",
      },
      requestedBy: "test-admin",
      createdAt: new Date(now - 1_000).toISOString(),
      waitExpiresAt: new Date(now + 10 * 60_000).toISOString(),
    });
    const mail = message(
      "Infrastructure offline",
      "Host: edge-01\r\nStatus: offline\r\nCustomer: ACME\r\n",
    );

    await handleEmail(
      mail.inbound,
      environment(db, storage.bucket),
      executionContext(),
    );

    expect(mail.forward).toHaveBeenCalledWith(
      ALERTS_ADDRESS,
      expect.any(Headers),
    );
    expect(mail.setReject).not.toHaveBeenCalled();
    const eventId = await onlyEventId(db);
    await expect(getEvent(db, eventId)).resolves.toMatchObject({
      decision: "forward",
      status: "forwarded",
      matchedRuleName: "Route infrastructure alerts",
      destination: ALERTS_ADDRESS,
      destinationMailboxId: mailbox.id,
      destinationMailboxName: mailbox.name,
    });

    await expect(getParserCapture(db, capture.id)).resolves.toMatchObject({
      state: "captured",
      capturedEventId: eventId,
      sampleAvailable: true,
      version: 3,
    });
    const sampleStorage = await getParserCaptureStorage(db, capture.id);
    expect(sampleStorage).toMatchObject({ capturedEventId: eventId });
    expect(storage.put).toHaveBeenCalledOnce();
    await expect(
      readParserSample(storage.bucket, sampleStorage!),
    ).resolves.toMatchObject({
      eventId,
      from: "monitor@vendor.example",
      to: "support@alerts.example.net",
      subject: "Infrastructure offline",
      bodyText: expect.stringContaining("Customer: ACME"),
    });
  });

  it("does not let a spam-classified message consume a teaching capture", async () => {
    const db = database();
    await seedPinnedMailboxRule(db);
    const storage = archive();
    const now = Date.now();
    const capture = await createParserCapture(db, {
      match: {
        recipient: "support@alerts.example.net",
        senderMode: "address",
        senderValue: "monitor@vendor.example",
        subjectContains: "Infrastructure",
      },
      requestedBy: "test-admin",
      createdAt: new Date(now - 1_000).toISOString(),
      waitExpiresAt: new Date(now + 10 * 60_000).toISOString(),
    });
    const mail = message(
      "Infrastructure free money lottery winner guaranteed income",
      "Host: attacker-controlled\r\nStatus: offline\r\n",
    );

    await handleEmail(
      mail.inbound,
      environment(db, storage.bucket),
      executionContext(),
    );

    expect(mail.forward).toHaveBeenCalledOnce();
    expect(storage.put).not.toHaveBeenCalled();
    await expect(getParserCapture(db, capture.id)).resolves.toMatchObject({
      state: "pending",
      sampleAvailable: false,
      version: 1,
    });
    await expect(getEvent(db, await onlyEventId(db))).resolves.toMatchObject({
      spamScore: 6,
      status: "forwarded",
    });
  });

  it("does not capture a message Cloudflare marks as ineligible to forward", async () => {
    const db = database();
    await seedPinnedMailboxRule(db);
    const storage = archive();
    const now = Date.now();
    const capture = await createParserCapture(db, {
      match: {
        recipient: "support@alerts.example.net",
        senderMode: "address",
        senderValue: "monitor@vendor.example",
      },
      requestedBy: "test-admin",
      createdAt: new Date(now - 1_000).toISOString(),
      waitExpiresAt: new Date(now + 10 * 60_000).toISOString(),
    });
    const mail = message(
      "Infrastructure offline",
      "Host: unverified\r\nStatus: offline\r\n",
      false,
    );

    await handleEmail(
      mail.inbound,
      environment(db, storage.bucket),
      executionContext(),
    );

    expect(storage.put).not.toHaveBeenCalled();
    await expect(getParserCapture(db, capture.id)).resolves.toMatchObject({
      state: "pending",
      sampleAvailable: false,
      version: 1,
    });
  });
});
