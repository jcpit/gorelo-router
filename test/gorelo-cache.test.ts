import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteExpiredGoreloCatalogCache,
  getFreshGoreloCatalogCache,
  goreloCatalogCacheKey,
  MAX_GORELO_CATALOG_CACHE_BYTES,
  putGoreloCatalogCache,
} from "../src/gorelo-cache";

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

describe("Gorelo catalog cache", () => {
  it("stores scoped catalogs and returns only fresh entries", async () => {
    const db = database();
    const fetchedAt = "2026-08-09T00:00:00.000Z";
    const expiresAt = "2026-08-09T00:05:00.000Z";
    const key = goreloCatalogCacheKey("contacts", "123");
    await putGoreloCatalogCache(db, {
      key,
      kind: "contacts",
      clientId: "123",
      payload: [{ id: "456", name: "Alex Smith" }],
      itemCount: 1,
      fetchedAt,
      expiresAt,
    });

    await expect(
      getFreshGoreloCatalogCache(db, key, new Date("2026-08-09T00:04:59.000Z")),
    ).resolves.toMatchObject({
      key: "contacts:123",
      clientId: "123",
      itemCount: 1,
      payload: [{ id: "456", name: "Alex Smith" }],
    });
    await expect(
      getFreshGoreloCatalogCache(db, key, new Date("2026-08-09T00:05:00.000Z")),
    ).resolves.toBeUndefined();
  });

  it("deletes expired rows and preserves unexpired catalogs", async () => {
    const db = database();
    for (const [kind, expiresAt] of [
      ["clients", "2026-08-09T00:01:00.000Z"],
      ["groups", "2026-08-09T00:10:00.000Z"],
    ] as const) {
      await putGoreloCatalogCache(db, {
        key: kind,
        kind,
        payload: [],
        itemCount: 0,
        fetchedAt: "2026-08-09T00:00:00.000Z",
        expiresAt,
      });
    }
    await expect(
      deleteExpiredGoreloCatalogCache(db, new Date("2026-08-09T00:05:00.000Z")),
    ).resolves.toBe(1);
    await expect(
      getFreshGoreloCatalogCache(
        db,
        "groups",
        new Date("2026-08-09T00:05:00.000Z"),
      ),
    ).resolves.toBeDefined();
  });

  it("rejects invalid keys, timestamps, and oversized payloads", async () => {
    const db = database();
    expect(() => goreloCatalogCacheKey("../../contacts")).toThrow("kind");
    await expect(
      putGoreloCatalogCache(db, {
        key: "clients",
        kind: "clients",
        payload: [],
        itemCount: 0,
        fetchedAt: "2026-08-09T00:05:00.000Z",
        expiresAt: "2026-08-09T00:00:00.000Z",
      }),
    ).rejects.toThrow("timestamps");
    await expect(
      putGoreloCatalogCache(db, {
        key: "clients",
        kind: "clients",
        payload: "x".repeat(MAX_GORELO_CATALOG_CACHE_BYTES),
        itemCount: 1,
        fetchedAt: "2026-08-09T00:00:00.000Z",
        expiresAt: "2026-08-09T00:05:00.000Z",
      }),
    ).rejects.toThrow("size limit");
  });
});
