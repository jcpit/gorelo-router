import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  createClientAlias,
  importGoreloClients,
} from "../src/client-directory";
import { prepareGoreloAction } from "../src/gorelo-action";
import type { GoreloRuleAction } from "../src/types";
import { ruleInputSchema } from "../src/validation";
import { email } from "./helpers";

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

async function seedClient(db: D1Database): Promise<void> {
  await importGoreloClients(
    db,
    [
      {
        id: 42,
        name: "Acme Pty Ltd",
        billingName: "Acme",
        alternateName: null,
        status: "Active",
        isDefault: false,
        domains: ["acme.example"],
      },
    ],
    { syncedAt: new Date("2026-08-09T00:00:00.000Z") },
  );
}

function action(value: Record<string, unknown>): GoreloRuleAction {
  const parsed = ruleInputSchema.parse({
    name: "Mapped action",
    conditions: [{ field: "to", operator: "contains", value: "@" }],
    action: value,
  });
  if (
    parsed.action.type !== "create_ticket" &&
    parsed.action.type !== "create_alert"
  ) {
    throw new Error("Expected a Gorelo action");
  }
  return parsed.action;
}

describe("Gorelo action preparation", () => {
  it("resolves one of multiple scoped aliases and renders a ticket request", async () => {
    const db = database();
    await seedClient(db);
    await createClientAlias(db, {
      clientId: 42,
      alias: "ACME-NOC",
      scope: "vendor-a",
    });
    await createClientAlias(db, {
      clientId: 42,
      alias: "Acme Legacy",
      scope: "vendor-a",
    });

    const result = await prepareGoreloAction(
      db,
      email({
        subject: "Disk full",
        bodyText: "Customer: ACME-NOC\nDevice: srv-01\nUsage: 97%",
      }),
      action({
        type: "create_ticket",
        fields: [
          { key: "summary", source: "subject" },
          {
            key: "customer",
            source: "body_text",
            startAfter: "Customer: ",
            endBefore: "\n",
            required: true,
          },
          {
            key: "device",
            source: "body_text",
            startAfter: "Device: ",
            endBefore: "\n",
          },
        ],
        clientIdentityField: "customer",
        clientAliasScope: "vendor-a",
        titleTemplate: "{{summary}} on {{device}}",
        descriptionTemplate: "Parsed for {{customer}}",
        statusId: 10,
        groupId: 20,
        typeId: 30,
      }),
    );

    expect(result).toMatchObject({
      actionType: "create_ticket",
      data: {
        goreloClient: {
          id: 42,
          name: "Acme Pty Ltd",
          matchedBy: "scoped_alias",
        },
      },
      request: {
        Title: "Disk full on srv-01",
        ClientId: 42,
        Description: "Parsed for ACME-NOC",
        StatusId: 10,
        GroupId: 20,
        TypeId: 30,
        SendTicketCreatedEmail: false,
        IsUnread: true,
      },
    });
  });

  it("uses a current fixed client for alert mappings", async () => {
    const db = database();
    await seedClient(db);
    await expect(
      prepareGoreloAction(
        db,
        email({ subject: "Offline" }),
        action({
          type: "create_alert",
          fields: [
            { key: "name", source: "subject" },
            { key: "resource", source: "literal", value: "srv-01" },
          ],
          clientId: 42,
          nameTemplate: "{{name}}",
          resourceTemplate: "{{resource}}",
          severity: 1,
        }),
      ),
    ).resolves.toMatchObject({
      request: {
        Name: "Offline",
        ClientId: 42,
        Resource: "srv-01",
        Severity: 1,
      },
    });
  });

  it("fails closed when extraction or client resolution is unavailable", async () => {
    const db = database();
    await seedClient(db);
    const base = {
      type: "create_alert",
      fields: [
        {
          key: "customer",
          source: "body_text",
          startAfter: "Customer: ",
          required: true,
        },
        { key: "name", source: "subject" },
      ],
      clientIdentityField: "customer",
      nameTemplate: "{{name}}",
      resourceTemplate: "mail",
    };

    await expect(
      prepareGoreloAction(db, email({ bodyText: "No marker" }), action(base)),
    ).resolves.toMatchObject({ preflightError: "extraction_failed" });
    await expect(
      prepareGoreloAction(
        db,
        email({ bodyText: "Customer: Unknown" }),
        action(base),
      ),
    ).resolves.toMatchObject({ preflightError: "client_resolution_failed" });
  });
});
