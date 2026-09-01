import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleFetch } from "../src/api";
import {
  createClientAlias,
  importGoreloClients,
} from "../src/client-directory";
import { getDeliveryByEventAction } from "../src/delivery-repository";
import { handleEmail } from "../src/email-handler";
import { createRule } from "../src/repository";
import type { Env } from "../src/types";
import { ruleInputSchema } from "../src/validation";
import { createWebhookDestination } from "../src/webhook-repository";
import {
  WEBHOOK_IDEMPOTENCY_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
} from "../src/webhooks";

const SIGNING_SECRET = "test-webhook-signing-secret-0123456789abcdef";
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

const databases: TestDatabase[] = [];

function database(): D1Database {
  const database = new TestDatabase();
  databases.push(database);
  return database as unknown as D1Database;
}

function environment(db: D1Database): Env {
  return {
    DB: db,
    DEFAULT_GORELO_ADDRESS: "tickets@gorelo.example",
    ALLOWED_FORWARD_DESTINATIONS: "tickets@gorelo.example",
    ALLOWED_WEBHOOK_HOSTS: "hooks.example.com",
    WEBHOOK_SIGNING_SECRET: SIGNING_SECRET,
    ADMIN_API_TOKEN: ADMIN_TOKEN,
  };
}

function message(body: string): {
  inbound: ForwardableEmailMessage;
  forward: ReturnType<typeof vi.fn>;
  setReject: ReturnType<typeof vi.fn>;
} {
  const raw = new TextEncoder().encode(
    [
      "From: Monitor <monitor@vendor.example>",
      "To: support@alerts.example.net",
      "Subject: Server alert",
      "Message-ID: <alert-1@vendor.example>",
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
        subject: "Server alert",
        "message-id": "<alert-1@vendor.example>",
        "content-type": "text/plain; charset=utf-8",
      }),
      raw: new Blob([raw]).stream(),
      rawSize: raw.byteLength,
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

function executionContext(): {
  context: ExecutionContext;
  settle: () => Promise<void>;
} {
  const pending: Promise<unknown>[] = [];
  return {
    context: {
      waitUntil(promise: Promise<unknown>) {
        pending.push(promise);
      },
      passThroughOnException() {},
      props: {},
    } as unknown as ExecutionContext,
    async settle() {
      await Promise.all(pending);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  while (databases.length > 0) databases.pop()!.close();
});

describe("email webhook actions", () => {
  it("validates registered destinations and previews mapped variables through the admin API", async () => {
    const db = database();
    const env = environment(db);
    const destination = await createWebhookDestination(db, {
      name: "Automation intake",
      url: "https://hooks.example.com/mail",
      host: "hooks.example.com",
      enabled: true,
    });
    const action = {
      type: "forward_webhook",
      webhookDestinationId: destination.id,
      fields: [
        {
          key: "alert_name",
          source: "subject",
          startAfter: "Alert:",
          required: true,
        },
      ],
    };
    const createResponse = await handleFetch(
      new Request("https://worker.example/api/v1/rules", {
        method: "POST",
        headers: {
          authorization: `Bearer ${ADMIN_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Preview extraction",
          conditions: [
            { field: "subject", operator: "contains", value: "Alert:" },
          ],
          action,
        }),
      }),
      env,
    );
    expect(createResponse.status).toBe(201);

    const disableReferenced = await handleFetch(
      new Request(`https://worker.example/api/v1/webhooks/${destination.id}`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${ADMIN_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          version: destination.version,
          name: destination.name,
          url: destination.url,
          enabled: false,
        }),
      }),
      env,
    );
    expect(disableReferenced.status).toBe(409);

    const deleteReferenced = await handleFetch(
      new Request(
        `https://worker.example/api/v1/webhooks/${destination.id}?version=${String(destination.version)}`,
        {
          method: "DELETE",
          headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        },
      ),
      env,
    );
    expect(deleteReferenced.status).toBe(409);

    const preview = await handleFetch(
      new Request("https://worker.example/api/v1/evaluate", {
        method: "POST",
        headers: {
          authorization: `Bearer ${ADMIN_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: "monitor@vendor.example",
          to: "support@alerts.example.net",
          subject: "Alert: Printer offline",
        }),
      }),
      env,
    );
    expect(preview.status).toBe(200);
    await expect(preview.json()).resolves.toMatchObject({
      decision: {
        type: "forward",
        webhook: { destinationId: destination.id },
      },
      webhookPreview: { variables: { alert_name: "Printer offline" } },
    });

    const missingDestination = await handleFetch(
      new Request("https://worker.example/api/v1/rules", {
        method: "POST",
        headers: {
          authorization: `Bearer ${ADMIN_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Invalid destination",
          conditions: [
            { field: "subject", operator: "contains", value: "Alert:" },
          ],
          action: { ...action, webhookDestinationId: "missing-destination" },
        }),
      }),
      env,
    );
    expect(missingDestination.status).toBe(400);

    const disabled = await createWebhookDestination(db, {
      name: "Paused destination",
      url: "https://hooks.example.com/paused",
      host: "hooks.example.com",
      enabled: false,
    });
    const disabledDestination = await handleFetch(
      new Request("https://worker.example/api/v1/rules", {
        method: "POST",
        headers: {
          authorization: `Bearer ${ADMIN_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Disabled destination",
          conditions: [
            { field: "subject", operator: "contains", value: "Alert:" },
          ],
          action: { ...action, webhookDestinationId: disabled.id },
        }),
      }),
      env,
    );
    expect(disabledDestination.status).toBe(400);
  });

  it("commits audit first, forwards, resolves a client alias, and sends a signed webhook", async () => {
    const db = database();
    await importGoreloClients(db, [
      {
        id: 42,
        name: "Acme Managed Services",
        billingName: null,
        alternateName: null,
        status: "Active",
        isDefault: false,
        domains: ["acme.example"],
      },
    ]);
    await createClientAlias(db, { clientId: 42, alias: "Acme North" });
    const destination = await createWebhookDestination(db, {
      name: "Automation intake",
      url: "https://hooks.example.com/mail",
      host: "hooks.example.com",
      enabled: true,
    });
    await createRule(
      db,
      ruleInputSchema.parse({
        name: "Parse monitoring alert",
        priority: 10,
        conditions: [
          {
            field: "from_domain",
            operator: "equals",
            value: "vendor.example",
          },
        ],
        action: {
          type: "forward_webhook",
          webhookDestinationId: destination.id,
          eventType: "mail.alert.parsed",
          clientIdentityField: "client",
          fields: [
            {
              key: "client",
              source: "body_text",
              startAfter: "Customer:",
              endBefore: "\n",
              required: true,
            },
            {
              key: "asset",
              source: "body_text",
              startAfter: "Asset:",
              required: true,
            },
            { key: "ticket_type", source: "literal", value: "Incident" },
          ],
        },
      }),
    );

    let sentBody: unknown;
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        sentBody = JSON.parse(String(init?.body)) as unknown;
        const headers = new Headers(init?.headers);
        expect(headers.get(WEBHOOK_SIGNATURE_HEADER)).toMatch(
          /^v1=[0-9a-f]{64}$/,
        );
        expect(headers.get(WEBHOOK_IDEMPOTENCY_HEADER)).toMatch(
          /^[0-9a-f-]{36}$/,
        );
        return new Response(null, { status: 202 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const mail = message("Customer: Acme North\r\nAsset: SERVER-01\r\n");
    const context = executionContext();

    await handleEmail(mail.inbound, environment(db), context.context);
    expect(mail.forward).toHaveBeenCalledWith(
      "tickets@gorelo.example",
      expect.any(Headers),
    );
    await context.settle();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sentBody).toMatchObject({
      eventType: "mail.alert.parsed",
      data: {
        variables: {
          client: "Acme North",
          asset: "SERVER-01",
          ticket_type: "Incident",
        },
        goreloClient: {
          id: 42,
          name: "Acme Managed Services",
          matchedBy: "global_alias",
        },
      },
    });

    const row = db
      .prepare("SELECT id FROM processing_events LIMIT 1")
      .first<{ id: string }>();
    const event = await row;
    expect(event).not.toBeNull();
    const delivery = await getDeliveryByEventAction(db, event!.id, 0);
    expect(delivery).toMatchObject({
      actionType: "send_webhook",
      state: "succeeded",
      attemptCount: 1,
      attemptHistory: [{ outcome: "succeeded", httpStatus: 202 }],
    });
    expect(JSON.stringify(delivery)).not.toContain(SIGNING_SECRET);
    expect(JSON.stringify(delivery)).not.toContain(destination.url);

    const auditResponse = await handleFetch(
      new Request(`https://worker.example/api/v1/events/${event!.id}`, {
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      }),
      environment(db),
    );
    expect(auditResponse.status).toBe(200);
    await expect(auditResponse.json()).resolves.toMatchObject({
      event: { id: event!.id, status: "forwarded" },
      deliveries: [
        {
          state: "succeeded",
          payloadSnapshot: {
            data: {
              variables: { client: "Acme North", asset: "SERVER-01" },
              goreloClient: { id: 42 },
            },
          },
          attemptHistory: [{ outcome: "succeeded", httpStatus: 202 }],
        },
      ],
    });
  });

  it("keeps the primary forward successful when required extraction fails", async () => {
    const db = database();
    const destination = await createWebhookDestination(db, {
      name: "Automation intake",
      url: "https://hooks.example.com/mail",
      host: "hooks.example.com",
      enabled: true,
    });
    await createRule(
      db,
      ruleInputSchema.parse({
        name: "Required parser field",
        conditions: [
          { field: "subject", operator: "contains", value: "alert" },
        ],
        action: {
          type: "forward_webhook",
          webhookDestinationId: destination.id,
          fields: [
            {
              key: "asset",
              source: "body_text",
              startAfter: "Missing marker:",
              required: true,
            },
          ],
        },
      }),
    );
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const mail = message("Asset: SERVER-01\r\n");
    const context = executionContext();

    await handleEmail(mail.inbound, environment(db), context.context);
    await context.settle();

    expect(mail.forward).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    const event = await db
      .prepare("SELECT id FROM processing_events LIMIT 1")
      .first<{ id: string }>();
    const delivery = await getDeliveryByEventAction(db, event!.id, 0);
    expect(delivery).toMatchObject({
      state: "failed",
      safeError: "Webhook field extraction failed",
      attemptCount: 1,
    });
  });

  it("does not forward when the audit event and webhook ledger cannot commit atomically", async () => {
    const db = database();
    const destination = await createWebhookDestination(db, {
      name: "Automation intake",
      url: "https://hooks.example.com/mail",
      host: "hooks.example.com",
      enabled: true,
    });
    await createRule(
      db,
      ruleInputSchema.parse({
        name: "Durable webhook",
        conditions: [
          { field: "subject", operator: "contains", value: "alert" },
        ],
        action: {
          type: "forward_webhook",
          webhookDestinationId: destination.id,
          fields: [{ key: "subject", source: "subject" }],
        },
      }),
    );
    const batch = vi.fn(async () => {
      throw new Error("D1 batch unavailable");
    });
    const failingDb = {
      prepare: db.prepare.bind(db),
      batch,
    } as unknown as D1Database;
    const mail = message("Asset: SERVER-01\r\n");
    const context = executionContext();

    await handleEmail(mail.inbound, environment(failingDb), context.context);
    await context.settle();

    expect(batch).toHaveBeenCalledOnce();
    expect(mail.forward).not.toHaveBeenCalled();
    expect(mail.setReject).toHaveBeenCalledWith("Mail processing failed");
    await expect(
      db
        .prepare("SELECT COUNT(*) AS count FROM outbound_deliveries")
        .first<number>("count"),
    ).resolves.toBe(0);
    await expect(
      db
        .prepare("SELECT status FROM processing_events LIMIT 1")
        .first<{ status: string }>(),
    ).resolves.toMatchObject({ status: "failed" });
  });
});
