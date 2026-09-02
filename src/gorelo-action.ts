import { resolveClientIdentity } from "./client-directory";
import { canonicalizeDeliveryPayload } from "./delivery-repository";
import { extractWebhookVariables } from "./extraction";
import type {
  GoreloAgentAssetCatalogItem,
  GoreloContactCatalogItem,
  GoreloCreateAlertRequest,
  GoreloCreateTicketRequest,
  GoreloUserCatalogItem,
} from "./gorelo";
import type {
  GoreloCatalogKind,
  GoreloCatalogSnapshot,
} from "./gorelo-integration";
import type { EmailFacts, GoreloRuleAction } from "./types";

export type GoreloActionPreflightError =
  | "extraction_failed"
  | "client_resolution_failed"
  | "entity_resolution_failed"
  | "mapping_failed";

export type GoreloActionCatalogLoader = (
  kind: GoreloCatalogKind,
  options?: { clientId?: number },
) => Promise<GoreloCatalogSnapshot>;

export interface PreparedGoreloAction {
  actionType: "create_ticket" | "create_alert";
  data: Readonly<Record<string, unknown>>;
  request?: GoreloCreateTicketRequest | GoreloCreateAlertRequest;
  preflightError?: GoreloActionPreflightError;
}

interface FixedClientRow {
  id: number;
  name: string;
  last_seen_at: string;
  last_synced_at: string | null;
}

interface ResolvedClientAudit {
  id: number;
  name: string;
  matchedBy: string;
}

type ClientResolutionAudit =
  | { status: "resolved"; id: number; name: string; matchedBy: string }
  | {
      status: "not_found" | "ambiguous" | "stale_alias";
      matchedBy?: string;
      candidates?: readonly {
        clientId: number;
        clientName: string;
        matchedBy: string;
      }[];
    };

/** Credential-free inputs used by each Gorelo resolver, retained only for
 * operator diagnostics. Values are the already-extracted, bounded template
 * variables; no API credentials or raw message content is included. */
function resolutionInputs(
  action: GoreloRuleAction,
  variables: Readonly<Record<string, string>>,
): Readonly<Record<string, { field: string; matchBy: string; value: string }>> {
  const inputs: Record<
    string,
    { field: string; matchBy: string; value: string }
  > = {};
  const add = (name: string, resolver: { field: string; matchBy: string } | undefined) => {
    if (!resolver) return;
    inputs[name] = {
      field: resolver.field,
      matchBy: resolver.matchBy,
      value: (variables[resolver.field] ?? "").slice(0, 998),
    };
  };
  if (action.clientIdentityField) {
    inputs.client = {
      field: action.clientIdentityField,
      matchBy: "client identity",
      value: (variables[action.clientIdentityField] ?? "").slice(0, 998),
    };
  } else if (action.clientId !== undefined) {
    inputs.client = { field: "(fixed client)", matchBy: "id", value: String(action.clientId) };
  }
  if (action.type === "create_ticket") {
    add("contact", action.contactResolver);
    add("leadAssignee", action.leadAssigneeResolver);
    add("agentAsset", action.agentAssetResolver);
  }
  return inputs;
}

type TicketAction = Extract<GoreloRuleAction, { type: "create_ticket" }>;
type ResolutionEntity = "contact" | "leadAssignee" | "agentAsset";
type ResolutionFailureStatus =
  "not_found" | "ambiguous" | "invalid" | "catalog_unavailable";

interface ResolvedEntityAudit {
  status: "resolved";
  id: number | string;
  name: string;
  matchedBy: string;
  matchedValue?: string;
  matchedPrimaryEmail?: string | null;
  returnedClientId?: number;
  expectedClientId?: number;
  deviceName?: string | null;
  displayName?: string | null;
  assetStatus?: string | null;
}

interface FailedEntityAudit {
  status: ResolutionFailureStatus;
  matchedBy: string;
  value?: string;
  returnedClientId?: number;
  expectedClientId?: number;
  rejectionReason?: string;
  returnedAssetClientId?: number | null;
}

type EntityResolutionAudit = ResolvedEntityAudit | FailedEntityAudit;

type EntityResolutionAuditMap = Partial<
  Record<ResolutionEntity, EntityResolutionAudit>
> & {
  location?:
    | {
        status: "derived";
        id: number;
        source: "contact" | "agent_asset" | "entities";
      }
    | {
        status: "conflict" | "not_found" | "catalog_unavailable";
        matchedBy: "entity_locations";
      };
};

interface ResolvedTicketAssociations {
  contactId?: number;
  leadAssigneeId?: number;
  agentAssetIds?: readonly string[];
  locationId?: number;
  entityResolutions: EntityResolutionAuditMap;
}

class EntityResolutionError extends Error {
  override readonly name: string = "EntityResolutionError";
}

class ResolutionValueError extends EntityResolutionError {
  override readonly name: string = "ResolutionValueError";

  constructor(readonly status: "not_found" | "invalid") {
    super("The resolver value is unavailable or invalid");
  }
}

const TEMPLATE_REFERENCE = /{{\s*([A-Za-z_][A-Za-z0-9_]{0,63})\s*}}/g;

function renderTemplate(
  template: string,
  variables: Readonly<Record<string, string>>,
  maximum: number,
  required: boolean,
): string | undefined {
  let invalid = false;
  const rendered = template.replace(
    TEMPLATE_REFERENCE,
    (_placeholder, key: string) => {
      if (!Object.prototype.hasOwnProperty.call(variables, key)) {
        invalid = true;
        return "";
      }
      return variables[key] ?? "";
    },
  );
  if (invalid || rendered.includes("{{") || rendered.includes("}}")) {
    throw new Error("Gorelo action template is invalid");
  }
  const value = required ? rendered.trim() : rendered;
  if (required && !value) throw new Error("A required Gorelo field is empty");
  if (value.length > maximum) {
    throw new Error("A mapped Gorelo field exceeds its size limit");
  }
  return value || undefined;
}

async function fixedClient(
  db: D1Database,
  clientId: number,
): Promise<ResolvedClientAudit | null> {
  const row = await db
    .prepare(
      `SELECT c.id, c.name, c.last_seen_at, s.last_synced_at
         FROM gorelo_clients c
         LEFT JOIN gorelo_client_sync s ON s.id = 1
        WHERE c.id = ?
        LIMIT 1`,
    )
    .bind(clientId)
    .first<FixedClientRow>();
  if (
    !row ||
    row.last_synced_at === null ||
    row.last_seen_at !== row.last_synced_at
  ) {
    return null;
  }
  return { id: row.id, name: row.name, matchedBy: "fixed_client" };
}

async function resolveClient(
  db: D1Database,
  action: GoreloRuleAction,
  variables: Readonly<Record<string, string>>,
): Promise<ResolvedClientAudit | null> {
  if (action.clientId !== undefined) return fixedClient(db, action.clientId);
  const field = action.clientIdentityField;
  if (!field) return null;
  const identity = variables[field]?.trim();
  if (!identity) return null;
  const resolution = await resolveClientIdentity(db, identity, {
    scope: action.clientAliasScope ?? "global",
  });
  if (resolution.status !== "resolved") return null;
  return {
    id: resolution.client.id,
    name: resolution.client.name,
    matchedBy: resolution.matchedBy,
  };
}

const MAX_RESOLUTION_CATALOG_ITEMS = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNullableText(value: unknown, maximum: number): boolean {
  return (
    value === null || (typeof value === "string" && value.length <= maximum)
  );
}

function isNullableUnassignedId(value: unknown): value is number | null {
  return value === null || value === 0 || value === -1 || isPositiveId(value);
}

function isContactCatalogItem(
  value: unknown,
): value is GoreloContactCatalogItem {
  if (!isRecord(value)) return false;
  return (
    isPositiveId(value.id) &&
    typeof value.name === "string" &&
    value.name.length <= 512 &&
    isNullableText(value.firstName, 512) &&
    isNullableText(value.lastName, 512) &&
    isNullableText(value.primaryEmail, 320) &&
    isNullableText(value.alias, 512) &&
    isNullableUnassignedId(value.clientId) &&
    isNullableUnassignedId(value.locationId) &&
    isNullableText(value.status, 256)
  );
}

function isAgentAssetCatalogItem(
  value: unknown,
): value is GoreloAgentAssetCatalogItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id) ||
      /^[1-9][0-9]{0,18}$/.test(value.id)) &&
    typeof value.name === "string" &&
    value.name.length <= 512 &&
    isNullableText(value.displayName, 512) &&
    isNullableText(value.deviceName, 512) &&
    isNullableUnassignedId(value.clientId) &&
    isNullableUnassignedId(value.locationId) &&
    isNullableText(value.serialNumber, 512) &&
    isNullableText(value.status, 256)
  );
}

function isUserCatalogItem(value: unknown): value is GoreloUserCatalogItem {
  if (!isRecord(value)) return false;
  return (
    isPositiveId(value.id) &&
    typeof value.name === "string" &&
    value.name.length <= 512 &&
    isNullableText(value.email, 320) &&
    isNullableText(value.status, 256)
  );
}

function isLocationCatalogItem(
  value: unknown,
  clientId: number,
): value is { id: number; clientId: number } {
  if (!isRecord(value)) return false;
  return (
    isPositiveId(value.id) &&
    isPositiveId(value.clientId) &&
    value.clientId === clientId &&
    typeof value.name === "string" &&
    value.name.length <= 512 &&
    typeof value.isDefault === "boolean"
  );
}

function catalogItems<T>(
  snapshot: GoreloCatalogSnapshot,
  kind: GoreloCatalogKind,
  predicate: (item: unknown) => item is T,
  now = new Date(),
): readonly T[] {
  const expiresAt = Date.parse(snapshot.expiresAt);
  const fetchedAt = Date.parse(snapshot.fetchedAt);
  if (
    snapshot.kind !== kind ||
    !Array.isArray(snapshot.items) ||
    snapshot.items.length > MAX_RESOLUTION_CATALOG_ITEMS ||
    !Number.isSafeInteger(snapshot.totalCount) ||
    snapshot.totalCount !== snapshot.items.length ||
    !Number.isFinite(fetchedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now.getTime() ||
    fetchedAt >= expiresAt ||
    snapshot.pagination?.hasMore === true ||
    !snapshot.items.every(predicate)
  ) {
    throw new EntityResolutionError(
      `The ${kind} catalog is unavailable for exact resolution`,
    );
  }
  return snapshot.items;
}

/** Validates a fresh, complete catalog before a resolver-backed rule is saved. */
export function assertGoreloEntityResolutionCatalog(
  kind: "contacts" | "users" | "agent-assets",
  snapshot: GoreloCatalogSnapshot,
): void {
  switch (kind) {
    case "contacts":
      catalogItems(snapshot, kind, isContactCatalogItem);
      return;
    case "users":
      catalogItems(snapshot, kind, isUserCatalogItem);
      return;
    case "agent-assets":
      catalogItems(snapshot, kind, isAgentAssetCatalogItem);
      return;
  }
}

function normalizeExact(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function resolutionValue(
  variables: Readonly<Record<string, string>>,
  field: string,
  matchBy: string,
): string {
  const raw = variables[field];
  if (raw === undefined) {
    throw new ResolutionValueError("not_found");
  }
  const value = normalizeExact(raw);
  if (!value) throw new ResolutionValueError("not_found");
  const maximum = matchBy === "email" ? 320 : matchBy === "id" ? 64 : 512;
  if (value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ResolutionValueError("invalid");
  }
  if (matchBy === "email" && !/^[^@\s]+@[^@\s]+$/.test(value)) {
    throw new ResolutionValueError("invalid");
  }
  return value;
}

function isCanonicalPositiveId(value: string): boolean {
  if (!/^[1-9]\d*$/.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && String(parsed) === value;
}

function setFailure(
  resolutions: EntityResolutionAuditMap,
  entity: ResolutionEntity,
  matchedBy: string,
  status: ResolutionFailureStatus,
  details: {
    value?: string;
    returnedClientId?: number;
    expectedClientId?: number;
    rejectionReason?: string;
  } = {},
): never {
  resolutions[entity] = { status, matchedBy, ...details };
  throw new EntityResolutionError(`${entity} resolution failed`);
}

async function loadCatalogForResolution<T>(
  loader: GoreloActionCatalogLoader | undefined,
  kind: GoreloCatalogKind,
  predicate: (item: unknown) => item is T,
  options?: { clientId?: number },
): Promise<readonly T[]> {
  if (!loader) throw new EntityResolutionError("Catalog loader is unavailable");
  const snapshot = await loader(kind, options);
  if (
    options?.clientId !== undefined &&
    snapshot.clientId !== options.clientId
  ) {
    throw new EntityResolutionError(
      `The ${kind} catalog has the wrong client scope`,
    );
  }
  return catalogItems(snapshot, kind, predicate);
}

function distinctById<T extends { id: number | string }>(
  items: readonly T[],
): readonly T[] {
  const matches = new Map<string, T>();
  for (const item of items) {
    const key = normalizeExact(String(item.id));
    if (!matches.has(key)) matches.set(key, item);
  }
  return [...matches.values()];
}

function resolverMatches(
  value: string,
  candidates: readonly (string | null)[],
): boolean {
  return candidates.some(
    (candidate) => candidate !== null && normalizeExact(candidate) === value,
  );
}

function safeCatalogFailure(error: unknown): {
  status: ResolutionFailureStatus;
  rejectionReason: string;
} {
  const candidate = error as {
    code?: unknown;
    diagnostic?: { reason?: unknown; detail?: unknown };
  };
  const reason = typeof candidate?.diagnostic?.reason === "string"
    ? candidate.diagnostic.reason
    : undefined;
  const detail = typeof candidate?.diagnostic?.detail === "string"
    ? candidate.diagnostic.detail.slice(0, 160)
    : undefined;
  if (reason === "invalid_catalog_item") {
    return {
      status: "catalog_unavailable",
      rejectionReason: `invalid_catalog_item${detail ? ` (${detail})` : ""}`,
    };
  }
  return {
    status: "catalog_unavailable",
    rejectionReason: "catalog_unavailable",
  };
}

async function resolveContact(
  action: TicketAction,
  variables: Readonly<Record<string, string>>,
  clientId: number,
  loader: GoreloActionCatalogLoader | undefined,
  resolutions: EntityResolutionAuditMap,
): Promise<GoreloContactCatalogItem | undefined> {
  const resolver = action.contactResolver;
  if (!resolver) return undefined;
  let value: string;
  try {
    value = resolutionValue(variables, resolver.field, resolver.matchBy);
  } catch (error) {
    return setFailure(
      resolutions,
      "contact",
      resolver.matchBy,
      error instanceof ResolutionValueError ? error.status : "invalid",
      {
        expectedClientId: clientId,
        rejectionReason: error instanceof ResolutionValueError ? error.status : "resolver value unavailable",
      },
    );
  }
  if (resolver.matchBy === "id" && !isCanonicalPositiveId(value)) {
    return setFailure(resolutions, "contact", resolver.matchBy, "invalid", {
      expectedClientId: clientId,
      rejectionReason: "contact id is not a valid positive integer",
    });
  }
  let items: readonly GoreloContactCatalogItem[];
  try {
    items = await loadCatalogForResolution(
      loader,
      "contacts",
      isContactCatalogItem,
      { clientId },
    );
  } catch (error) {
    const failure = safeCatalogFailure(error);
    return setFailure(
      resolutions,
      "contact",
      resolver.matchBy,
      "catalog_unavailable",
      {
        expectedClientId: clientId,
        rejectionReason: `catalog_unavailable: ${failure.rejectionReason}`,
      },
    );
  }
  const matching = distinctById(
    items.filter((item) => {
      if (resolver.matchBy === "id") return String(item.id) === value;
      if (resolver.matchBy === "email") {
        return resolverMatches(value, [item.primaryEmail]);
      }
      if (resolver.matchBy === "alias") {
        return resolverMatches(value, [item.alias]);
      }
      return resolverMatches(value, [item.name]);
    }),
  );
  const scoped = matching.filter((item) => item.clientId === clientId);
  if (scoped.length === 0) {
    return setFailure(
      resolutions,
      "contact",
      resolver.matchBy,
      matching.length ? "invalid" : "not_found",
      {
        expectedClientId: clientId,
        ...(matching.length === 1 && matching[0]!.clientId !== null
          ? { returnedClientId: matching[0]!.clientId }
          : {}),
        ...(matching.length === 1 ? { matchedPrimaryEmail: matching[0]!.primaryEmail } : {}),
        rejectionReason: matching.length
          ? "client_scope_mismatch: contact matched, but belongs to a different Gorelo client"
          : "no contact matched the extracted value",
      },
    );
  }
  if (scoped.length > 1) {
    return setFailure(resolutions, "contact", resolver.matchBy, "ambiguous", {
      expectedClientId: clientId,
      rejectionReason: "more than one contact matched the extracted value for the client",
    });
  }
  const resolved = scoped[0]!;
  resolutions.contact = {
    status: "resolved",
    id: resolved.id,
    name: resolved.name,
    matchedBy: resolver.matchBy,
    matchedValue: value,
    matchedPrimaryEmail: resolved.primaryEmail,
    ...(resolved.clientId === null ? {} : { returnedClientId: resolved.clientId }),
    expectedClientId: clientId,
  };
  return resolved;
}

async function resolveLeadAssignee(
  action: TicketAction,
  variables: Readonly<Record<string, string>>,
  loader: GoreloActionCatalogLoader | undefined,
  resolutions: EntityResolutionAuditMap,
): Promise<GoreloUserCatalogItem | undefined> {
  const resolver = action.leadAssigneeResolver;
  if (!resolver) return undefined;
  let value: string;
  try {
    value = resolutionValue(variables, resolver.field, resolver.matchBy);
  } catch (error) {
    return setFailure(
      resolutions,
      "leadAssignee",
      resolver.matchBy,
      error instanceof ResolutionValueError ? error.status : "invalid",
    );
  }
  if (resolver.matchBy === "id" && !isCanonicalPositiveId(value)) {
    return setFailure(resolutions, "leadAssignee", resolver.matchBy, "invalid");
  }
  let items: readonly GoreloUserCatalogItem[];
  try {
    items = await loadCatalogForResolution(loader, "users", isUserCatalogItem);
  } catch {
    return setFailure(
      resolutions,
      "leadAssignee",
      resolver.matchBy,
      "catalog_unavailable",
    );
  }
  const matching = distinctById(
    items.filter((item) => {
      if (resolver.matchBy === "id") return String(item.id) === value;
      if (resolver.matchBy === "email") {
        return resolverMatches(value, [item.email]);
      }
      return resolverMatches(value, [item.name]);
    }),
  );
  if (matching.length === 0) {
    return setFailure(
      resolutions,
      "leadAssignee",
      resolver.matchBy,
      "not_found",
    );
  }
  if (matching.length > 1) {
    return setFailure(
      resolutions,
      "leadAssignee",
      resolver.matchBy,
      "ambiguous",
    );
  }
  const resolved = matching[0]!;
  resolutions.leadAssignee = {
    status: "resolved",
    id: resolved.id,
    name: resolved.name,
    matchedBy: resolver.matchBy,
  };
  return resolved;
}

async function resolveAgentAsset(
  action: TicketAction,
  variables: Readonly<Record<string, string>>,
  clientId: number,
  loader: GoreloActionCatalogLoader | undefined,
  resolutions: EntityResolutionAuditMap,
): Promise<GoreloAgentAssetCatalogItem | undefined> {
  const resolver = action.agentAssetResolver;
  if (!resolver) return undefined;
  let value: string;
  try {
    value = resolutionValue(variables, resolver.field, resolver.matchBy);
  } catch (error) {
    return setFailure(
      resolutions,
      "agentAsset",
      resolver.matchBy,
      error instanceof ResolutionValueError ? error.status : "invalid",
    );
  }
  if (
    resolver.matchBy === "id" &&
    !(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) || /^[1-9][0-9]{0,18}$/.test(value))
  ) {
    return setFailure(resolutions, "agentAsset", resolver.matchBy, "invalid");
  }
  let items: readonly GoreloAgentAssetCatalogItem[];
  try {
    items = await loadCatalogForResolution(
      loader,
      "agent-assets",
      isAgentAssetCatalogItem,
    );
  } catch (error) {
    const failure = safeCatalogFailure(error);
    return setFailure(
      resolutions,
      "agentAsset",
      resolver.matchBy,
      failure.status,
      { rejectionReason: failure.rejectionReason },
    );
  }
  const matching = distinctById(
    items.filter((item) => {
      if (resolver.matchBy === "id") {
        return normalizeExact(item.id) === value;
      }
      if (resolver.matchBy === "serial_number") {
        return resolverMatches(value, [item.serialNumber]);
      }
      return resolverMatches(value, [item.deviceName, item.displayName]);
    }),
  );
  const scoped = matching.filter((item) => item.clientId === clientId);
  if (scoped.length === 0) {
    return setFailure(
      resolutions,
      "agentAsset",
      resolver.matchBy,
      matching.length ? "invalid" : "not_found",
      {
        ...(matching.length === 1 && matching[0]!.clientId !== null
          ? { returnedClientId: matching[0]!.clientId }
          : {}),
        rejectionReason: matching.length
          ? "client_scope_mismatch: asset belongs to a different Gorelo client"
          : "no agent asset matched the extracted value",
      },
    );
  }
  if (scoped.length > 1) {
    return setFailure(resolutions, "agentAsset", resolver.matchBy, "ambiguous", {
      rejectionReason: "more than one agent asset matched the extracted value for the client",
    });
  }
  const resolved = scoped[0]!;
  resolutions.agentAsset = {
    status: "resolved",
    id: resolved.id,
    name: resolved.name,
    matchedBy: resolver.matchBy,
    deviceName: resolved.deviceName,
    displayName: resolved.displayName,
    assetStatus: resolved.status,
    ...(resolved.clientId === null ? {} : { returnedClientId: resolved.clientId }),
    expectedClientId: clientId,
  };
  return resolved;
}

async function resolvedTicketAssociations(
  action: TicketAction,
  variables: Readonly<Record<string, string>>,
  clientId: number,
  loader: GoreloActionCatalogLoader | undefined,
  resolutions: EntityResolutionAuditMap,
): Promise<ResolvedTicketAssociations> {
  const [contactResult, leadAssigneeResult, agentAssetResult] =
    await Promise.allSettled([
      resolveContact(action, variables, clientId, loader, resolutions),
      resolveLeadAssignee(action, variables, loader, resolutions),
      resolveAgentAsset(action, variables, clientId, loader, resolutions),
    ] as const);
  for (const result of [contactResult, leadAssigneeResult, agentAssetResult]) {
    if (result.status === "rejected") throw result.reason;
  }
  const contact =
    contactResult.status === "fulfilled" ? contactResult.value : undefined;
  const leadAssignee =
    leadAssigneeResult.status === "fulfilled"
      ? leadAssigneeResult.value
      : undefined;
  const agentAsset =
    agentAssetResult.status === "fulfilled"
      ? agentAssetResult.value
      : undefined;
  const entityLocations = [
    ...(contact?.locationId
      ? [{ id: contact.locationId, source: "contact" }]
      : []),
    ...(agentAsset?.locationId
      ? [{ id: agentAsset.locationId, source: "agent_asset" }]
      : []),
  ] as const;
  const locationIds = new Set(entityLocations.map((location) => location.id));
  if (
    locationIds.size > 1 ||
    (action.locationId !== undefined &&
      [...locationIds].some((id) => id !== action.locationId))
  ) {
    resolutions.location = {
      status: "conflict",
      matchedBy: "entity_locations",
    };
    throw new EntityResolutionError("Resolved entity locations conflict");
  }
  let locationId = action.locationId;
  if (locationId === undefined && locationIds.size === 1) {
    locationId = [...locationIds][0]!;
    let locations: readonly { id: number; clientId: number }[];
    try {
      locations = await loadCatalogForResolution(
        loader,
        "locations",
        (item): item is { id: number; clientId: number } =>
          isLocationCatalogItem(item, clientId),
        { clientId },
      );
    } catch {
      resolutions.location = {
        status: "catalog_unavailable",
        matchedBy: "entity_locations",
      };
      throw new EntityResolutionError(
        "The resolved entity location is unavailable",
      );
    }
    if (!locations.some((location) => location.id === locationId)) {
      resolutions.location = {
        status: "not_found",
        matchedBy: "entity_locations",
      };
      throw new EntityResolutionError("The resolved entity location is stale");
    }
    const sources = new Set(entityLocations.map((location) => location.source));
    resolutions.location = {
      status: "derived",
      id: locationId,
      source:
        sources.size > 1
          ? "entities"
          : sources.has("contact")
            ? "contact"
            : "agent_asset",
    };
  }
  return {
    ...(contact ? { contactId: contact.id } : {}),
    ...(leadAssignee ? { leadAssigneeId: leadAssignee.id } : {}),
    ...(agentAsset ? { agentAssetIds: [agentAsset.id] } : {}),
    ...(locationId === undefined ? {} : { locationId }),
    entityResolutions: resolutions,
  };
}

function ticketRequest(
  action: TicketAction,
  variables: Readonly<Record<string, string>>,
  clientId: number,
  associations?: ResolvedTicketAssociations,
): GoreloCreateTicketRequest {
  const title = renderTemplate(action.titleTemplate, variables, 998, true)!;
  const locationId = associations?.locationId ?? action.locationId;
  const contactId = associations?.contactId ?? action.contactId;
  const leadAssigneeId = associations?.leadAssigneeId ?? action.leadAssigneeId;
  const agentAssetIds = associations?.agentAssetIds ?? action.agentAssetIds;
  const description = action.descriptionTemplate
    ? renderTemplate(action.descriptionTemplate, variables, 16_000, false)
    : undefined;
  const createdByName = action.createdByNameTemplate
    ? renderTemplate(
        action.createdByNameTemplate,
        variables,
        320,
        false,
      )?.trim()
    : undefined;
  return {
    Title: title,
    ClientId: clientId,
    StatusId: action.statusId,
    GroupId: action.groupId,
    TypeId: action.typeId,
    ...(createdByName ? { CreatedByName: createdByName } : {}),
    ...(description === undefined ? {} : { Description: description }),
    ...(action.priorityId === undefined
      ? {}
      : { PriorityId: action.priorityId as 0 | 1 | 2 | 3 | 4 }),
    ...(action.sourceId === undefined
      ? {}
      : { SourceId: action.sourceId as 1 | 2 | 3 | 4 | 5 | 6 }),
    ...(locationId === undefined ? {} : { LocationId: locationId }),
    ...(contactId === undefined ? {} : { ContactId: contactId }),
    ...(action.ccContactIds === undefined
      ? {}
      : { CcContactIds: [...action.ccContactIds] }),
    ...(leadAssigneeId === undefined ? {} : { LeadAssigneeId: leadAssigneeId }),
    ...(action.assistingAssigneeIds === undefined
      ? {}
      : { AssistingAssigneeIds: [...action.assistingAssigneeIds] }),
    ...(action.watcherIds === undefined
      ? {}
      : { WatcherIds: [...action.watcherIds] }),
    ...(action.tagIds === undefined ? {} : { TagIds: [...action.tagIds] }),
    ...(agentAssetIds === undefined
      ? {}
      : { AgentAssetIds: [...agentAssetIds] }),
    SendTicketCreatedEmail: action.sendTicketCreatedEmail,
    IsUnread: action.isUnread,
  };
}

function alertRequest(
  action: Extract<GoreloRuleAction, { type: "create_alert" }>,
  variables: Readonly<Record<string, string>>,
  clientId: number,
): GoreloCreateAlertRequest {
  const description = action.descriptionTemplate
    ? renderTemplate(action.descriptionTemplate, variables, 16_000, false)
    : undefined;
  return {
    Name: renderTemplate(action.nameTemplate, variables, 998, true)!,
    ClientId: clientId,
    Resource: renderTemplate(action.resourceTemplate, variables, 998, true)!,
    Severity: action.severity as 1 | 2 | 3 | 4,
    ...(description === undefined ? {} : { Description: description }),
  };
}

/** Builds a bounded, credential-free Gorelo request from trusted mappings. */
export async function prepareGoreloActionFromVariables(
  db: D1Database,
  variables: Readonly<Record<string, string>>,
  action: GoreloRuleAction,
  options: { loadCatalog?: GoreloActionCatalogLoader } = {},
): Promise<PreparedGoreloAction> {
  const resolverInputs = resolutionInputs(action, variables);
  const identityField = action.clientIdentityField;
  const identity = identityField ? variables[identityField]?.trim() : undefined;
  let clientResolution: ClientResolutionAudit;
  if (action.clientId !== undefined) {
    const fixed = await fixedClient(db, action.clientId);
    clientResolution = fixed
      ? { status: "resolved", ...fixed }
      : { status: "not_found", matchedBy: "fixed_client" };
  } else if (!identity) {
    clientResolution = {
      status: "not_found",
      ...(identityField ? { matchedBy: identityField } : {}),
    };
  } else {
    const resolution = await resolveClientIdentity(db, identity, {
      scope: action.clientAliasScope ?? "global",
    });
    clientResolution =
      resolution.status === "resolved"
        ? {
            status: "resolved",
            id: resolution.client.id,
            name: resolution.client.name,
            matchedBy: resolution.matchedBy,
          }
        : {
            status: resolution.status,
            ...(resolution.status === "not_found" && resolution.reason
              ? { matchedBy: resolution.reason }
              : {}),
            ...(resolution.status === "ambiguous"
              ? {
                  candidates: resolution.candidates.map((candidate) => ({
                    clientId: candidate.clientId,
                    clientName: candidate.clientName,
                    matchedBy: candidate.matchedBy,
                  })),
                }
              : {}),
          };
  }
  let client: ResolvedClientAudit | null;
  try {
    client = await resolveClient(db, action, variables);
  } catch {
    client = null;
  }
  if (!client) {
    return {
      actionType: action.type,
      data: { variables, clientResolution, resolverInputs },
      preflightError: "client_resolution_failed",
    };
  }

  const entityResolutions: EntityResolutionAuditMap = {};
  let associations: ResolvedTicketAssociations | undefined;
  if (action.type === "create_ticket") {
    try {
      associations = await resolvedTicketAssociations(
        action,
        variables,
        client.id,
        options.loadCatalog,
        entityResolutions,
      );
    } catch (error) {
      if (!(error instanceof EntityResolutionError)) throw error;
      return {
        actionType: action.type,
        data: {
          variables,
          clientResolution,
          resolverInputs,
          goreloClient: client,
          ...(Object.keys(entityResolutions).length
            ? { entityResolutions }
            : {}),
        },
        preflightError: "entity_resolution_failed",
      };
    }
  }

  try {
    const request =
      action.type === "create_ticket"
        ? ticketRequest(action, variables, client.id, associations)
        : alertRequest(action, variables, client.id);
    const data = {
      variables,
      clientResolution,
      resolverInputs,
      goreloClient: client,
      ...(Object.keys(entityResolutions).length ? { entityResolutions } : {}),
    };
    canonicalizeDeliveryPayload({
      schemaVersion: 1,
      region: "aue",
      request,
      data,
    });
    return {
      actionType: action.type,
      data,
      request,
    };
  } catch {
    return {
      actionType: action.type,
      data: {
        variables,
        goreloClient: client,
        ...(Object.keys(entityResolutions).length ? { entityResolutions } : {}),
      },
      preflightError: "mapping_failed",
    };
  }
}

/** Builds a bounded, credential-free Gorelo request and its audit snapshot. */
export async function prepareGoreloAction(
  db: D1Database,
  facts: EmailFacts,
  action: GoreloRuleAction,
  options: { loadCatalog?: GoreloActionCatalogLoader } = {},
): Promise<PreparedGoreloAction> {
  let variables: Record<string, string>;
  try {
    variables = extractWebhookVariables(facts, action.fields);
  } catch {
    return {
      actionType: action.type,
      data: { variables: {} },
      preflightError: "extraction_failed",
    };
  }
  return prepareGoreloActionFromVariables(db, variables, action, options);
}
