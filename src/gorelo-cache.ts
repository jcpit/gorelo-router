export const MAX_GORELO_CATALOG_CACHE_BYTES = 512 * 1024;

export interface GoreloCatalogCacheEntry {
  key: string;
  kind: string;
  clientId?: string;
  payload: unknown;
  itemCount: number;
  fetchedAt: string;
  expiresAt: string;
}

interface GoreloCatalogCacheRow {
  cache_key: string;
  kind: string;
  client_id: string | null;
  payload_json: string;
  item_count: number;
  fetched_at: string;
  expires_at: string;
}

function validateCacheKey(value: string, name: string): string {
  if (!/^[a-z0-9:_-]{1,200}$/.test(value)) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function rowToEntry(row: GoreloCatalogCacheRow): GoreloCatalogCacheEntry {
  let payload: unknown;
  try {
    payload = JSON.parse(row.payload_json) as unknown;
  } catch {
    throw new Error("Cached Gorelo catalog contains invalid JSON");
  }
  return {
    key: row.cache_key,
    kind: row.kind,
    ...(row.client_id ? { clientId: row.client_id } : {}),
    payload,
    itemCount: Number(row.item_count),
    fetchedAt: row.fetched_at,
    expiresAt: row.expires_at,
  };
}

export function goreloCatalogCacheKey(kind: string, clientId?: string): string {
  const normalizedKind = validateCacheKey(kind.trim().toLowerCase(), "kind");
  if (!clientId) return normalizedKind;
  const normalizedClientId = validateCacheKey(
    clientId.trim().toLowerCase(),
    "clientId",
  );
  return `${normalizedKind}:${normalizedClientId}`;
}

export async function getFreshGoreloCatalogCache(
  db: D1Database,
  key: string,
  now = new Date(),
): Promise<GoreloCatalogCacheEntry | undefined> {
  const row = await db
    .prepare(
      `SELECT cache_key, kind, client_id, payload_json, item_count,
              fetched_at, expires_at
         FROM gorelo_catalog_cache
        WHERE cache_key = ? AND expires_at > ?
        LIMIT 1`,
    )
    .bind(validateCacheKey(key, "cache key"), now.toISOString())
    .first<GoreloCatalogCacheRow>();
  return row ? rowToEntry(row) : undefined;
}

export async function putGoreloCatalogCache(
  db: D1Database,
  input: {
    key: string;
    kind: string;
    clientId?: string;
    payload: unknown;
    itemCount: number;
    fetchedAt: string;
    expiresAt: string;
  },
): Promise<GoreloCatalogCacheEntry> {
  const key = validateCacheKey(input.key, "cache key");
  const kind = validateCacheKey(input.kind, "kind");
  const clientId = input.clientId
    ? validateCacheKey(input.clientId, "clientId")
    : undefined;
  if (!Number.isInteger(input.itemCount) || input.itemCount < 0) {
    throw new Error("itemCount must be a non-negative integer");
  }
  const payloadJson = JSON.stringify(input.payload);
  if (
    new TextEncoder().encode(payloadJson).byteLength >
    MAX_GORELO_CATALOG_CACHE_BYTES
  ) {
    throw new Error("Gorelo catalog exceeds the cache size limit");
  }
  if (
    !Number.isFinite(Date.parse(input.fetchedAt)) ||
    !Number.isFinite(Date.parse(input.expiresAt)) ||
    Date.parse(input.expiresAt) <= Date.parse(input.fetchedAt)
  ) {
    throw new Error("Gorelo catalog cache timestamps are invalid");
  }

  await db
    .prepare(
      `INSERT INTO gorelo_catalog_cache (
         cache_key, kind, client_id, payload_json, item_count,
         fetched_at, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         kind = excluded.kind,
         client_id = excluded.client_id,
         payload_json = excluded.payload_json,
         item_count = excluded.item_count,
         fetched_at = excluded.fetched_at,
         expires_at = excluded.expires_at`,
    )
    .bind(
      key,
      kind,
      clientId ?? null,
      payloadJson,
      input.itemCount,
      input.fetchedAt,
      input.expiresAt,
    )
    .run();

  return {
    key,
    kind,
    ...(clientId ? { clientId } : {}),
    payload: input.payload,
    itemCount: input.itemCount,
    fetchedAt: input.fetchedAt,
    expiresAt: input.expiresAt,
  };
}

export async function deleteExpiredGoreloCatalogCache(
  db: D1Database,
  now = new Date(),
): Promise<number> {
  const result = await db
    .prepare("DELETE FROM gorelo_catalog_cache WHERE expires_at <= ?")
    .bind(now.toISOString())
    .run();
  return Number(result.meta.changes ?? 0);
}
