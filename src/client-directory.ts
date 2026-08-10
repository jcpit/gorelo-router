import type { GoreloClientCatalogItem } from "./gorelo";

export const MAX_GORELO_DIRECTORY_CLIENTS_PER_IMPORT = 5_000;
export const MAX_CLIENT_NAME_CHARACTERS = 512;
export const MAX_CLIENT_STATUS_CHARACTERS = 256;
export const MAX_CLIENT_DOMAINS = 1_000;
export const MAX_CLIENT_DOMAINS_JSON_BYTES = 256 * 1024;
export const MAX_GORELO_DIRECTORY_IMPORT_BYTES = 8 * 1024 * 1024;
export const MAX_CLIENT_ALIAS_CHARACTERS = 512;
export const MAX_CLIENT_ALIAS_SCOPE_CHARACTERS = 128;
export const MAX_CLIENT_ALIASES_PER_BATCH = 100;
export const MAX_CLIENT_DIRECTORY_PAGE_SIZE = 500;

export interface ClientAlias {
  id: string;
  clientId: number;
  alias: string;
  normalizedAlias: string;
  scope: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface GoreloDirectoryClient {
  id: number;
  name: string;
  billingName: string | null;
  alternateName: string | null;
  status: string | null;
  domains: readonly string[];
  isDefault: boolean;
  importedAt: string;
  lastSeenAt: string;
  stale: boolean;
  aliases: readonly ClientAlias[];
}

export interface GoreloClientSyncMetadata {
  totalClients: number;
  currentClients: number;
  staleClients: number;
  lastSyncedAt: string | null;
}

export interface GoreloClientDirectoryPage {
  items: readonly GoreloDirectoryClient[];
  total: number;
  limit: number;
  offset: number;
  sync: GoreloClientSyncMetadata;
}

export interface GoreloClientDirectoryListOptions {
  limit?: number;
  offset?: number;
  includeStale?: boolean;
}

export interface GoreloClientImportResult {
  importedCount: number;
  createdCount: number;
  updatedCount: number;
  syncedAt: string;
  sync: GoreloClientSyncMetadata;
}

export interface ClientAliasCreateInput {
  alias: string;
  scope?: string;
}

export type ClientAliasUpdateResult =
  | { status: "updated"; alias: ClientAlias }
  | { status: "conflict"; current: ClientAlias }
  | { status: "not_found" };

export type ClientAliasDeleteResult =
  | { status: "deleted" }
  | { status: "conflict"; current: ClientAlias }
  | { status: "not_found" };

export type ClientIdentityMatchKind =
  | "scoped_alias"
  | "global_alias"
  | "name"
  | "billing_name"
  | "alternate_name"
  | "domain";

export type ClientIdentityResolution =
  | {
      status: "resolved";
      normalizedIdentity: string;
      client: GoreloDirectoryClient;
      matchedBy: ClientIdentityMatchKind;
      matchedValue: string;
      aliasScope?: string;
    }
  | {
      status: "not_found";
      normalizedIdentity: string;
      reason?: "stale_alias";
      aliasScope?: string;
    }
  | {
      status: "ambiguous";
      normalizedIdentity: string;
      candidates: readonly {
        clientId: number;
        clientName: string;
        matchedBy: ClientIdentityMatchKind;
      }[];
    };

interface ClientAliasRow {
  id: string;
  client_id: number;
  alias: string;
  normalized_alias: string;
  scope: string;
  created_at: string;
  updated_at: string;
  version: number;
}

interface ClientDirectoryRow {
  id: number;
  name: string;
  billing_name: string | null;
  alternate_name: string | null;
  status: string | null;
  domains_json: string;
  is_default: number;
  imported_at: string;
  last_seen_at: string;
  alias_id: string | null;
  alias_value: string | null;
  alias_normalized: string | null;
  alias_scope: string | null;
  alias_created_at: string | null;
  alias_updated_at: string | null;
  alias_version: number | null;
}

interface SyncMetadataRow {
  total_clients: number;
  current_clients: number;
}

interface ClientSyncRow {
  last_synced_at: string;
}

interface ValidatedCatalogItem {
  id: number;
  name: string;
  billingName: string | null;
  alternateName: string | null;
  status: string | null;
  domainsJson: string;
  isDefault: boolean;
}

const CLIENT_DIRECTORY_SELECT = `SELECT
       c.id, c.name, c.billing_name, c.alternate_name, c.status,
       c.domains_json, c.is_default, c.imported_at, c.last_seen_at,
       a.id AS alias_id, a.alias AS alias_value,
       a.normalized_alias AS alias_normalized, a.scope AS alias_scope,
       a.created_at AS alias_created_at, a.updated_at AS alias_updated_at,
       a.version AS alias_version
  FROM gorelo_clients c
  LEFT JOIN client_aliases a ON a.client_id = c.id`;

const CONTROL_CHARACTER = /\p{Cc}/u;
const CLIENT_IMPORT_CHUNK_BYTES = 512 * 1024;
const textEncoder = new TextEncoder();

export class ClientAliasConflictError extends Error {
  override readonly name = "ClientAliasConflictError";

  constructor(
    readonly scope: string,
    readonly normalizedAlias: string,
  ) {
    super(`Client alias already exists in scope ${scope}`);
  }
}

export class ClientAliasCanonicalConflictError extends Error {
  override readonly name = "ClientAliasCanonicalConflictError";

  constructor(
    readonly scope: string,
    readonly normalizedAlias: string,
  ) {
    super("Client alias matches another current Gorelo client's identity");
  }
}

function normalizedDisplayText(
  value: string,
  label: string,
  maximum: number,
): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  const unicodeNormalized = value.normalize("NFKC");
  if (CONTROL_CHARACTER.test(unicodeNormalized)) {
    throw new Error(`${label} must not contain control characters`);
  }
  const normalized = unicodeNormalized.trim().replace(/\s+/gu, " ");
  if (!normalized) throw new Error(`${label} must not be empty`);
  if (normalized.length > maximum) {
    throw new Error(`${label} must not exceed ${String(maximum)} characters`);
  }
  return normalized;
}

/**
 * Canonicalizes untrusted client identifiers without adding fuzzy matching.
 * This same representation is used for aliases and imported catalog fields.
 */
export function normalizeClientIdentity(value: string): string {
  return normalizedDisplayText(
    value,
    "client identity",
    MAX_CLIENT_ALIAS_CHARACTERS,
  ).toLowerCase();
}

function optionalDisplayText(
  value: string | null,
  label: string,
  maximum: number,
): string | null {
  if (value === null) return null;
  return normalizedDisplayText(value, label, maximum);
}

function positiveClientId(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("clientId must be a positive safe integer");
  }
  return value;
}

function positiveVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("expectedVersion must be a positive safe integer");
  }
  return value;
}

function normalizedScope(value: string | undefined): string {
  return normalizedDisplayText(
    value ?? "global",
    "alias scope",
    MAX_CLIENT_ALIAS_SCOPE_CHARACTERS,
  ).toLowerCase();
}

function isoTimestamp(value: Date | undefined, label: string): string {
  const candidate = value ?? new Date();
  if (!Number.isFinite(candidate.getTime()))
    throw new Error(`${label} is invalid`);
  return candidate.toISOString();
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const candidate = value ?? fallback;
  if (
    !Number.isSafeInteger(candidate) ||
    candidate < minimum ||
    candidate > maximum
  ) {
    throw new Error(
      `${label} must be an integer between ${String(minimum)} and ${String(maximum)}`,
    );
  }
  return candidate;
}

function validateCatalogItem(
  item: GoreloClientCatalogItem,
): ValidatedCatalogItem {
  const id = positiveClientId(item.id);
  const name = normalizedDisplayText(
    item.name,
    "client name",
    MAX_CLIENT_NAME_CHARACTERS,
  );
  const billingName = optionalDisplayText(
    item.billingName,
    "client billing name",
    MAX_CLIENT_NAME_CHARACTERS,
  );
  const alternateName = optionalDisplayText(
    item.alternateName,
    "client alternate name",
    MAX_CLIENT_NAME_CHARACTERS,
  );
  const status = optionalDisplayText(
    item.status,
    "client status",
    MAX_CLIENT_STATUS_CHARACTERS,
  );
  if (typeof item.isDefault !== "boolean") {
    throw new Error("client isDefault must be a boolean");
  }
  if (
    !Array.isArray(item.domains) ||
    item.domains.length > MAX_CLIENT_DOMAINS
  ) {
    throw new Error(
      `client domains must contain at most ${String(MAX_CLIENT_DOMAINS)} values`,
    );
  }
  const domains = [
    ...new Set(
      item.domains.map((domain) => {
        const normalized = normalizeClientIdentity(domain);
        if (normalized.length > 253) {
          throw new Error("client domain must not exceed 253 characters");
        }
        return normalized;
      }),
    ),
  ].sort();
  const domainsJson = JSON.stringify(domains);
  if (
    new TextEncoder().encode(domainsJson).byteLength >
    MAX_CLIENT_DOMAINS_JSON_BYTES
  ) {
    throw new Error("client domains exceed the storage size limit");
  }
  return {
    id,
    name,
    billingName,
    alternateName,
    status,
    domainsJson,
    isDefault: item.isDefault,
  };
}

function aliasFromRow(row: ClientAliasRow): ClientAlias {
  return {
    id: row.id,
    clientId: Number(row.client_id),
    alias: row.alias,
    normalizedAlias: row.normalized_alias,
    scope: row.scope,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: Number(row.version),
  };
}

function parseDomains(value: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Stored Gorelo client domains are invalid");
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every((domain) => typeof domain === "string")
  ) {
    throw new Error("Stored Gorelo client domains are invalid");
  }
  return parsed;
}

function rowsToClients(
  rows: readonly ClientDirectoryRow[],
  lastSyncedAt: string | null,
): GoreloDirectoryClient[] {
  const clients = new Map<number, GoreloDirectoryClient>();
  for (const row of rows) {
    let client = clients.get(Number(row.id));
    if (!client) {
      client = {
        id: Number(row.id),
        name: row.name,
        billingName: row.billing_name,
        alternateName: row.alternate_name,
        status: row.status,
        domains: parseDomains(row.domains_json),
        isDefault: row.is_default === 1,
        importedAt: row.imported_at,
        lastSeenAt: row.last_seen_at,
        stale: lastSyncedAt !== null && row.last_seen_at !== lastSyncedAt,
        aliases: [],
      };
      clients.set(client.id, client);
    }
    if (
      row.alias_id !== null &&
      row.alias_value !== null &&
      row.alias_normalized !== null &&
      row.alias_scope !== null &&
      row.alias_created_at !== null &&
      row.alias_updated_at !== null &&
      row.alias_version !== null
    ) {
      (client.aliases as ClientAlias[]).push({
        id: row.alias_id,
        clientId: client.id,
        alias: row.alias_value,
        normalizedAlias: row.alias_normalized,
        scope: row.alias_scope,
        createdAt: row.alias_created_at,
        updatedAt: row.alias_updated_at,
        version: Number(row.alias_version),
      });
    }
  }
  return [...clients.values()];
}

async function allDirectoryRows(db: D1Database): Promise<ClientDirectoryRow[]> {
  const result = await db
    .prepare(
      `${CLIENT_DIRECTORY_SELECT}
       ORDER BY c.is_default DESC, c.name COLLATE NOCASE ASC, c.id ASC,
                a.scope ASC, a.normalized_alias ASC, a.id ASC`,
    )
    .all<ClientDirectoryRow>();
  return result.results;
}

type CatalogMatchKind = Exclude<
  ClientIdentityMatchKind,
  "scoped_alias" | "global_alias"
>;

interface CurrentCatalogMatch {
  client: GoreloDirectoryClient;
  matchedBy: CatalogMatchKind;
}

async function directoryClients(
  db: D1Database,
): Promise<readonly GoreloDirectoryClient[]> {
  const sync = await getGoreloClientSyncMetadata(db);
  return rowsToClients(await allDirectoryRows(db), sync.lastSyncedAt);
}

async function currentDirectoryClients(
  db: D1Database,
): Promise<readonly GoreloDirectoryClient[]> {
  return (await directoryClients(db)).filter((client) => !client.stale);
}

function currentCatalogMatches(
  clients: readonly GoreloDirectoryClient[],
  normalizedIdentities: ReadonlySet<string>,
): Map<string, Map<number, CurrentCatalogMatch>> {
  const matches = new Map<string, Map<number, CurrentCatalogMatch>>();
  for (const client of clients) {
    const candidates: readonly (readonly [CatalogMatchKind, string | null])[] =
      [
        ["name", client.name],
        ["billing_name", client.billingName],
        ["alternate_name", client.alternateName],
        ...client.domains.map((domain) => ["domain", domain] as const),
      ];
    for (const [matchedBy, value] of candidates) {
      if (value === null) continue;
      const normalized = normalizeClientIdentity(value);
      if (!normalizedIdentities.has(normalized)) continue;
      let identityMatches = matches.get(normalized);
      if (!identityMatches) {
        identityMatches = new Map();
        matches.set(normalized, identityMatches);
      }
      if (!identityMatches.has(client.id)) {
        identityMatches.set(client.id, { client, matchedBy });
      }
    }
  }
  return matches;
}

export async function getGoreloClientSyncMetadata(
  db: D1Database,
): Promise<GoreloClientSyncMetadata> {
  const sync = await db
    .prepare(
      `SELECT last_synced_at
         FROM gorelo_client_sync
        WHERE id = 1
        LIMIT 1`,
    )
    .first<ClientSyncRow>();
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total_clients,
              COALESCE(SUM(
                CASE WHEN last_seen_at = ? THEN 1 ELSE 0 END
              ), 0) AS current_clients
         FROM gorelo_clients`,
    )
    .bind(sync?.last_synced_at ?? "")
    .first<SyncMetadataRow>();
  const totalClients = Number(row?.total_clients ?? 0);
  const currentClients = Number(row?.current_clients ?? 0);
  return {
    totalClients,
    currentClients,
    staleClients: totalClients - currentClients,
    lastSyncedAt: sync?.last_synced_at ?? null,
  };
}

/**
 * Atomically upserts one complete Gorelo client catalog. Existing rows that are
 * not present are retained and become stale so their aliases cannot be lost.
 * Imports with an older or equal sync marker are atomic no-ops; this prevents a
 * late request from rolling back or merging with the latest complete snapshot.
 */
export async function importGoreloClients(
  db: D1Database,
  items: readonly GoreloClientCatalogItem[],
  options: { syncedAt?: Date } = {},
): Promise<GoreloClientImportResult> {
  if (!Array.isArray(items)) throw new Error("clients must be an array");
  if (items.length > MAX_GORELO_DIRECTORY_CLIENTS_PER_IMPORT) {
    throw new Error(
      `client import must not exceed ${String(MAX_GORELO_DIRECTORY_CLIENTS_PER_IMPORT)} clients`,
    );
  }
  const syncedAt = isoTimestamp(options.syncedAt, "client sync timestamp");
  const validated = items.map(validateCatalogItem);
  const identifiers = new Set<number>();
  for (const item of validated) {
    if (identifiers.has(item.id)) {
      throw new Error(
        `client import contains duplicate client ID ${String(item.id)}`,
      );
    }
    identifiers.add(item.id);
  }

  const existingResult = await db
    .prepare("SELECT id FROM gorelo_clients")
    .all<{ id: number }>();
  const existingIds = new Set(
    existingResult.results.map((row) => Number(row.id)),
  );
  const updatedCount = validated.reduce(
    (count, item) => count + (existingIds.has(item.id) ? 1 : 0),
    0,
  );
  const createdCount = validated.length - updatedCount;

  const statements: D1PreparedStatement[] = [];
  if (validated.length > 0) {
    const serializedItems = validated.map((item) => JSON.stringify(item));
    const totalBytes = serializedItems.reduce(
      (bytes, item) => bytes + textEncoder.encode(item).byteLength + 1,
      2,
    );
    if (totalBytes > MAX_GORELO_DIRECTORY_IMPORT_BYTES) {
      throw new Error(
        `client import must not exceed ${String(MAX_GORELO_DIRECTORY_IMPORT_BYTES)} UTF-8 bytes`,
      );
    }
    const chunks: string[][] = [];
    let chunk: string[] = [];
    let chunkBytes = 2;
    for (const item of serializedItems) {
      const itemBytes = textEncoder.encode(item).byteLength + 1;
      if (
        chunk.length > 0 &&
        chunkBytes + itemBytes > CLIENT_IMPORT_CHUNK_BYTES
      ) {
        chunks.push(chunk);
        chunk = [];
        chunkBytes = 2;
      }
      chunk.push(item);
      chunkBytes += itemBytes;
    }
    if (chunk.length > 0) chunks.push(chunk);

    statements.push(
      ...chunks.map((items) =>
        db
          .prepare(
            `INSERT INTO gorelo_clients (
             id, name, billing_name, alternate_name, status, domains_json,
             is_default, imported_at, last_seen_at
           )
           SELECT CAST(json_extract(value, '$.id') AS INTEGER),
                  json_extract(value, '$.name'),
                  json_extract(value, '$.billingName'),
                  json_extract(value, '$.alternateName'),
                  json_extract(value, '$.status'),
                  json_extract(value, '$.domainsJson'),
                  CAST(json_extract(value, '$.isDefault') AS INTEGER),
                  ?, ?
             FROM json_each(?)
            WHERE ? > COALESCE(
              (SELECT last_synced_at
                 FROM gorelo_client_sync
                WHERE id = 1),
              ''
            )
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             billing_name = excluded.billing_name,
             alternate_name = excluded.alternate_name,
             status = excluded.status,
             domains_json = excluded.domains_json,
             is_default = excluded.is_default,
             last_seen_at = CASE
               WHEN excluded.last_seen_at > gorelo_clients.last_seen_at
                 THEN excluded.last_seen_at
               ELSE gorelo_clients.last_seen_at
             END`,
          )
          .bind(syncedAt, syncedAt, `[${items.join(",")}]`, syncedAt),
      ),
    );
  }
  statements.push(
    db
      .prepare(
        `INSERT INTO gorelo_client_sync
           (id, last_synced_at, imported_count, updated_at)
         VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           last_synced_at = excluded.last_synced_at,
           imported_count = excluded.imported_count,
           updated_at = excluded.updated_at
         WHERE excluded.last_synced_at > gorelo_client_sync.last_synced_at`,
      )
      .bind(syncedAt, validated.length, syncedAt),
  );
  const results = await db.batch(statements);
  const markerResult = results.at(-1);
  const applied = Number(markerResult?.meta.changes ?? 0) === 1;
  const sync = await getGoreloClientSyncMetadata(db);

  // A complete catalog is a snapshot, so equal markers must be serialized as
  // well as older ones. Treating an equal marker as another successful import
  // would merge two snapshots and incorrectly leave their union current.
  if (!applied) {
    return {
      importedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      syncedAt: sync.lastSyncedAt ?? syncedAt,
      sync,
    };
  }

  return {
    importedCount: validated.length,
    createdCount,
    updatedCount,
    syncedAt,
    sync,
  };
}

async function directoryPage(
  db: D1Database,
  query: string | undefined,
  options: GoreloClientDirectoryListOptions,
): Promise<GoreloClientDirectoryPage> {
  const limit = boundedInteger(
    options.limit,
    100,
    1,
    MAX_CLIENT_DIRECTORY_PAGE_SIZE,
    "limit",
  );
  const offset = boundedInteger(
    options.offset,
    0,
    0,
    Number.MAX_SAFE_INTEGER,
    "offset",
  );
  const sync = await getGoreloClientSyncMetadata(db);
  let clients = rowsToClients(await allDirectoryRows(db), sync.lastSyncedAt);
  if (options.includeStale === false) {
    clients = clients.filter((client) => !client.stale);
  }
  if (query !== undefined) {
    const normalizedQuery = normalizeClientIdentity(query);
    clients = clients.filter((client) =>
      [
        client.name,
        client.billingName,
        client.alternateName,
        ...client.domains,
        ...client.aliases.map((alias) => alias.alias),
      ].some(
        (value) =>
          value !== null &&
          normalizeClientIdentity(value).includes(normalizedQuery),
      ),
    );
  }
  return {
    items: clients.slice(offset, offset + limit),
    total: clients.length,
    limit,
    offset,
    sync,
  };
}

export async function listGoreloClients(
  db: D1Database,
  options: GoreloClientDirectoryListOptions = {},
): Promise<GoreloClientDirectoryPage> {
  return directoryPage(db, undefined, options);
}

export async function searchGoreloClients(
  db: D1Database,
  query: string,
  options: GoreloClientDirectoryListOptions = {},
): Promise<GoreloClientDirectoryPage> {
  return directoryPage(db, query, options);
}

async function clientExists(
  db: D1Database,
  clientId: number,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT id FROM gorelo_clients WHERE id = ? LIMIT 1")
    .bind(clientId)
    .first<{ id: number }>();
  return row !== null;
}

async function getClientAlias(
  db: D1Database,
  id: string,
): Promise<ClientAlias | null> {
  const row = await db
    .prepare(
      `SELECT id, client_id, alias, normalized_alias, scope,
              created_at, updated_at, version
         FROM client_aliases
        WHERE id = ?
        LIMIT 1`,
    )
    .bind(id)
    .first<ClientAliasRow>();
  return row ? aliasFromRow(row) : null;
}

function isUniqueAliasError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /(?:unique|constraint).*client_aliases|client_aliases.*(?:unique|constraint)/iu.test(
      error.message,
    )
  );
}

export async function createClientAlias(
  db: D1Database,
  input: {
    clientId: number;
    alias: string;
    scope?: string;
    now?: Date;
  },
): Promise<ClientAlias> {
  const aliases = await createClientAliases(db, {
    clientId: input.clientId,
    aliases: [
      {
        alias: input.alias,
        ...(input.scope === undefined ? {} : { scope: input.scope }),
      },
    ],
    ...(input.now === undefined ? {} : { now: input.now }),
  });
  return aliases[0]!;
}

/**
 * Creates several exact aliases for one client in a single SQL statement.
 * Validation and conflict detection happen before the write, while the unique
 * index remains the final concurrency guard. A conflict therefore creates none
 * of the requested aliases.
 */
export async function createClientAliases(
  db: D1Database,
  input: {
    clientId: number;
    aliases: readonly ClientAliasCreateInput[];
    now?: Date;
  },
): Promise<readonly ClientAlias[]> {
  const clientId = positiveClientId(input.clientId);
  if (!Array.isArray(input.aliases) || input.aliases.length === 0) {
    throw new Error("aliases must contain at least one client alias");
  }
  if (input.aliases.length > MAX_CLIENT_ALIASES_PER_BATCH) {
    throw new Error(
      `aliases must contain at most ${String(MAX_CLIENT_ALIASES_PER_BATCH)} client aliases`,
    );
  }
  const now = isoTimestamp(input.now, "alias timestamp");
  if (!(await clientExists(db, clientId))) {
    throw new Error(`Gorelo client ${String(clientId)} does not exist`);
  }

  const seen = new Set<string>();
  const entries = input.aliases.map((candidate) => {
    const alias = normalizedDisplayText(
      candidate.alias,
      "client alias",
      MAX_CLIENT_ALIAS_CHARACTERS,
    );
    const normalizedAlias = normalizeClientIdentity(alias);
    const scope = normalizedScope(candidate.scope);
    const key = `${scope}\u0000${normalizedAlias}`;
    if (seen.has(key)) {
      throw new ClientAliasConflictError(scope, normalizedAlias);
    }
    seen.add(key);
    return {
      id: crypto.randomUUID(),
      clientId,
      alias,
      normalizedAlias,
      scope,
      createdAt: now,
      updatedAt: now,
      version: 1,
    } satisfies ClientAlias;
  });

  const catalogMatches = currentCatalogMatches(
    await currentDirectoryClients(db),
    new Set(entries.map((entry) => entry.normalizedAlias)),
  );
  for (const entry of entries) {
    const matches = catalogMatches.get(entry.normalizedAlias);
    if (matches && [...matches.keys()].some((id) => id !== clientId)) {
      throw new ClientAliasCanonicalConflictError(
        entry.scope,
        entry.normalizedAlias,
      );
    }
  }

  const serializedEntries = JSON.stringify(
    entries.map((entry, index) => ({
      index,
      id: entry.id,
      alias: entry.alias,
      normalizedAlias: entry.normalizedAlias,
      scope: entry.scope,
    })),
  );
  const existing = await db
    .prepare(
      `SELECT a.scope, a.normalized_alias
         FROM json_each(?) requested
         JOIN client_aliases a
           ON a.scope = json_extract(requested.value, '$.scope')
          AND a.normalized_alias = json_extract(
                requested.value,
                '$.normalizedAlias'
              )
        ORDER BY CAST(json_extract(requested.value, '$.index') AS INTEGER)
        LIMIT 1`,
    )
    .bind(serializedEntries)
    .first<{ scope: string; normalized_alias: string }>();
  if (existing) {
    throw new ClientAliasConflictError(
      existing.scope,
      existing.normalized_alias,
    );
  }

  try {
    const result = await db
      .prepare(
        `INSERT INTO client_aliases (
           id, client_id, alias, normalized_alias, scope,
           created_at, updated_at, version
         )
         SELECT json_extract(value, '$.id'), ?,
                json_extract(value, '$.alias'),
                json_extract(value, '$.normalizedAlias'),
                json_extract(value, '$.scope'), ?, ?, 1
           FROM json_each(?)`,
      )
      .bind(clientId, now, now, serializedEntries)
      .run();
    if (Number(result.meta.changes ?? 0) !== entries.length) {
      throw new Error("Not all client aliases were created");
    }
  } catch (error) {
    if (isUniqueAliasError(error)) {
      const conflict = await db
        .prepare(
          `SELECT a.scope, a.normalized_alias
             FROM json_each(?) requested
             JOIN client_aliases a
               ON a.scope = json_extract(requested.value, '$.scope')
              AND a.normalized_alias = json_extract(
                    requested.value,
                    '$.normalizedAlias'
                  )
            ORDER BY CAST(json_extract(requested.value, '$.index') AS INTEGER)
            LIMIT 1`,
        )
        .bind(serializedEntries)
        .first<{ scope: string; normalized_alias: string }>();
      throw new ClientAliasConflictError(
        conflict?.scope ?? entries[0]!.scope,
        conflict?.normalized_alias ?? entries[0]!.normalizedAlias,
      );
    }
    throw error;
  }
  return entries;
}

export async function updateClientAlias(
  db: D1Database,
  id: string,
  expectedVersion: number,
  input: { alias: string; scope?: string; now?: Date },
): Promise<ClientAliasUpdateResult> {
  const current = await getClientAlias(db, id);
  if (!current) return { status: "not_found" };
  const version = positiveVersion(expectedVersion);
  const alias = normalizedDisplayText(
    input.alias,
    "client alias",
    MAX_CLIENT_ALIAS_CHARACTERS,
  );
  const normalizedAlias = normalizeClientIdentity(alias);
  const scope = normalizedScope(input.scope ?? current.scope);
  const updatedAt = isoTimestamp(input.now, "alias timestamp");
  const catalogMatches = currentCatalogMatches(
    await currentDirectoryClients(db),
    new Set([normalizedAlias]),
  ).get(normalizedAlias);
  if (
    catalogMatches &&
    [...catalogMatches.keys()].some((clientId) => clientId !== current.clientId)
  ) {
    throw new ClientAliasCanonicalConflictError(scope, normalizedAlias);
  }
  let result: D1Result;
  try {
    result = await db
      .prepare(
        `UPDATE client_aliases
            SET alias = ?, normalized_alias = ?, scope = ?, updated_at = ?,
                version = version + 1
          WHERE id = ? AND version = ?`,
      )
      .bind(alias, normalizedAlias, scope, updatedAt, id, version)
      .run();
  } catch (error) {
    if (isUniqueAliasError(error)) {
      throw new ClientAliasConflictError(scope, normalizedAlias);
    }
    throw error;
  }
  if (Number(result.meta.changes ?? 0) === 0) {
    const latest = await getClientAlias(db, id);
    return latest
      ? { status: "conflict", current: latest }
      : { status: "not_found" };
  }
  const updated = await getClientAlias(db, id);
  if (!updated) throw new Error("Updated client alias could not be read");
  return { status: "updated", alias: updated };
}

export async function deleteClientAlias(
  db: D1Database,
  id: string,
  expectedVersion: number,
): Promise<ClientAliasDeleteResult> {
  const version = positiveVersion(expectedVersion);
  const result = await db
    .prepare("DELETE FROM client_aliases WHERE id = ? AND version = ?")
    .bind(id, version)
    .run();
  if (Number(result.meta.changes ?? 0) > 0) return { status: "deleted" };
  const current = await getClientAlias(db, id);
  return current ? { status: "conflict", current } : { status: "not_found" };
}

async function aliasClientId(
  db: D1Database,
  normalizedAlias: string,
  scope: string,
): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT client_id
         FROM client_aliases
        WHERE scope = ? AND normalized_alias = ?
        LIMIT 1`,
    )
    .bind(scope, normalizedAlias)
    .first<{ client_id: number }>();
  return row ? Number(row.client_id) : null;
}

async function resolvedAlias(
  db: D1Database,
  normalizedIdentity: string,
  scope: string,
  matchedBy: "scoped_alias" | "global_alias",
  clientsById: ReadonlyMap<number, GoreloDirectoryClient>,
  catalogMatches: ReadonlyMap<number, CurrentCatalogMatch>,
): Promise<ClientIdentityResolution | null> {
  const clientId = await aliasClientId(db, normalizedIdentity, scope);
  if (clientId === null) return null;
  const client = clientsById.get(clientId);
  if (!client)
    throw new Error("Client alias references a missing Gorelo client");
  if (client.stale) {
    return {
      status: "not_found",
      normalizedIdentity,
      reason: "stale_alias",
      aliasScope: scope,
    };
  }
  const conflictingCatalogMatches = [...catalogMatches.values()].filter(
    (match) => match.client.id !== client.id,
  );
  if (conflictingCatalogMatches.length > 0) {
    return {
      status: "ambiguous",
      normalizedIdentity,
      candidates: [
        {
          clientId: client.id,
          clientName: client.name,
          matchedBy,
        },
        ...conflictingCatalogMatches.map((match) => ({
          clientId: match.client.id,
          clientName: match.client.name,
          matchedBy: match.matchedBy,
        })),
      ],
    };
  }
  return {
    status: "resolved",
    normalizedIdentity,
    client,
    matchedBy,
    matchedValue: normalizedIdentity,
    aliasScope: scope,
  };
}

/** Resolves aliases by scope priority, then exact catalog identities only. */
export async function resolveClientIdentity(
  db: D1Database,
  identity: string,
  options: { scope?: string } = {},
): Promise<ClientIdentityResolution> {
  const normalizedIdentity = normalizeClientIdentity(identity);
  const scope = normalizedScope(options.scope);
  const clients = await directoryClients(db);
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const catalogMatches =
    currentCatalogMatches(
      clients.filter((client) => !client.stale),
      new Set([normalizedIdentity]),
    ).get(normalizedIdentity) ?? new Map<number, CurrentCatalogMatch>();
  if (scope !== "global") {
    const scoped = await resolvedAlias(
      db,
      normalizedIdentity,
      scope,
      "scoped_alias",
      clientsById,
      catalogMatches,
    );
    if (scoped) return scoped;
  }
  const global = await resolvedAlias(
    db,
    normalizedIdentity,
    "global",
    "global_alias",
    clientsById,
    catalogMatches,
  );
  if (global) return global;

  if (catalogMatches.size === 0)
    return { status: "not_found", normalizedIdentity };
  if (catalogMatches.size === 1) {
    const match = [...catalogMatches.values()][0]!;
    return {
      status: "resolved",
      normalizedIdentity,
      client: match.client,
      matchedBy: match.matchedBy,
      matchedValue: normalizedIdentity,
    };
  }
  return {
    status: "ambiguous",
    normalizedIdentity,
    candidates: [...catalogMatches.values()].map((match) => ({
      clientId: match.client.id,
      clientName: match.client.name,
      matchedBy: match.matchedBy,
    })),
  };
}
