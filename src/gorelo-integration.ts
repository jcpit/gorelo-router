import {
  createGoreloClient,
  GoreloClientError,
  type GoreloClient,
  type GoreloClientCatalogItem,
  type GoreloNetworkFailureReason,
  type GoreloPage,
  type GoreloRequestFailurePhase,
} from "./gorelo";
import {
  getFreshGoreloCatalogCache,
  goreloCatalogCacheKey,
  MAX_GORELO_CATALOG_CACHE_BYTES,
  putGoreloCatalogCache,
} from "./gorelo-cache";
import type { Env, RuntimeConfig } from "./types";

export const GORELO_CATALOG_KINDS = [
  "clients",
  "locations",
  "contacts",
  "agent-assets",
  "users",
  "groups",
  "ticket-statuses",
  "ticket-tags",
  "ticket-types",
] as const;

export type GoreloCatalogKind = (typeof GORELO_CATALOG_KINDS)[number];

const SETUP_CATALOG_KINDS = [
  "clients",
  "agent-assets",
  "users",
  "groups",
  "ticket-statuses",
  "ticket-tags",
  "ticket-types",
] as const satisfies readonly GoreloCatalogKind[];
const MAX_IMPORTED_CLIENTS = 5_000;
const MAX_CLIENT_IMPORT_PAGES = 100;
const MAX_PAGED_CATALOG_ITEMS = 5_000;
const MAX_PAGED_CATALOG_PAGES = 100;
const GORELO_CATALOG_PAGE_SIZE = 200;
export const GORELO_SETUP_PROBE_TIMEOUT_MS = 3_000;

export interface GoreloCatalogSnapshot {
  kind: GoreloCatalogKind;
  items: readonly unknown[];
  totalCount: number;
  fetchedAt: string;
  expiresAt: string;
  cached: boolean;
  clientId?: number;
  pagination?: {
    nextCursor: string | null;
    previousCursor: string | null;
    hasMore: boolean;
    hasPrevious: boolean;
  };
}

export interface GoreloConnectionTestResult {
  connected: true;
  checkedAt: string;
  baseUrl: string;
  catalogCounts: Readonly<Record<string, number>>;
}

export interface GoreloIntegrationDiagnostic {
  stage: GoreloCatalogKind | "connection";
  phase?: GoreloRequestFailurePhase;
  reason?: GoreloNetworkFailureReason;
}

export class GoreloIntegrationError extends Error {
  override readonly name = "GoreloIntegrationError";

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly upstreamStatus?: number,
    readonly diagnostic?: GoreloIntegrationDiagnostic,
  ) {
    super(message);
  }
}

function integrationClient(
  env: Env,
  config: RuntimeConfig,
  timeoutMs?: number,
): GoreloClient {
  const apiKey = env.GORELO_API_KEY;
  if (!config.goreloApiConfigured || !apiKey) {
    throw new GoreloIntegrationError(
      409,
      "not_configured",
      "Gorelo API is not configured; set the GORELO_API_KEY Worker secret",
      undefined,
      { stage: "connection", phase: "request" },
    );
  }
  try {
    return createGoreloClient({
      baseUrl: config.goreloApiBaseUrl,
      apiKey,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });
  } catch (error) {
    throw mapGoreloError(error, "connection");
  }
}

function mapGoreloError(
  error: unknown,
  stage?: GoreloIntegrationDiagnostic["stage"],
): GoreloIntegrationError {
  if (error instanceof GoreloIntegrationError) {
    if (!stage || error.diagnostic) return error;
    return new GoreloIntegrationError(
      error.status,
      error.code,
      error.message,
      error.upstreamStatus,
      { stage },
    );
  }
  const diagnostic: GoreloIntegrationDiagnostic | undefined = stage
    ? {
        stage,
        ...(error instanceof GoreloClientError && error.diagnostic
          ? {
              phase: error.diagnostic.phase,
              ...(error.diagnostic.reason
                ? { reason: error.diagnostic.reason }
                : {}),
            }
          : error instanceof GoreloClientError
            ? {
                phase:
                  error.code === "invalid_configuration" ||
                  error.code === "timeout" ||
                  error.code === "network_error"
                    ? "request"
                    : "response",
              }
            : stage === "connection"
              ? { phase: "request" }
              : {}),
      }
    : undefined;
  if (!(error instanceof GoreloClientError)) {
    return new GoreloIntegrationError(
      502,
      "unexpected_error",
      "Gorelo API request failed safely",
      undefined,
      diagnostic,
    );
  }
  if (error.code === "invalid_configuration") {
    return new GoreloIntegrationError(
      503,
      error.code,
      error.message,
      undefined,
      diagnostic,
    );
  }
  if (error.code === "timeout") {
    return new GoreloIntegrationError(
      504,
      error.code,
      error.message,
      undefined,
      diagnostic,
    );
  }
  if (error.status === 401 || error.status === 403) {
    return new GoreloIntegrationError(
      502,
      "authentication_failed",
      "Gorelo rejected the API key or its assigned scopes",
      error.status,
      diagnostic,
    );
  }
  if (error.status === 429) {
    return new GoreloIntegrationError(
      503,
      "rate_limited",
      "Gorelo temporarily rate limited the connection test",
      error.status,
      diagnostic,
    );
  }
  return new GoreloIntegrationError(
    502,
    error.code,
    error.message,
    error.status,
    diagnostic,
  );
}

function scopedClientId(
  kind: GoreloCatalogKind,
  clientId: number | undefined,
): number | undefined {
  const requiresClient = kind === "locations" || kind === "contacts";
  if (requiresClient && clientId === undefined) {
    throw new GoreloIntegrationError(
      400,
      "client_required",
      `${kind} catalog requires a clientId`,
    );
  }
  if (
    clientId !== undefined &&
    (!Number.isSafeInteger(clientId) || clientId <= 0)
  ) {
    throw new GoreloIntegrationError(
      400,
      "invalid_client",
      "clientId must be a positive safe integer",
    );
  }
  return clientId;
}

function expiration(
  fetchedAt: Date,
  config: RuntimeConfig,
): { fetchedAt: string; expiresAt: string } {
  return {
    fetchedAt: fetchedAt.toISOString(),
    expiresAt: new Date(
      fetchedAt.getTime() + config.goreloCatalogCacheSeconds * 1_000,
    ).toISOString(),
  };
}

async function fetchCompletePagedCatalog<T extends { id: number | string }>(
  kind: GoreloCatalogKind,
  fetchPage: (cursor?: string) => Promise<GoreloPage<T>>,
): Promise<GoreloPage<T>> {
  const items: T[] = [];
  const seenIds = new Set<number | string>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let reportedTotal = 0;

  for (
    let pageNumber = 0;
    pageNumber < MAX_PAGED_CATALOG_PAGES;
    pageNumber += 1
  ) {
    const page = await fetchPage(cursor);
    reportedTotal = Math.max(reportedTotal, page.totalCount);
    if (reportedTotal > MAX_PAGED_CATALOG_ITEMS) {
      throw new GoreloIntegrationError(
        422,
        "catalog_limit",
        `Gorelo ${kind} catalog exceeds the ${MAX_PAGED_CATALOG_ITEMS}-item selector limit`,
      );
    }
    for (const item of page.data) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      items.push(item);
      if (items.length > MAX_PAGED_CATALOG_ITEMS) {
        throw new GoreloIntegrationError(
          422,
          "catalog_limit",
          `Gorelo ${kind} catalog exceeds the ${MAX_PAGED_CATALOG_ITEMS}-item selector limit`,
        );
      }
    }
    if (!page.hasMore) {
      return {
        data: items,
        totalCount: reportedTotal,
        nextCursor: null,
        previousCursor: null,
        hasMore: false,
        hasPrevious: false,
      };
    }
    if (!page.nextCursor || seenCursors.has(page.nextCursor)) {
      throw new GoreloIntegrationError(
        502,
        "invalid_pagination",
        `Gorelo returned an invalid ${kind} pagination cursor`,
      );
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  throw new GoreloIntegrationError(
    422,
    "catalog_limit",
    `Gorelo ${kind} catalog exceeded the bounded page limit`,
  );
}

async function fetchCatalog(
  client: GoreloClient,
  config: RuntimeConfig,
  kind: GoreloCatalogKind,
  clientId?: number,
): Promise<GoreloCatalogSnapshot> {
  const scope = scopedClientId(kind, clientId);
  const timestamps = expiration(new Date(), config);
  try {
    switch (kind) {
      case "clients": {
        const page = await fetchCompletePagedCatalog(kind, (cursor) =>
          client.listClients({
            pageSize: GORELO_CATALOG_PAGE_SIZE,
            ...(cursor ? { cursor } : {}),
          }),
        );
        return pageSnapshot(kind, page, timestamps);
      }
      case "locations": {
        const items = await client.listLocations(scope!);
        return directSnapshot(kind, items, timestamps, scope);
      }
      case "contacts": {
        const page = await fetchCompletePagedCatalog(kind, (cursor) =>
          client.listContacts({
            clientId: scope!,
            pageSize: GORELO_CATALOG_PAGE_SIZE,
            ...(cursor ? { cursor } : {}),
          }),
        );
        return pageSnapshot(kind, page, timestamps, scope);
      }
      case "agent-assets": {
        const page = await fetchCompletePagedCatalog(kind, (cursor) =>
          client.listAgentAssets({
            pageSize: GORELO_CATALOG_PAGE_SIZE,
            ...(cursor ? { cursor } : {}),
          }),
        );
        return pageSnapshot(kind, page, timestamps);
      }
      case "users": {
        const page = await fetchCompletePagedCatalog(kind, (cursor) =>
          client.listUsers({
            pageSize: GORELO_CATALOG_PAGE_SIZE,
            ...(cursor ? { cursor } : {}),
          }),
        );
        return pageSnapshot(kind, page, timestamps);
      }
      case "groups":
        return directSnapshot(kind, await client.listGroups(), timestamps);
      case "ticket-statuses":
        return directSnapshot(
          kind,
          await client.listTicketStatuses(),
          timestamps,
        );
      case "ticket-tags":
        return directSnapshot(kind, await client.listTicketTags(), timestamps);
      case "ticket-types":
        return directSnapshot(kind, await client.listTicketTypes(), timestamps);
    }
  } catch (error) {
    throw mapGoreloError(error, kind);
  }
}

function directSnapshot(
  kind: GoreloCatalogKind,
  items: readonly unknown[],
  timestamps: { fetchedAt: string; expiresAt: string },
  clientId?: number,
): GoreloCatalogSnapshot {
  return {
    kind,
    items,
    totalCount: items.length,
    ...timestamps,
    cached: false,
    ...(clientId === undefined ? {} : { clientId }),
  };
}

function pageSnapshot(
  kind: GoreloCatalogKind,
  page: {
    data: readonly unknown[];
    totalCount: number;
    nextCursor: string | null;
    previousCursor: string | null;
    hasMore: boolean;
    hasPrevious: boolean;
  },
  timestamps: { fetchedAt: string; expiresAt: string },
  clientId?: number,
): GoreloCatalogSnapshot {
  return {
    kind,
    items: page.data,
    totalCount: page.totalCount,
    ...timestamps,
    cached: false,
    ...(clientId === undefined ? {} : { clientId }),
    pagination: {
      nextCursor: page.nextCursor,
      previousCursor: page.previousCursor,
      hasMore: page.hasMore,
      hasPrevious: page.hasPrevious,
    },
  };
}

function cachedSnapshot(payload: unknown): GoreloCatalogSnapshot | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const snapshot = payload as Partial<GoreloCatalogSnapshot>;
  if (
    !GORELO_CATALOG_KINDS.includes(snapshot.kind as GoreloCatalogKind) ||
    !Array.isArray(snapshot.items) ||
    !Number.isInteger(snapshot.totalCount) ||
    (snapshot.totalCount ?? -1) < 0 ||
    typeof snapshot.fetchedAt !== "string" ||
    typeof snapshot.expiresAt !== "string" ||
    snapshot.pagination?.hasMore === true
  ) {
    return undefined;
  }
  return { ...(snapshot as GoreloCatalogSnapshot), cached: true };
}

async function cacheCatalog(
  db: D1Database,
  snapshot: GoreloCatalogSnapshot,
): Promise<void> {
  const payloadBytes = new TextEncoder().encode(
    JSON.stringify(snapshot),
  ).byteLength;
  if (payloadBytes > MAX_GORELO_CATALOG_CACHE_BYTES) return;
  const clientId = snapshot.clientId?.toString();
  await putGoreloCatalogCache(db, {
    key: goreloCatalogCacheKey(snapshot.kind, clientId),
    kind: snapshot.kind,
    ...(clientId ? { clientId } : {}),
    payload: snapshot,
    itemCount: snapshot.items.length,
    fetchedAt: snapshot.fetchedAt,
    expiresAt: snapshot.expiresAt,
  });
}

export async function getGoreloCatalog(
  env: Env,
  config: RuntimeConfig,
  kind: GoreloCatalogKind,
  options: { clientId?: number; refresh?: boolean } = {},
): Promise<GoreloCatalogSnapshot> {
  const clientId = scopedClientId(kind, options.clientId);
  const key = goreloCatalogCacheKey(kind, clientId?.toString());
  if (!options.refresh) {
    const cached = await getFreshGoreloCatalogCache(env.DB, key);
    const snapshot = cachedSnapshot(cached?.payload);
    if (snapshot) return snapshot;
  }
  const snapshot = await fetchCatalog(
    integrationClient(env, config),
    config,
    kind,
    clientId,
  );
  await cacheCatalog(env.DB, snapshot);
  return snapshot;
}

export async function testGoreloConnection(
  env: Env,
  config: RuntimeConfig,
): Promise<GoreloConnectionTestResult> {
  const client = integrationClient(env, config, GORELO_SETUP_PROBE_TIMEOUT_MS);
  const catalogCounts: Record<string, number> = {};
  for (const kind of SETUP_CATALOG_KINDS) {
    try {
      switch (kind) {
        case "clients":
          catalogCounts[kind] = (
            await client.listClients({ pageSize: 1 })
          ).totalCount;
          break;
        case "agent-assets":
          catalogCounts[kind] = (
            await client.listAgentAssets({ pageSize: 1 })
          ).totalCount;
          break;
        case "users":
          catalogCounts[kind] = (
            await client.listUsers({ pageSize: 1 })
          ).totalCount;
          break;
        case "groups":
          catalogCounts[kind] = (await client.listGroups()).length;
          break;
        case "ticket-statuses":
          catalogCounts[kind] = (await client.listTicketStatuses()).length;
          break;
        case "ticket-tags":
          catalogCounts[kind] = (await client.listTicketTags()).length;
          break;
        case "ticket-types":
          catalogCounts[kind] = (await client.listTicketTypes()).length;
          break;
      }
    } catch (error) {
      throw mapGoreloError(error, kind);
    }
  }
  return {
    connected: true,
    checkedAt: new Date().toISOString(),
    baseUrl: client.baseUrl,
    catalogCounts,
  };
}

export async function fetchAllGoreloClients(
  env: Env,
  config: RuntimeConfig,
): Promise<GoreloClientCatalogItem[]> {
  const client = integrationClient(env, config);
  const clients: GoreloClientCatalogItem[] = [];
  const seenIds = new Set<number>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  try {
    for (
      let pageNumber = 0;
      pageNumber < MAX_CLIENT_IMPORT_PAGES;
      pageNumber += 1
    ) {
      const page = await client.listClients({
        pageSize: 200,
        ...(cursor ? { cursor } : {}),
      });
      if (page.totalCount > MAX_IMPORTED_CLIENTS) {
        throw new GoreloIntegrationError(
          422,
          "catalog_limit",
          `Gorelo returned more than ${MAX_IMPORTED_CLIENTS} clients; narrow the integration before importing`,
        );
      }
      for (const item of page.data) {
        if (seenIds.has(item.id)) continue;
        seenIds.add(item.id);
        clients.push(item);
        if (clients.length > MAX_IMPORTED_CLIENTS) {
          throw new GoreloIntegrationError(
            422,
            "catalog_limit",
            `Gorelo client import exceeded ${MAX_IMPORTED_CLIENTS} records`,
          );
        }
      }
      if (!page.hasMore) return clients;
      if (!page.nextCursor || seenCursors.has(page.nextCursor)) {
        throw new GoreloIntegrationError(
          502,
          "invalid_pagination",
          "Gorelo returned an invalid client pagination cursor",
        );
      }
      seenCursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }
    throw new GoreloIntegrationError(
      422,
      "catalog_limit",
      "Gorelo client import exceeded the bounded page limit",
    );
  } catch (error) {
    throw mapGoreloError(error, "clients");
  }
}
