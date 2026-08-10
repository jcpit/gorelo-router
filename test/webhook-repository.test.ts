import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  createWebhookDestination,
  deleteWebhookDestination,
  listWebhookDestinations,
  updateWebhookDestination,
} from "../src/webhook-repository";

class TestStatement {
  private bindings: unknown[] = [];

  constructor(private readonly statement: StatementSync) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.bindings = values;
    return this as unknown as D1PreparedStatement;
  }

  async run<T>(): Promise<D1Result<T>> {
    const result = this.statement.run(...(this.bindings as never[]));
    return {
      success: true,
      results: [],
      meta: { changes: Number(result.changes) },
    } as unknown as D1Result<T>;
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
    this.sqlite.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
  }

  prepare(query: string): D1PreparedStatement {
    return new TestStatement(
      this.sqlite.prepare(query),
    ) as unknown as D1PreparedStatement;
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

describe("webhook destination repository", () => {
  it("creates, lists, version-updates, and version-deletes destinations", async () => {
    const db = database();
    const created = await createWebhookDestination(db, {
      name: "Automation intake",
      url: "https://hooks.example.com/mail-parser",
      host: "hooks.example.com",
      enabled: true,
    });
    expect(await listWebhookDestinations(db)).toEqual([created]);

    const stale = await updateWebhookDestination(db, created.id, 2, {
      name: created.name,
      url: created.url,
      host: created.host,
      enabled: false,
    });
    expect(stale.status).toBe("conflict");

    const updated = await updateWebhookDestination(db, created.id, 1, {
      name: "Automation intake",
      url: "https://hooks.example.com/parsed-email",
      host: "hooks.example.com",
      enabled: false,
    });
    expect(updated).toMatchObject({
      status: "updated",
      webhook: { enabled: false, version: 2 },
    });
    await expect(deleteWebhookDestination(db, created.id, 1)).resolves.toBe(
      "conflict",
    );
    await expect(deleteWebhookDestination(db, created.id, 2)).resolves.toBe(
      "deleted",
    );
    await expect(listWebhookDestinations(db)).resolves.toEqual([]);
  });

  it("enforces case-insensitive names and unique URLs", async () => {
    const db = database();
    await createWebhookDestination(db, {
      name: "Zapier",
      url: "https://hooks.example.com/one",
      host: "hooks.example.com",
      enabled: true,
    });
    await expect(
      createWebhookDestination(db, {
        name: "zapier",
        url: "https://hooks.example.com/two",
        host: "hooks.example.com",
        enabled: true,
      }),
    ).rejects.toThrow();
    await expect(
      createWebhookDestination(db, {
        name: "Another",
        url: "https://hooks.example.com/one",
        host: "hooks.example.com",
        enabled: true,
      }),
    ).rejects.toThrow();
  });
});
