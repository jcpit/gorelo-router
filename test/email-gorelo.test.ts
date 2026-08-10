import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleFetch } from "../src/api";
import {
  createClientAliases,
  importGoreloClients,
} from "../src/client-directory";
import { getDeliveryByEventAction } from "../src/delivery-repository";
import { handleEmail } from "../src/email-handler";
import { createRule, getEvent } from "../src/repository";
import type { Env } from "../src/types";
import { ruleInputSchema } from "../src/validation";

const GORELO_KEY = "test-gorelo-key-not-a-real-secret";
const ADMIN_TOKEN = "test-admin-token-0123456789-abcdef";
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

function archive(): {
  bucket: R2Bucket;
  put: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
} {
  const objects = new Map<string, Uint8Array>();
  const put = vi.fn(async (key: string, value: ArrayBuffer) => {
    objects.set(key, new Uint8Array(value));
    return {} as R2Object;
  });
  const get = vi.fn(async (key: string) => {
    const value = objects.get(key);
    if (!value) return null;
    return {
      body: new Blob([value]).stream(),
      size: value.byteLength,
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
    put,
    get,
    remove,
  };
}

function environment(db: D1Database, bucket: R2Bucket): Env {
  return {
    DB: db,
    MESSAGE_ARCHIVE: bucket,
    GORELO_API_KEY: GORELO_KEY,
    GORELO_API_BASE_URL: "https://api.aue.gorelo.io",
    ADMIN_API_TOKEN: ADMIN_TOKEN,
    DEFAULT_GORELO_ADDRESS: "tickets@gorelo.example",
    QUARANTINE_ADDRESS: "quarantine@example.com",
    FAILURE_FORWARD_ADDRESS: "quarantine@example.com",
    ALLOWED_FORWARD_DESTINATIONS:
      "tickets@gorelo.example,quarantine@example.com",
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
      "Subject: Disk full",
      "Message-ID: <gorelo-action-1@vendor.example>",
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
        subject: "Disk full",
        "message-id": "<gorelo-action-1@vendor.example>",
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

function executionContext(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {},
    props: {},
  } as unknown as ExecutionContext;
}

async function seedTicketRule(db: D1Database): Promise<void> {
  await importGoreloClients(
    db,
    [
      {
        id: 42,
        name: "Acme Managed Services",
        billingName: null,
        alternateName: null,
        status: "Active",
        isDefault: false,
        domains: ["acme.example"],
      },
    ],
    { syncedAt: new Date("2026-08-09T00:00:00.000Z") },
  );
  await createClientAliases(db, {
    clientId: 42,
    aliases: [
      { alias: "ACME-NOC", scope: "vendor-a" },
      { alias: "Acme Legacy", scope: "vendor-a" },
    ],
  });
  await createRule(
    db,
    ruleInputSchema.parse({
      name: "Native monitoring ticket",
      priority: 10,
      conditions: [
        {
          field: "from_domain",
          operator: "equals",
          value: "vendor.example",
        },
      ],
      action: {
        type: "create_ticket",
        fields: [
          { key: "summary", source: "subject", required: true },
          {
            key: "client",
            source: "body_text",
            startAfter: "Customer: ",
            endBefore: "\n",
            required: true,
          },
          {
            key: "asset",
            source: "body_text",
            startAfter: "Asset: ",
            required: true,
          },
        ],
        clientIdentityField: "client",
        clientAliasScope: "vendor-a",
        titleTemplate: "{{summary}} · {{asset}}",
        descriptionTemplate: "Parsed customer: {{client}}",
        statusId: 10,
        groupId: 20,
        typeId: 30,
      },
    }),
  );
}

async function seedAlertRule(db: D1Database): Promise<void> {
  await importGoreloClients(
    db,
    [
      {
        id: 42,
        name: "Acme Managed Services",
        billingName: null,
        alternateName: null,
        status: "Active",
        isDefault: false,
        domains: ["acme.example"],
      },
    ],
    { syncedAt: new Date("2026-08-09T00:00:00.000Z") },
  );
  await createClientAliases(db, {
    clientId: 42,
    aliases: [
      { alias: "ACME-NOC", scope: "vendor-a" },
      { alias: "Acme Legacy", scope: "vendor-a" },
    ],
  });
  await createRule(
    db,
    ruleInputSchema.parse({
      name: "Native monitoring alert",
      priority: 10,
      conditions: [
        {
          field: "from_domain",
          operator: "equals",
          value: "vendor.example",
        },
      ],
      action: {
        type: "create_alert",
        fields: [
          { key: "summary", source: "subject", required: true },
          {
            key: "client",
            source: "body_text",
            startAfter: "Customer: ",
            endBefore: "\n",
            required: true,
          },
          {
            key: "resource",
            source: "body_text",
            startAfter: "Resource: ",
            endBefore: "\n",
            required: true,
          },
          {
            key: "signal",
            source: "body_text",
            startAfter: "Signal: ",
            required: true,
          },
        ],
        clientIdentityField: "client",
        clientAliasScope: "vendor-a",
        nameTemplate: "{{summary}} · {{resource}}",
        resourceTemplate: "{{resource}}",
        descriptionTemplate: "Parsed {{signal}} for {{client}}",
        severity: 1,
      },
    }),
  );
}

async function onlyEventId(db: D1Database): Promise<string> {
  const row = await db
    .prepare("SELECT id FROM processing_events LIMIT 1")
    .first<{ id: string }>();
  if (!row) throw new Error("Expected a processing event");
  return row.id;
}

afterEach(() => {
  vi.unstubAllGlobals();
  while (databases.length > 0) databases.pop()!.close();
});

describe("email Gorelo API actions", () => {
  it("validates current ticket catalogs on save without creating a ticket", async () => {
    const db = database();
    const storage = archive();
    await importGoreloClients(db, [
      {
        id: 42,
        name: "Acme",
        billingName: null,
        alternateName: null,
        status: "Active",
        isDefault: false,
        domains: ["acme.example"],
      },
    ]);
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe("GET");
        const url = new URL(String(input));
        switch (url.pathname) {
          case "/v1/tickets/statuses":
            return Response.json([
              { id: 10, name: "New", baseStatusId: 1, sortOrder: 0 },
            ]);
          case "/v1/organization/groups":
            return Response.json([{ id: 20, name: "Service Desk" }]);
          case "/v1/tickets/types":
            return Response.json([{ id: 30, name: "Incident" }]);
          case "/v1/organization/users":
            return url.searchParams.get("cursor") === "users-page-2"
              ? Response.json({
                  data: [
                    {
                      id: 202,
                      firstName: "Page",
                      lastName: "Two",
                      email: "page.two@example.com",
                    },
                  ],
                  totalCount: 2,
                  nextCursor: null,
                  previousCursor: "users-page-1",
                  hasMore: false,
                  hasPrevious: true,
                })
              : Response.json({
                  data: [
                    {
                      id: 101,
                      firstName: "Page",
                      lastName: "One",
                      email: "page.one@example.com",
                    },
                  ],
                  totalCount: 2,
                  nextCursor: "users-page-2",
                  previousCursor: null,
                  hasMore: true,
                  hasPrevious: false,
                });
          default:
            throw new Error(`Unexpected catalog ${String(input)}`);
        }
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const ruleBody = {
      name: "Validated native ticket",
      conditions: [
        { field: "from_domain", operator: "equals", value: "vendor.example" },
      ],
      action: {
        type: "create_ticket",
        fields: [
          { key: "summary", source: "subject" },
          { key: "customer", source: "literal", value: "Acme" },
        ],
        clientIdentityField: "customer",
        titleTemplate: "{{summary}}",
        statusId: 10,
        groupId: 20,
        typeId: 30,
        leadAssigneeId: 202,
      },
    };
    const response = await handleFetch(
      new Request("https://worker.example/api/v1/rules", {
        method: "POST",
        headers: {
          authorization: `Bearer ${ADMIN_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(ruleBody),
      }),
      environment(db, storage.bucket),
    );

    expect(response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(
      fetchMock.mock.calls.some(
        ([input]) =>
          new URL(String(input)).searchParams.get("cursor") === "users-page-2",
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          new URL(String(input)).pathname === "/v1/tickets" &&
          init?.method === "POST",
      ),
    ).toBe(false);

    const { MESSAGE_ARCHIVE: _archive, ...noArchive } = environment(
      database(),
      storage.bucket,
    );
    const rejected = await handleFetch(
      new Request("https://worker.example/api/v1/rules", {
        method: "POST",
        headers: {
          authorization: `Bearer ${ADMIN_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(ruleBody),
      }),
      noArchive,
    );
    expect(rejected.status).toBe(400);
  });

  it("previews the exact rendered request without calling Gorelo", async () => {
    const db = database();
    await seedTicketRule(db);
    const storage = archive();
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleFetch(
      new Request("https://worker.example/api/v1/evaluate", {
        method: "POST",
        headers: {
          authorization: `Bearer ${ADMIN_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: "monitor@vendor.example",
          to: "support@alerts.example.net",
          subject: "Disk full",
          bodyText: "Customer: ACME-NOC\nAsset: SRV-01",
        }),
      }),
      environment(db, storage.bucket),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      decision: { gorelo: { action: { type: "create_ticket" } } },
      goreloPreview: {
        actionType: "create_ticket",
        data: {
          goreloClient: { id: 42, matchedBy: "scoped_alias" },
          variables: { client: "ACME-NOC", asset: "SRV-01" },
        },
        request: {
          Title: "Disk full · SRV-01",
          ClientId: 42,
          StatusId: 10,
          GroupId: 20,
          TypeId: 30,
        },
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("archives the original, creates one ticket, and records its provider ID", async () => {
    const db = database();
    await seedTicketRule(db);
    const storage = archive();
    let requestBody: unknown;
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body)) as unknown;
        return Response.json({
          StatusCode: 200,
          IsSuccess: true,
          Data: { Id: TICKET_ID },
          Notifications: [],
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const mail = message("Customer: ACME-NOC\r\nAsset: SRV-01\r\n");

    await handleEmail(
      mail.inbound,
      environment(db, storage.bucket),
      executionContext(),
    );

    expect(mail.forward).not.toHaveBeenCalled();
    expect(mail.setReject).not.toHaveBeenCalled();
    expect(storage.put).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://api.aue.gorelo.io/v1/tickets",
    );
    expect(requestBody).toMatchObject({
      Title: "Disk full · SRV-01",
      ClientId: 42,
      Description: "Parsed customer: ACME-NOC",
      StatusId: 10,
      GroupId: 20,
      TypeId: 30,
    });

    const eventId = await onlyEventId(db);
    await expect(getEvent(db, eventId)).resolves.toMatchObject({
      status: "forwarded",
      audit: { rawAvailable: true },
    });
    await expect(
      getDeliveryByEventAction(db, eventId, 0),
    ).resolves.toMatchObject({
      actionType: "create_ticket",
      state: "succeeded",
      providerId: TICKET_ID,
      attemptCount: 1,
      payloadSnapshot: {
        region: "aue",
        data: {
          goreloClient: { id: 42, matchedBy: "scoped_alias" },
          variables: { client: "ACME-NOC", asset: "SRV-01" },
        },
      },
    });

    const rawResponse = await handleFetch(
      new Request(`https://worker.example/api/v1/events/${eventId}/raw`, {
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      }),
      environment(db, storage.bucket),
    );
    expect(rawResponse.status).toBe(200);
    expect(rawResponse.headers.get("content-type")).toBe("message/rfc822");
    await expect(rawResponse.text()).resolves.toContain("Asset: SRV-01");
  });

  it("resolves one of several scoped aliases and creates one durable Gorelo alert", async () => {
    const db = database();
    await seedAlertRule(db);
    const storage = archive();
    let requestBody: unknown;
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body)) as unknown;
        return Response.json({
          StatusCode: 200,
          IsSuccess: true,
          Data: true,
          DataContext: { TraceId: "trace-alert-123" },
          Notifications: [],
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const mail = message(
      "Customer: Acme Legacy\r\nResource: edge-fw-01\r\nSignal: device offline\r\n",
    );

    await handleEmail(
      mail.inbound,
      environment(db, storage.bucket),
      executionContext(),
    );

    expect(mail.forward).not.toHaveBeenCalled();
    expect(mail.setReject).not.toHaveBeenCalled();
    expect(storage.put).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [requestUrl, requestInit] = fetchMock.mock.calls[0]!;
    expect(String(requestUrl)).toBe("https://api.aue.gorelo.io/v1/alerts/");
    expect(requestInit?.method).toBe("POST");
    expect(new Headers(requestInit?.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(requestBody).toEqual({
      Name: "Disk full · edge-fw-01",
      ClientId: 42,
      Resource: "edge-fw-01",
      Severity: 1,
      Description: "Parsed device offline for Acme Legacy",
    });

    const eventId = await onlyEventId(db);
    await expect(getEvent(db, eventId)).resolves.toMatchObject({
      status: "forwarded",
      audit: { rawAvailable: true },
    });
    const delivery = await getDeliveryByEventAction(db, eventId, 0);
    expect(delivery).toMatchObject({
      actionType: "create_alert",
      state: "succeeded",
      attemptCount: 1,
      payloadSnapshot: {
        region: "aue",
        request: requestBody,
        data: {
          goreloClient: { id: 42, matchedBy: "scoped_alias" },
          variables: {
            client: "Acme Legacy",
            resource: "edge-fw-01",
            signal: "device offline",
          },
        },
      },
    });
    expect(delivery?.providerId).toBeUndefined();

    const rawResponse = await handleFetch(
      new Request(`https://worker.example/api/v1/events/${eventId}/raw`, {
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      }),
      environment(db, storage.bucket),
    );
    expect(rawResponse.status).toBe(200);
    await expect(rawResponse.text()).resolves.toContain(
      "Customer: Acme Legacy",
    );
  });

  it("holds an uncertain create without forwarding, rejecting, or replaying", async () => {
    const db = database();
    await seedTicketRule(db);
    const storage = archive();
    const fetchMock = vi.fn(async () => {
      throw new Error(`network diagnostic ${GORELO_KEY}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const mail = message("Customer: ACME-NOC\r\nAsset: SRV-01\r\n");

    await handleEmail(
      mail.inbound,
      environment(db, storage.bucket),
      executionContext(),
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mail.forward).not.toHaveBeenCalled();
    expect(mail.setReject).not.toHaveBeenCalled();
    const eventId = await onlyEventId(db);
    await expect(getEvent(db, eventId)).resolves.toMatchObject({
      status: "failed",
    });
    const delivery = await getDeliveryByEventAction(db, eventId, 0);
    expect(delivery).toMatchObject({
      state: "uncertain",
      attemptCount: 1,
      safeError:
        "Gorelo API create outcome is uncertain after a network failure",
    });
    expect(JSON.stringify(delivery)).not.toContain(GORELO_KEY);
  });

  it("uses the configured failure route only after a definitive rejection", async () => {
    const db = database();
    await seedTicketRule(db);
    const storage = archive();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { privateError: `must-not-persist-${GORELO_KEY}` },
          { status: 400 },
        ),
      ),
    );
    const mail = message("Customer: ACME-NOC\r\nAsset: SRV-01\r\n");

    await handleEmail(
      mail.inbound,
      environment(db, storage.bucket),
      executionContext(),
    );

    expect(mail.forward).toHaveBeenCalledWith(
      "quarantine@example.com",
      expect.any(Headers),
    );
    expect(mail.setReject).not.toHaveBeenCalled();
    const eventId = await onlyEventId(db);
    const delivery = await getDeliveryByEventAction(db, eventId, 0);
    expect(delivery).toMatchObject({
      state: "failed",
      safeError: "Gorelo rejected the create request",
    });
    expect(JSON.stringify(delivery)).not.toContain(GORELO_KEY);
  });
});
