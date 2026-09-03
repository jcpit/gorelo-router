import { describe, expect, it, vi } from "vitest";
import { handleEmail } from "../src/email-handler";
import type { Env } from "../src/types";

interface FakeDatabase {
  db: D1Database;
  insertBindings: unknown[][];
  outcomeBindings: unknown[][];
}

function database(ruleRows: Record<string, unknown>[] = []): FakeDatabase {
  const insertBindings: unknown[][] = [];
  const outcomeBindings: unknown[][] = [];
  let mailboxInitialized = false;
  const mailboxRow = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Default Gorelo mailbox",
    address: "tickets@gorelo.example",
    enabled: 1,
    is_default: 1,
    version: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  const db = {
    prepare(sql: string) {
      const statement = {
        bind(...values: unknown[]) {
          if (sql.includes("INSERT INTO processing_events")) {
            insertBindings.push(values);
          }
          if (sql.includes("UPDATE processing_events")) {
            outcomeBindings.push(values);
          }
          return statement;
        },
        async all() {
          if (sql.includes("FROM rules")) return { results: ruleRows };
          if (sql.includes("FROM gorelo_mailboxes")) {
            return { results: mailboxInitialized ? [mailboxRow] : [] };
          }
          return { results: [] };
        },
        async run() {
          if (sql.includes("INSERT INTO gorelo_mailbox_settings")) {
            mailboxInitialized = true;
          }
          return { success: true, meta: { changes: 1 } };
        },
        async first() {
          if (sql.includes("COUNT(*) AS count FROM gorelo_mailboxes")) {
            return { count: mailboxInitialized ? 1 : 0 };
          }
          if (sql.includes("FROM gorelo_mailbox_settings")) {
            return mailboxInitialized
              ? {
                  default_mailbox_id: mailboxRow.id,
                  version: 1,
                  updated_at: mailboxRow.updated_at,
                }
              : null;
          }
          if (sql.includes("FROM gorelo_mailboxes m")) {
            return mailboxInitialized ? mailboxRow : null;
          }
          return null;
        },
      };
      return statement;
    },
    async batch(statements: D1PreparedStatement[]) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };
  return {
    db: db as unknown as D1Database,
    insertBindings,
    outcomeBindings,
  };
}

function ruleRow(
  action: unknown,
  conditions: unknown[],
): Record<string, unknown> {
  return {
    id: "rule-1",
    name: "Test rule",
    description: "",
    priority: 10,
    enabled: 1,
    match_mode: "all",
    conditions_json: JSON.stringify(conditions),
    action_json: JSON.stringify(action),
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function message(
  rawText = "Subject: Test\nMessage-ID: <test@example>\n\nBody",
) {
  const raw = new TextEncoder().encode(rawText);
  const setReject = vi.fn();
  const forward = vi.fn(
    async (_destination: string, _headers?: Headers) => ({}) as EmailSendResult,
  );
  const inbound = {
    from: "sender@example.com",
    to: "support@alerts.example.net",
    headers: new Headers({ subject: "Test", "message-id": "<test@example>" }),
    raw: new Blob([raw]).stream(),
    rawSize: raw.byteLength,
    setReject,
    forward,
    async reply() {
      return {} as EmailSendResult;
    },
  } as ForwardableEmailMessage;
  return { inbound, setReject, forward };
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

function env(db: D1Database, overrides: Partial<Env> = {}): Env {
  return {
    DB: db,
    DEFAULT_GORELO_ADDRESS: "tickets@gorelo.example",
    ALLOWED_FORWARD_DESTINATIONS:
      "tickets@gorelo.example,quarantine@example.com",
    ...overrides,
  };
}

describe("Email Worker handler", () => {
  it("forwards normal mail and records the decision", async () => {
    const fake = database();
    const mail = message();
    const context = executionContext();
    await handleEmail(mail.inbound, env(fake.db), context.context);
    await context.settle();

    expect(mail.forward).toHaveBeenCalledWith(
      "tickets@gorelo.example",
      expect.any(Headers),
    );
    expect(mail.setReject).not.toHaveBeenCalled();
    expect(fake.insertBindings[0]?.[14]).toBe("failed");
    expect(fake.outcomeBindings[0]?.[0]).toBe("forwarded");
  });

  it("uses Email Sending for a Gorelo address in the inbound zone", async () => {
    const fake = database();
    const mail = message();
    const send = vi.fn(async () => ({}) as EmailSendResult);
    const context = executionContext();
    await handleEmail(
      mail.inbound,
      env(fake.db, {
        INBOUND_EMAIL_DOMAINS: "alerts.example.net,gorelo.example",
        RELEASE_EMAIL: { send } as unknown as SendEmail,
        RELEASE_FROM_ADDRESS: "router@alerts.example.net",
      }),
      context.context,
    );
    await context.settle();

    expect(send).toHaveBeenCalledTimes(1);
    expect(mail.forward).not.toHaveBeenCalled();
    expect(mail.setReject).not.toHaveBeenCalled();
    expect(fake.outcomeBindings[0]?.[0]).toBe("forwarded");
  });

  it("does not forward when the pre-forward audit cannot be persisted", async () => {
    const statement = {
      bind() {
        return statement;
      },
      async all() {
        return { results: [] };
      },
      async run() {
        throw new Error("D1 unavailable");
      },
      async first() {
        return null;
      },
    };
    const db = {
      prepare: vi.fn(() => statement),
    } as unknown as D1Database;
    const mail = message();
    const context = executionContext();

    await handleEmail(mail.inbound, env(db), context.context);
    await context.settle();

    expect(mail.forward).not.toHaveBeenCalled();
    expect(mail.setReject).toHaveBeenCalledWith("Mail processing failed");
  });

  it("does not invent local spam reasons", async () => {
    const fake = database();
    const mail = message();
    mail.inbound.headers.set("subject", "=?UTF-8?B?54Sh5paZ?=");
    const context = executionContext();

    await handleEmail(mail.inbound, env(fake.db), context.context);
    await context.settle();

    expect(mail.setReject).not.toHaveBeenCalled();
    const forwardedHeaders = mail.forward.mock.calls[0]![1]!;
    expect(forwardedHeaders.get("X-Mail-Parser-Spam-Reasons")).toBeNull();
    expect(fake.insertBindings[0]?.[7]).toBe("[]");
  });

  it("uses an ASCII fallback for a Unicode-only SMTP reject reason", async () => {
    const fake = database([
      ruleRow({ type: "reject", reason: "拒否" }, [
        {
          field: "to",
          operator: "contains",
          value: "@",
          caseSensitive: false,
        },
      ]),
    ]);
    const mail = message();
    const context = executionContext();
    await handleEmail(mail.inbound, env(fake.db), context.context);
    await context.settle();

    expect(mail.setReject).toHaveBeenCalledWith("Message rejected by policy");
    expect(mail.forward).not.toHaveBeenCalled();
  });

  it("routes an uninspectable message to an explicit quarantine and marks failure", async () => {
    const fake = database([
      ruleRow({ type: "quarantine" }, [
        {
          field: "body_text",
          operator: "contains",
          value: "malware",
          caseSensitive: false,
        },
      ]),
    ]);
    const mail = message();
    const context = executionContext();
    await handleEmail(
      mail.inbound,
      env(fake.db, {
        QUARANTINE_ADDRESS: "quarantine@example.com",
        MAX_PARSE_BYTES: "1",
      }),
      context.context,
    );
    await context.settle();

    expect(mail.forward).toHaveBeenCalledWith(
      "quarantine@example.com",
      expect.any(Headers),
    );
    expect(fake.insertBindings[0]?.[11]).toBe("quarantine@example.com");
    expect(fake.insertBindings[0]?.[14]).toBe("failed");
    expect(fake.insertBindings[0]?.[15]).toContain("MAX_PARSE_BYTES");
  });

  it("rejects a failed rule forward without an explicit fallback and keeps attribution", async () => {
    const fake = database([
      ruleRow({ type: "forward" }, [
        {
          field: "to",
          operator: "contains",
          value: "@",
          caseSensitive: false,
        },
      ]),
    ]);
    const mail = message();
    mail.forward.mockRejectedValueOnce(new Error("forward unavailable"));
    const context = executionContext();

    await handleEmail(mail.inbound, env(fake.db), context.context);
    await context.settle();

    expect(mail.forward).toHaveBeenCalledTimes(1);
    expect(mail.setReject).toHaveBeenCalledWith("Mail processing failed");
    expect(fake.insertBindings[0]?.[8]).toBe("forward");
    expect(fake.insertBindings[0]?.[9]).toBe("rule-1");
    expect(fake.insertBindings[0]?.[10]).toBe("Test rule");
    expect(fake.insertBindings[0]?.[14]).toBe("failed");
    expect(fake.outcomeBindings.at(-1)?.[0]).toBe("failed");
  });
});
