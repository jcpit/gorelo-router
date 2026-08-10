import { adminResponse } from "./admin";
import {
  ArchivedMessageIntegrityError,
  createReleasedEmailMessage,
  prepareReleasedMessage,
  readArchivedMessage,
  verifiedArchivedArrayBuffer,
} from "./archive";
import { ConfigurationError, loadConfig } from "./config";
import {
  ClientAliasCanonicalConflictError,
  ClientAliasConflictError,
  createClientAlias,
  createClientAliases,
  deleteClientAlias,
  GoreloClientImportValidationError,
  importGoreloClients,
  listGoreloClients,
  MAX_CLIENT_ALIASES_PER_BATCH,
  resolveClientIdentity,
  searchGoreloClients,
  updateClientAlias,
} from "./client-directory";
import { getDelivery, listDeliveries } from "./delivery-repository";
import { DELIVERY_STATES, type DeliveryState } from "./delivery-types";
import { inspectArchivedContent } from "./mime";
import { extractWebhookVariables, WebhookExtractionError } from "./extraction";
import {
  inferExtractionTemplate,
  TemplateInferenceError,
} from "./template-inference";
import { prepareGoreloAction } from "./gorelo-action";
import { adminThemeResponse } from "./theme";
import {
  getGoreloCatalog,
  fetchAllGoreloClients,
  GORELO_CATALOG_KINDS,
  GoreloIntegrationError,
  testGoreloConnection,
  type GoreloCatalogKind,
} from "./gorelo-integration";
import {
  beginQuarantineRelease,
  completeQuarantineRelease,
  createRule,
  deleteRule,
  dismissQuarantine,
  failQuarantineRelease,
  getEvent,
  getEventStorage,
  getQuarantineStorage,
  getRule,
  listEventsPage,
  listQuarantinePage,
  listRules,
  markQuarantineReleaseUncertain,
  updateRule,
  type EventPageCursor,
} from "./repository";
import {
  decide,
  decideWithoutMime,
  RuleActionError,
  rulesNeedMime,
  validateRuleAction,
} from "./rules";
import { assessSpam } from "./spam";
import { buildSetupStatus } from "./setup";
import type {
  EmailFacts,
  Env,
  ProcessingEvent,
  QuarantineState,
  RuntimeConfig,
} from "./types";
import {
  dryRunEmailSchema,
  extractionInferenceInputSchema,
  ruleInputSchema,
  webhookExtractionFieldSchema,
} from "./validation";
import type { RuleAction } from "./validation";
import {
  createWebhookDestination,
  deleteWebhookDestination,
  getWebhookDestination,
  listWebhookDestinations,
  updateWebhookDestination,
} from "./webhook-repository";
import { validateWebhookUrl, WebhookDeliveryError } from "./webhooks";
import { z, ZodError } from "zod";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};
const MAX_JSON_BODY_BYTES = 256 * 1024;
const MAX_ARCHIVED_PREVIEW_CHARACTERS = 8_000;
const INSECURE_ADMIN_TOKENS = new Set(["replace-with-a-long-random-token"]);

const releaseRequestSchema = z
  .object({
    version: z.number().int().min(1),
    destination: z.string().trim().email().optional(),
    note: z.string().trim().max(2_000).optional(),
  })
  .strict();

const dismissRequestSchema = z
  .object({
    version: z.number().int().min(1),
    note: z.string().trim().max(2_000).optional(),
  })
  .strict();

const clientAliasTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .superRefine((value, context) => {
    const normalized = value.normalize("NFKC");
    if (/\p{Cc}/u.test(normalized)) {
      context.addIssue({
        code: "custom",
        message: "Client alias must not contain control characters",
      });
      return;
    }
    const collapsed = normalized.trim().replace(/\s+/gu, " ");
    if (!collapsed || collapsed.length > 512) {
      context.addIssue({
        code: "custom",
        message:
          "Client alias must be between 1 and 512 characters after normalization",
      });
    }
  });

const clientAliasScopeSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/i);

const clientAliasValueSchema = z
  .object({
    alias: clientAliasTextSchema,
    scope: clientAliasScopeSchema.default("global"),
  })
  .strict();

const clientAliasCreateSchema = clientAliasValueSchema
  .extend({
    clientId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

const clientAliasBatchCreateSchema = z
  .object({
    clientId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    aliases: z
      .array(clientAliasValueSchema)
      .min(1)
      .max(MAX_CLIENT_ALIASES_PER_BATCH),
  })
  .strict();

const clientAliasUpdateSchema = z
  .object({
    alias: clientAliasTextSchema,
    scope: clientAliasScopeSchema.optional(),
    version: z.number().int().positive(),
  })
  .strict();

const safeWebhookNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), {
    message: "Webhook name must not contain control characters",
  });

const webhookCreateSchema = z
  .object({
    name: safeWebhookNameSchema,
    url: z.string().min(1).max(2_048),
    enabled: z.boolean().default(true),
  })
  .strict();

const webhookUpdateSchema = webhookCreateSchema
  .extend({ version: z.number().int().positive() })
  .strict();

const QUARANTINE_STATES = new Set<QuarantineState>([
  "pending",
  "releasing",
  "released",
  "dismissed",
  "release_failed",
  "expired",
]);
const PROCESSING_STATUSES = new Set<ProcessingEvent["status"]>([
  "forwarded",
  "quarantined",
  "dropped",
  "rejected",
  "failed",
]);

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function json(
  data: unknown,
  status = 200,
  extraHeaders?: HeadersInit,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function problem(status: number, title: string, details?: unknown): Response {
  return json(
    {
      error: {
        status,
        title,
        ...(details === undefined ? {} : { details }),
      },
    },
    status,
  );
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

async function constantTimeEqual(
  left: string,
  right: string,
): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([
    digest(left),
    digest(right),
  ]);
  let difference = 0;
  for (let index = 0; index < leftDigest.length; index += 1) {
    difference |= leftDigest[index]! ^ rightDigest[index]!;
  }
  return difference === 0;
}

async function requireAdmin(request: Request, env: Env): Promise<void> {
  const expected = env.ADMIN_API_TOKEN?.trim();
  if (
    !expected ||
    expected.length < 32 ||
    INSECURE_ADMIN_TOKENS.has(expected)
  ) {
    throw new HttpError(503, "Admin API is not configured");
  }
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!(await constantTimeEqual(supplied, expected))) {
    throw new HttpError(401, "Unauthorized");
  }
}

async function readJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    throw new HttpError(413, "Request body is too large");
  }
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  if (request.body) {
    const reader = request.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_JSON_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError(413, "Request body is too large");
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}

function positiveQueryInteger(
  value: string | null,
  name: string,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (value === null || !/^[1-9]\d*$/.test(value)) {
    throw new HttpError(400, `${name} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new HttpError(400, `${name} must be a positive safe integer`);
  }
  return parsed;
}

function listSearchQuery(url: URL): string | undefined {
  const query = url.searchParams.get("q")?.trim();
  if (query === undefined || query.length === 0) return undefined;
  if (query.length > 200 || /[\u0000-\u001f\u007f]/.test(query)) {
    throw new HttpError(
      400,
      "q must be at most 200 characters without control characters",
    );
  }
  return query;
}

function encodeEventCursor(cursor: EventPageCursor): string {
  return btoa(JSON.stringify([cursor.createdAt, cursor.id]))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decodeEventCursor(value: string | null): EventPageCursor | undefined {
  if (value === null) return undefined;
  if (
    value.length === 0 ||
    value.length > 600 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new HttpError(400, "Invalid pagination cursor");
  }
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const parsed = JSON.parse(
      atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)),
    ) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      parsed[0].length > 64 ||
      !Number.isFinite(Date.parse(parsed[0])) ||
      typeof parsed[1] !== "string" ||
      !/^[a-z0-9:_-]{1,320}$/i.test(parsed[1])
    ) {
      throw new Error("invalid cursor payload");
    }
    return { createdAt: parsed[0], id: parsed[1] };
  } catch {
    throw new HttpError(400, "Invalid pagination cursor");
  }
}

function safeResourceId(value: string, label: string): string {
  if (!/^[a-z0-9_-]{1,64}$/i.test(value)) {
    throw new HttpError(400, `Invalid ${label}`);
  }
  return value;
}

function webhookCapability(config: RuntimeConfig): {
  configured: boolean;
  allowedHosts: string[];
  signingConfigured: boolean;
} {
  return {
    configured:
      config.allowedWebhookHosts.size > 0 && config.webhookSigningConfigured,
    allowedHosts: [...config.allowedWebhookHosts].sort(),
    signingConfigured: config.webhookSigningConfigured,
  };
}

function registeredWebhookInput(
  input: { name: string; url: string; enabled: boolean },
  config: RuntimeConfig,
): { name: string; url: string; host: string; enabled: boolean } {
  if (!webhookCapability(config).configured) {
    throw new HttpError(
      409,
      "Webhooks require ALLOWED_WEBHOOK_HOSTS and WEBHOOK_SIGNING_SECRET",
    );
  }
  try {
    const destination = validateWebhookUrl(
      input.url,
      config.allowedWebhookHosts,
    );
    const normalizedUrl = destination.toString();
    if (normalizedUrl.length > 2_048) {
      throw new HttpError(400, "Webhook URL exceeds its normalized size limit");
    }
    return {
      name: input.name,
      url: normalizedUrl,
      host: destination.hostname,
      enabled: input.enabled,
    };
  } catch (error) {
    if (error instanceof WebhookDeliveryError) {
      throw new HttpError(
        400,
        "Webhook URL must be an allow-listed HTTPS destination without credentials or sensitive query parameters",
      );
    }
    throw error;
  }
}

function isUniqueConstraintError(error: unknown, table: string): boolean {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("unique") &&
    error.message.toLowerCase().includes(table.toLowerCase())
  );
}

function catalogItemById(
  items: readonly unknown[],
  id: number | string,
): Record<string, unknown> | undefined {
  return items.find((item): item is Record<string, unknown> => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return false;
    }
    return (item as Record<string, unknown>).id === id;
  });
}

function requireCatalogId(
  items: readonly unknown[],
  id: number | string,
  label: string,
): Record<string, unknown> {
  const item = catalogItemById(items, id);
  if (!item) {
    throw new HttpError(
      400,
      `The selected ${label} is not present in the current Gorelo catalog`,
    );
  }
  return item;
}

async function validatePersistedRuleAction(
  env: Env,
  action: RuleAction,
  config: RuntimeConfig,
): Promise<void> {
  const db = env.DB;
  validateRuleAction(action, config);
  if (action.type === "forward_webhook") {
    const destination = await getWebhookDestination(
      db,
      action.webhookDestinationId,
    );
    if (!destination) {
      throw new HttpError(
        400,
        "The selected webhook destination is not registered",
      );
    }
    if (!destination.enabled) {
      throw new HttpError(400, "The selected webhook destination is disabled");
    }
    return;
  }
  if (
    (action.type === "create_ticket" || action.type === "create_alert") &&
    !env.MESSAGE_ARCHIVE
  ) {
    throw new HttpError(
      400,
      "API-only Gorelo actions require the private MESSAGE_ARCHIVE binding",
    );
  }
  if (
    (action.type === "create_ticket" || action.type === "create_alert") &&
    action.clientId !== undefined
  ) {
    const client = await db
      .prepare(
        `SELECT c.id
           FROM gorelo_clients c
           JOIN gorelo_client_sync s ON s.id = 1
          WHERE c.id = ? AND c.last_seen_at = s.last_synced_at
          LIMIT 1`,
      )
      .bind(action.clientId)
      .first<{ id: number }>();
    if (!client) {
      throw new HttpError(
        400,
        "The selected Gorelo client is missing or stale; import clients again",
      );
    }
  }
  if (
    (action.type === "create_ticket" || action.type === "create_alert") &&
    action.clientIdentityField !== undefined
  ) {
    const currentClient = await db
      .prepare(
        `SELECT c.id
           FROM gorelo_clients c
           JOIN gorelo_client_sync s
             ON s.id = 1 AND c.last_seen_at = s.last_synced_at
          LIMIT 1`,
      )
      .first<{ id: number }>();
    if (!currentClient) {
      throw new HttpError(
        400,
        "Import current Gorelo clients before enabling dynamic client resolution",
      );
    }
  }
  if (action.type !== "create_ticket") return;

  const [statuses, groups, types] = await Promise.all([
    getGoreloCatalog(env, config, "ticket-statuses"),
    getGoreloCatalog(env, config, "groups"),
    getGoreloCatalog(env, config, "ticket-types"),
  ]);
  requireCatalogId(statuses.items, action.statusId, "ticket status");
  requireCatalogId(groups.items, action.groupId, "technician group");
  requireCatalogId(types.items, action.typeId, "ticket type");

  if (action.tagIds?.length) {
    const tags = await getGoreloCatalog(env, config, "ticket-tags");
    for (const id of action.tagIds)
      requireCatalogId(tags.items, id, "ticket tag");
  }
  const userIds = [
    ...(action.leadAssigneeId === undefined ? [] : [action.leadAssigneeId]),
    ...(action.assistingAssigneeIds ?? []),
    ...(action.watcherIds ?? []),
  ];
  if (userIds.length) {
    const users = await getGoreloCatalog(env, config, "users");
    for (const id of userIds) requireCatalogId(users.items, id, "technician");
  }

  if (action.clientId === undefined) return;
  if (action.locationId !== undefined) {
    const locations = await getGoreloCatalog(env, config, "locations", {
      clientId: action.clientId,
    });
    requireCatalogId(locations.items, action.locationId, "client location");
  }
  const contactIds = [
    ...(action.contactId === undefined ? [] : [action.contactId]),
    ...(action.ccContactIds ?? []),
  ];
  if (contactIds.length) {
    const contacts = await getGoreloCatalog(env, config, "contacts", {
      clientId: action.clientId,
    });
    for (const id of contactIds) {
      const contact = requireCatalogId(contacts.items, id, "client contact");
      if (contact.clientId !== action.clientId) {
        throw new HttpError(
          400,
          "A selected contact belongs to another client",
        );
      }
    }
  }
  if (action.agentAssetIds?.length) {
    const assets = await getGoreloCatalog(env, config, "agent-assets");
    for (const id of action.agentAssetIds) {
      const asset = requireCatalogId(assets.items, id, "agent asset");
      if (asset.clientId !== action.clientId) {
        throw new HttpError(400, "A selected asset belongs to another client");
      }
    }
  }
}

async function enabledWebhookRuleReferenceCount(
  db: D1Database,
  destinationId: string,
): Promise<number> {
  try {
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS count
           FROM rules
          WHERE enabled = 1
            AND json_extract(action_json, '$.type') = 'forward_webhook'
            AND json_extract(action_json, '$.webhookDestinationId') = ?`,
      )
      .bind(destinationId)
      .first<{ count: number }>();
    return Number(row?.count ?? 0);
  } catch {
    return 0;
  }
}

function reviewActor(request: Request): string {
  const accessEmail = request.headers
    .get("cf-access-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  const hasAccessAssertion = Boolean(
    request.headers.get("cf-access-jwt-assertion"),
  );
  if (
    hasAccessAssertion &&
    accessEmail &&
    accessEmail.length <= 320 &&
    /^[^\s@]+@[^\s@]+$/.test(accessEmail)
  ) {
    return accessEmail;
  }
  return "admin-api";
}

async function hydratedEvent(
  env: Env,
  config: RuntimeConfig,
  event: ProcessingEvent,
): Promise<ProcessingEvent> {
  if (!env.MESSAGE_ARCHIVE || !event.audit?.rawAvailable) {
    return event;
  }
  const storage = event.quarantine
    ? await getQuarantineStorage(env.DB, event.id)
    : await getEventStorage(env.DB, event.id);
  if (!storage?.objectKey) return event;
  const archived = await readArchivedMessage(
    env.MESSAGE_ARCHIVE,
    storage.objectKey,
  );
  if (!archived || archived.size > config.maxParseBytes) return event;
  try {
    const content = await inspectArchivedContent(
      await verifiedArchivedArrayBuffer(archived, storage.sha256),
      config,
    );
    return {
      ...event,
      audit: {
        ...event.audit,
        mimeParsed: true,
        bodyPreview: content.bodyText.slice(0, MAX_ARCHIVED_PREVIEW_CHARACTERS),
        bodyTruncated:
          content.bodyTruncated ||
          content.bodyText.length > MAX_ARCHIVED_PREVIEW_CHARACTERS,
        attachments: content.attachments,
      },
    };
  } catch {
    return event;
  }
}

async function quarantineSummary(db: D1Database): Promise<{
  pending: number;
  releaseFailed: number;
  released: number;
  dismissed: number;
}> {
  const result = await db
    .prepare(
      `SELECT state, COUNT(*) AS count
         FROM quarantine_items
        GROUP BY state`,
    )
    .all<{ state: QuarantineState; count: number }>();
  const counts = new Map(
    result.results.map((row) => [row.state, Number(row.count)]),
  );
  return {
    pending: counts.get("pending") ?? 0,
    releaseFailed: counts.get("release_failed") ?? 0,
    released: counts.get("released") ?? 0,
    dismissed: counts.get("dismissed") ?? 0,
  };
}

function mutationProblem(status: "not_found" | "conflict"): never {
  throw new HttpError(
    status === "not_found" ? 404 : 409,
    status === "not_found"
      ? "Quarantined message not found"
      : "The quarantine item changed; refresh before trying again",
  );
}

function dryRunFacts(
  input: ReturnType<typeof dryRunEmailSchema.parse>,
  maxBodyCharacters: number,
): EmailFacts {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(input.headers).map(([name, value]) => [
      name.toLowerCase(),
      value,
    ]),
  );
  const from = input.from.toLowerCase();
  const to = input.to.toLowerCase();
  return {
    envelopeFrom: from,
    fromDomain: from.split("@")[1] ?? "",
    envelopeTo: to,
    toLocalPart: to.split("@")[0] ?? "",
    subject: input.subject,
    bodyText: input.bodyText.slice(0, maxBodyCharacters),
    headers: normalizedHeaders,
    attachments: input.attachmentNames.map((filename) => ({
      filename,
      mimeType: "application/octet-stream",
      size: 0,
    })),
    hasAttachments: input.attachmentNames.length > 0,
    messageId: normalizedHeaders["message-id"] ?? "dry-run",
    rawSize: input.rawSize,
    mimeParsed: true,
  };
}

async function handleProtectedApi(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  await requireAdmin(request, env);

  const config = loadConfig(env);

  if (url.pathname === "/api/v1/runtime" && request.method === "GET") {
    const rawQuarantine =
      config.quarantineMode === "internal" && env.MESSAGE_ARCHIVE !== undefined;
    return json({
      runtime: {
        spamAction: config.spamAction,
        spamThreshold: config.spamThreshold,
        quarantineMode: config.quarantineMode,
        archiveMode: config.archiveMode,
        ...(config.quarantineAddress
          ? { quarantineAddress: config.quarantineAddress }
          : {}),
        defaultGoreloAddress: config.defaultGoreloAddress,
        eventRetentionDays: config.eventRetentionDays,
        maxParseBytes: config.maxParseBytes,
        features: {
          rawQuarantine,
          release: Boolean(
            rawQuarantine && env.RELEASE_EMAIL && config.releaseFromAddress,
          ),
        },
      },
    });
  }

  if (url.pathname === "/api/v1/extraction/infer") {
    if (request.method !== "POST") return problem(405, "Method not allowed");
    const input = extractionInferenceInputSchema.parse(await readJson(request));
    try {
      const result = inferExtractionTemplate(input);
      const field = webhookExtractionFieldSchema.parse(result.field);
      return json({ ...result, field });
    } catch (error) {
      if (error instanceof TemplateInferenceError) {
        throw new HttpError(422, "Unable to infer an extraction template", {
          code: error.code,
        });
      }
      throw error;
    }
  }

  if (url.pathname === "/api/v1/setup/status" && request.method === "GET") {
    return json({ setup: await buildSetupStatus(env, config) });
  }

  if (url.pathname === "/api/v1/integrations/gorelo/test") {
    if (request.method !== "POST") return problem(405, "Method not allowed");
    return json({ gorelo: await testGoreloConnection(env, config) });
  }

  if (url.pathname === "/api/v1/integrations/gorelo/clients") {
    if (request.method !== "GET") return problem(405, "Method not allowed");
    const rawLimit = url.searchParams.get("limit");
    const limit =
      rawLimit === null ? 100 : positiveQueryInteger(rawLimit, "limit", 500);
    const rawOffset = url.searchParams.get("offset") ?? "0";
    if (!/^\d+$/.test(rawOffset)) {
      throw new HttpError(400, "offset must be a non-negative integer");
    }
    const offset = Number(rawOffset);
    if (!Number.isSafeInteger(offset)) {
      throw new HttpError(400, "offset must be a non-negative safe integer");
    }
    const query = url.searchParams.get("query")?.trim();
    if (
      query !== undefined &&
      (query.length === 0 ||
        query.length > 512 ||
        /[\u0000-\u001f\u007f]/.test(query))
    ) {
      throw new HttpError(400, "query must be between 1 and 512 characters");
    }
    const page = query
      ? await searchGoreloClients(env.DB, query, { limit, offset })
      : await listGoreloClients(env.DB, { limit, offset });
    return json({
      clients: page.items.map((client) => ({
        id: client.id,
        name: client.name,
        billingName: client.billingName,
        alternateName: client.alternateName,
        status: client.status,
        domains: client.domains,
        stale: client.stale,
        aliases: client.aliases.map((alias) => ({
          id: alias.id,
          alias: alias.alias,
          scope: alias.scope,
          version: alias.version,
        })),
      })),
      total: page.total,
      ...(page.sync.lastSyncedAt
        ? { lastImportedAt: page.sync.lastSyncedAt }
        : {}),
    });
  }

  if (url.pathname === "/api/v1/integrations/gorelo/clients/import") {
    if (request.method !== "POST") return problem(405, "Method not allowed");
    const startedAt = new Date();
    const clients = await fetchAllGoreloClients(env, config);
    let result;
    try {
      result = await importGoreloClients(env.DB, clients, {
        syncedAt: startedAt,
      });
    } catch (error) {
      if (error instanceof GoreloClientImportValidationError) {
        throw new HttpError(
          422,
          "Gorelo returned client data that could not be imported",
          { code: "invalid_client_data", stage: "client-validation" },
        );
      }
      console.error("Gorelo client directory persistence failed", {
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw new HttpError(503, "Gorelo client directory could not be saved", {
        code: "storage_error",
        stage: "client-storage",
      });
    }
    return json({
      import: {
        created: result.createdCount,
        updated: result.updatedCount,
        total: result.importedCount,
        completedAt: result.syncedAt,
      },
    });
  }

  if (url.pathname === "/api/v1/integrations/gorelo/client-aliases") {
    if (request.method !== "POST") return problem(405, "Method not allowed");
    const input = clientAliasCreateSchema.parse(await readJson(request));
    const client = await env.DB.prepare(
      "SELECT id FROM gorelo_clients WHERE id = ? LIMIT 1",
    )
      .bind(input.clientId)
      .first<{ id: number }>();
    if (!client) throw new HttpError(404, "Gorelo client not found");
    return json({ alias: await createClientAlias(env.DB, input) }, 201);
  }

  if (url.pathname === "/api/v1/integrations/gorelo/client-aliases/batch") {
    if (request.method !== "POST") return problem(405, "Method not allowed");
    const input = clientAliasBatchCreateSchema.parse(await readJson(request));
    const client = await env.DB.prepare(
      "SELECT id FROM gorelo_clients WHERE id = ? LIMIT 1",
    )
      .bind(input.clientId)
      .first<{ id: number }>();
    if (!client) throw new HttpError(404, "Gorelo client not found");
    const aliases = await createClientAliases(env.DB, input);
    return json({ aliases, created: aliases.length }, 201);
  }

  const clientAliasMatch = url.pathname.match(
    /^\/api\/v1\/integrations\/gorelo\/client-aliases\/([^/]+)$/,
  );
  if (clientAliasMatch) {
    const id = safeResourceId(
      decodeURIComponent(clientAliasMatch[1]!),
      "client alias ID",
    );
    if (request.method === "PUT") {
      const input = clientAliasUpdateSchema.parse(await readJson(request));
      const result = await updateClientAlias(env.DB, id, input.version, {
        alias: input.alias,
        ...(input.scope === undefined ? {} : { scope: input.scope }),
      });
      if (result.status === "not_found") {
        return problem(404, "Client alias not found");
      }
      if (result.status === "conflict") {
        return problem(
          409,
          "The client alias changed; refresh before trying again",
          { currentVersion: result.current.version },
        );
      }
      return json({ alias: result.alias });
    }
    if (request.method === "DELETE") {
      const version = positiveQueryInteger(
        url.searchParams.get("version"),
        "version",
      );
      const result = await deleteClientAlias(env.DB, id, version);
      if (result.status === "not_found") {
        return problem(404, "Client alias not found");
      }
      if (result.status === "conflict") {
        return problem(
          409,
          "The client alias changed; refresh before trying again",
          { currentVersion: result.current.version },
        );
      }
      return new Response(null, { status: 204 });
    }
    return problem(405, "Method not allowed");
  }

  if (url.pathname === "/api/v1/integrations/gorelo/client-resolution") {
    if (request.method !== "GET") return problem(405, "Method not allowed");
    const identity = url.searchParams.get("identity") ?? "";
    if (
      identity.trim().length === 0 ||
      identity.length > 512 ||
      /[\u0000-\u001f\u007f]/.test(identity)
    ) {
      throw new HttpError(400, "identity must be between 1 and 512 characters");
    }
    const scope = url.searchParams.get("scope")?.trim() || "global";
    if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(scope)) {
      throw new HttpError(400, "Invalid alias scope");
    }
    return json({
      resolution: await resolveClientIdentity(env.DB, identity, { scope }),
    });
  }

  const goreloCatalogMatch = url.pathname.match(
    /^\/api\/v1\/integrations\/gorelo\/catalogs\/([^/]+)$/,
  );
  if (goreloCatalogMatch) {
    if (request.method !== "GET") return problem(405, "Method not allowed");
    const kind = decodeURIComponent(goreloCatalogMatch[1]!);
    if (!GORELO_CATALOG_KINDS.includes(kind as GoreloCatalogKind)) {
      throw new HttpError(400, "Unknown Gorelo catalog kind");
    }
    const rawClientId = url.searchParams.get("clientId");
    let clientId: number | undefined;
    if (rawClientId !== null) {
      if (!/^[1-9]\d{0,15}$/.test(rawClientId)) {
        throw new HttpError(400, "clientId must be a positive integer");
      }
      clientId = Number(rawClientId);
      if (!Number.isSafeInteger(clientId)) {
        throw new HttpError(400, "clientId must be a positive safe integer");
      }
    }
    const rawRefresh = url.searchParams.get("refresh");
    if (
      rawRefresh !== null &&
      rawRefresh !== "true" &&
      rawRefresh !== "false"
    ) {
      throw new HttpError(400, "refresh must be true or false");
    }
    return json({
      catalog: await getGoreloCatalog(env, config, kind as GoreloCatalogKind, {
        ...(clientId === undefined ? {} : { clientId }),
        refresh: rawRefresh === "true",
      }),
    });
  }

  if (url.pathname === "/api/v1/webhooks") {
    if (request.method === "GET") {
      return json({
        webhooks: await listWebhookDestinations(env.DB),
        capability: webhookCapability(config),
      });
    }
    if (request.method === "POST") {
      const input = webhookCreateSchema.parse(await readJson(request));
      try {
        return json(
          {
            webhook: await createWebhookDestination(
              env.DB,
              registeredWebhookInput(input, config),
            ),
          },
          201,
        );
      } catch (error) {
        if (isUniqueConstraintError(error, "webhook_destinations")) {
          throw new HttpError(
            409,
            "A webhook destination with that name or URL already exists",
          );
        }
        throw error;
      }
    }
    return problem(405, "Method not allowed");
  }

  const webhookMatch = url.pathname.match(/^\/api\/v1\/webhooks\/([^/]+)$/);
  if (webhookMatch) {
    const id = safeResourceId(
      decodeURIComponent(webhookMatch[1]!),
      "webhook ID",
    );
    if (request.method === "PUT") {
      const input = webhookUpdateSchema.parse(await readJson(request));
      if (
        !input.enabled &&
        (await enabledWebhookRuleReferenceCount(env.DB, id)) > 0
      ) {
        throw new HttpError(
          409,
          "Disable or repoint enabled webhook rules before disabling this destination",
        );
      }
      let result;
      try {
        result = await updateWebhookDestination(
          env.DB,
          id,
          input.version,
          registeredWebhookInput(input, config),
        );
      } catch (error) {
        if (isUniqueConstraintError(error, "webhook_destinations")) {
          throw new HttpError(
            409,
            "A webhook destination with that name or URL already exists",
          );
        }
        throw error;
      }
      if (result.status === "not_found") {
        return problem(404, "Webhook destination not found");
      }
      if (result.status === "conflict") {
        return problem(
          409,
          "The webhook destination changed; refresh before trying again",
        );
      }
      if (result.status === "updated") {
        return json({ webhook: result.webhook });
      }
      return problem(500, "Webhook destination update failed");
    }
    if (request.method === "DELETE") {
      const version = positiveQueryInteger(
        url.searchParams.get("version"),
        "version",
      );
      if ((await enabledWebhookRuleReferenceCount(env.DB, id)) > 0) {
        throw new HttpError(
          409,
          "Disable or repoint enabled webhook rules before deleting this destination",
        );
      }
      const result = await deleteWebhookDestination(env.DB, id, version);
      if (result === "not_found") {
        return problem(404, "Webhook destination not found");
      }
      if (result === "conflict") {
        return problem(
          409,
          "The webhook destination changed; refresh before trying again",
        );
      }
      return new Response(null, { status: 204 });
    }
    return problem(405, "Method not allowed");
  }

  if (url.pathname === "/api/v1/deliveries" && request.method === "GET") {
    const requestedLimit = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(100, Math.max(1, requestedLimit))
      : 50;
    const rawState = url.searchParams.get("state");
    if (rawState && !DELIVERY_STATES.includes(rawState as DeliveryState)) {
      throw new HttpError(400, "Invalid delivery state");
    }
    const eventId = url.searchParams.get("eventId")?.trim();
    if (eventId && !/^[a-z0-9:_-]{1,320}$/i.test(eventId)) {
      throw new HttpError(400, "Invalid eventId");
    }
    return json({
      deliveries: await listDeliveries(env.DB, {
        limit,
        ...(rawState ? { state: rawState as DeliveryState } : {}),
        ...(eventId ? { eventId } : {}),
      }),
    });
  }

  const deliveryMatch = url.pathname.match(/^\/api\/v1\/deliveries\/([^/]+)$/);
  if (deliveryMatch) {
    if (request.method !== "GET") return problem(405, "Method not allowed");
    const id = decodeURIComponent(deliveryMatch[1]!);
    if (!/^[a-z0-9:_-]{1,320}$/i.test(id)) {
      throw new HttpError(400, "Invalid delivery ID");
    }
    const delivery = await getDelivery(env.DB, id);
    return delivery
      ? json({ delivery })
      : problem(404, "Outbound delivery not found");
  }

  if (url.pathname === "/api/v1/rules" && request.method === "GET") {
    return json({ rules: await listRules(env.DB) });
  }

  if (url.pathname === "/api/v1/rules" && request.method === "POST") {
    const input = ruleInputSchema.parse(await readJson(request));
    await validatePersistedRuleAction(env, input.action, config);
    return json({ rule: await createRule(env.DB, input) }, 201);
  }

  const ruleMatch = url.pathname.match(/^\/api\/v1\/rules\/([^/]+)$/);
  if (ruleMatch) {
    const id = decodeURIComponent(ruleMatch[1]!);
    if (request.method === "GET") {
      const rule = await getRule(env.DB, id);
      return rule ? json({ rule }) : problem(404, "Rule not found");
    }
    if (request.method === "PUT") {
      const input = ruleInputSchema.parse(await readJson(request));
      await validatePersistedRuleAction(env, input.action, config);
      const rule = await updateRule(env.DB, id, input);
      return rule ? json({ rule }) : problem(404, "Rule not found");
    }
    if (request.method === "DELETE") {
      return (await deleteRule(env.DB, id))
        ? new Response(null, { status: 204 })
        : problem(404, "Rule not found");
    }
    return problem(405, "Method not allowed");
  }

  if (url.pathname === "/api/v1/events" && request.method === "GET") {
    const requestedLimit = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(100, Math.max(1, requestedLimit))
      : 50;
    const requestedStatus = url.searchParams.get("status") ?? "all";
    if (
      requestedStatus !== "all" &&
      !PROCESSING_STATUSES.has(requestedStatus as ProcessingEvent["status"])
    ) {
      throw new HttpError(400, "Invalid processing status");
    }
    const cursor = decodeEventCursor(url.searchParams.get("cursor"));
    const query = listSearchQuery(url);
    const page = await listEventsPage(env.DB, {
      limit,
      ...(cursor ? { cursor } : {}),
      ...(query ? { query } : {}),
      ...(requestedStatus === "all"
        ? {}
        : { status: requestedStatus as ProcessingEvent["status"] }),
    });
    return json({
      events: page.items,
      nextCursor: page.nextCursor ? encodeEventCursor(page.nextCursor) : null,
    });
  }

  const eventRawMatch = url.pathname.match(/^\/api\/v1\/events\/([^/]+)\/raw$/);
  if (eventRawMatch) {
    if (request.method !== "GET") return problem(405, "Method not allowed");
    if (!env.MESSAGE_ARCHIVE) {
      throw new HttpError(503, "Raw message storage is not configured");
    }
    const eventId = decodeURIComponent(eventRawMatch[1]!);
    const event = await getEvent(env.DB, eventId);
    if (!event) throw new HttpError(404, "Processing event not found");
    const storage = await getEventStorage(env.DB, eventId);
    if (!storage?.objectKey) {
      throw new HttpError(409, "This event has no retained original");
    }
    const archived = await readArchivedMessage(
      env.MESSAGE_ARCHIVE,
      storage.objectKey,
    );
    if (!archived) {
      throw new HttpError(410, "The retained original is no longer available");
    }
    const body = await verifiedArchivedArrayBuffer(archived, storage.sha256);
    return new Response(body, {
      headers: {
        "content-type": "message/rfc822",
        "content-disposition": `attachment; filename="message-${eventId.replace(/[^a-z0-9-]/gi, "").slice(0, 80) || "event"}.eml"`,
        "content-length": String(body.byteLength),
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; sandbox",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    });
  }

  const eventMatch = url.pathname.match(/^\/api\/v1\/events\/([^/]+)$/);
  if (eventMatch) {
    if (request.method !== "GET") return problem(405, "Method not allowed");
    const eventId = decodeURIComponent(eventMatch[1]!);
    const event = await getEvent(env.DB, eventId);
    if (!event) return problem(404, "Processing event not found");
    const deliverySummaries = await listDeliveries(env.DB, {
      eventId,
      limit: 100,
    });
    const deliveries = (
      await Promise.all(
        deliverySummaries.map((delivery) => getDelivery(env.DB, delivery.id)),
      )
    ).filter((delivery) => delivery !== null);
    return json({
      event: await hydratedEvent(env, config, event),
      deliveries,
    });
  }

  if (url.pathname === "/api/v1/quarantine" && request.method === "GET") {
    const requestedLimit = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(100, Math.max(1, requestedLimit))
      : 50;
    const requestedState = url.searchParams.get("state") ?? "all";
    if (
      requestedState !== "all" &&
      !QUARANTINE_STATES.has(requestedState as QuarantineState)
    ) {
      throw new HttpError(400, "Invalid quarantine state");
    }
    const cursor = decodeEventCursor(url.searchParams.get("cursor"));
    const query = listSearchQuery(url);
    const page = await listQuarantinePage(env.DB, {
      limit,
      ...(requestedState === "all"
        ? {}
        : { state: requestedState as QuarantineState }),
      ...(cursor ? { cursor } : {}),
      ...(query ? { query } : {}),
    });
    return json({
      items: page.items,
      summary: await quarantineSummary(env.DB),
      nextCursor: page.nextCursor ? encodeEventCursor(page.nextCursor) : null,
    });
  }

  const quarantineRawMatch = url.pathname.match(
    /^\/api\/v1\/quarantine\/([^/]+)\/raw$/,
  );
  if (quarantineRawMatch) {
    if (request.method !== "GET") return problem(405, "Method not allowed");
    if (!env.MESSAGE_ARCHIVE) {
      throw new HttpError(503, "Raw quarantine storage is not configured");
    }
    const eventId = decodeURIComponent(quarantineRawMatch[1]!);
    const storage = await getQuarantineStorage(env.DB, eventId);
    if (!storage) throw new HttpError(404, "Quarantined message not found");
    if (!storage.objectKey) {
      throw new HttpError(409, "This quarantine item has no retained original");
    }
    const archived = await readArchivedMessage(
      env.MESSAGE_ARCHIVE,
      storage.objectKey,
    );
    if (!archived) {
      throw new HttpError(410, "The retained original is no longer available");
    }
    const body = await verifiedArchivedArrayBuffer(archived, storage.sha256);
    return new Response(body, {
      headers: {
        "content-type": "message/rfc822",
        "content-disposition": `attachment; filename="message-${eventId.replace(/[^a-z0-9-]/gi, "").slice(0, 80) || "quarantine"}.eml"`,
        "content-length": String(body.byteLength),
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; sandbox",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    });
  }

  const quarantineActionMatch = url.pathname.match(
    /^\/api\/v1\/quarantine\/([^/]+)\/(release|dismiss)$/,
  );
  if (quarantineActionMatch) {
    if (request.method !== "POST") return problem(405, "Method not allowed");
    const eventId = decodeURIComponent(quarantineActionMatch[1]!);
    const action = quarantineActionMatch[2]!;
    const actor = reviewActor(request);

    if (action === "dismiss") {
      const input = dismissRequestSchema.parse(await readJson(request));
      const result = await dismissQuarantine(
        env.DB,
        eventId,
        input.version,
        input.note,
        actor,
      );
      if (result.status !== "updated") mutationProblem(result.status);
      const event = await getEvent(env.DB, eventId);
      return event
        ? json({ event: await hydratedEvent(env, config, event) })
        : problem(404, "Quarantined message not found");
    }

    const input = releaseRequestSchema.parse(await readJson(request));
    if (
      !env.MESSAGE_ARCHIVE ||
      !env.RELEASE_EMAIL ||
      !config.releaseFromAddress
    ) {
      throw new HttpError(
        503,
        "Automated quarantine release is not configured",
      );
    }
    const destination = input.destination ?? config.defaultGoreloAddress;
    validateRuleAction(
      { type: "forward", destination, bypassSpam: false },
      config,
    );
    const storage = await getQuarantineStorage(env.DB, eventId);
    if (!storage) throw new HttpError(404, "Quarantined message not found");
    const sourceEvent = await getEvent(env.DB, eventId);
    if (!sourceEvent?.quarantine) {
      throw new HttpError(404, "Quarantined message not found");
    }
    if (!storage.objectKey) {
      throw new HttpError(409, "This quarantine item has no retained original");
    }
    if (Date.parse(storage.expiresAt) <= Date.now()) {
      throw new HttpError(410, "The quarantine retention period has expired");
    }
    const started = await beginQuarantineRelease(
      env.DB,
      eventId,
      input.version,
      destination,
      input.note,
      actor,
    );
    if (started.status !== "updated") mutationProblem(started.status);
    const releaseVersion = started.review.version;

    let releasedEmail: ReturnType<typeof createReleasedEmailMessage>;
    try {
      const archived = await readArchivedMessage(
        env.MESSAGE_ARCHIVE,
        storage.objectKey,
      );
      if (!archived) {
        throw new Error("The retained original is no longer available");
      }
      releasedEmail = createReleasedEmailMessage(
        config.releaseFromAddress,
        destination,
        prepareReleasedMessage(
          await verifiedArchivedArrayBuffer(archived, storage.sha256),
          {
            from: config.releaseFromAddress,
            to: destination,
            originalEnvelopeFrom: sourceEvent.envelopeFrom,
            originalEnvelopeTo: sourceEvent.envelopeTo,
            releaseId: eventId,
          },
        ),
      );
    } catch {
      const failed = await failQuarantineRelease(
        env.DB,
        eventId,
        releaseVersion,
        "Quarantine release preparation failed",
        actor,
      );
      if (failed.status !== "updated") {
        throw new HttpError(
          500,
          "Release preparation failed, but the audit update is uncertain; manual review is required",
        );
      }
      throw new HttpError(502, "Quarantine release preparation failed");
    }

    let sendResult: EmailSendResult;
    try {
      sendResult = await env.RELEASE_EMAIL.send(releasedEmail);
    } catch {
      try {
        await markQuarantineReleaseUncertain(
          env.DB,
          eventId,
          releaseVersion,
          "dispatch_outcome_unknown",
          actor,
        );
      } catch {
        // The item already remains `releasing`, which is safely non-retryable.
      }
      throw new HttpError(
        502,
        "Quarantine release outcome is uncertain; manual review is required",
      );
    }

    let completed: Awaited<ReturnType<typeof completeQuarantineRelease>>;
    try {
      completed = await completeQuarantineRelease(
        env.DB,
        eventId,
        releaseVersion,
        sendResult.messageId,
        actor,
      );
    } catch {
      try {
        await markQuarantineReleaseUncertain(
          env.DB,
          eventId,
          releaseVersion,
          "audit_completion_unknown",
          actor,
          sendResult.messageId,
        );
      } catch {
        // The item already remains `releasing`, which is safely non-retryable.
      }
      throw new HttpError(
        500,
        "Cloudflare accepted the release, but audit completion is uncertain; manual review is required",
      );
    }
    if (completed.status !== "updated") {
      try {
        await markQuarantineReleaseUncertain(
          env.DB,
          eventId,
          releaseVersion,
          "audit_completion_unknown",
          actor,
          sendResult.messageId,
        );
      } catch {
        // The item already remains `releasing`, which is safely non-retryable.
      }
      throw new HttpError(
        500,
        "Cloudflare accepted the release, but audit completion is uncertain; manual review is required",
      );
    }
    const event = await getEvent(env.DB, eventId);
    return event
      ? json({ event: await hydratedEvent(env, config, event) })
      : problem(404, "Quarantined message not found");
  }

  const quarantineDetailMatch = url.pathname.match(
    /^\/api\/v1\/quarantine\/([^/]+)$/,
  );
  if (quarantineDetailMatch) {
    if (request.method !== "GET") return problem(405, "Method not allowed");
    const event = await getEvent(
      env.DB,
      decodeURIComponent(quarantineDetailMatch[1]!),
    );
    return event?.quarantine
      ? json({ event: await hydratedEvent(env, config, event) })
      : problem(404, "Quarantined message not found");
  }

  if (url.pathname === "/api/v1/readiness" && request.method === "GET") {
    const setup = await buildSetupStatus(env, config);
    if (!setup.ready) {
      throw new HttpError(503, "Deployment is not ready", {
        missing: setup.checks
          .filter((check) => check.status === "missing")
          .map((check) => ({ key: check.key, detail: check.detail })),
      });
    }
    return json({ status: "ready", timestamp: new Date().toISOString() });
  }

  if (url.pathname === "/api/v1/evaluate" && request.method === "POST") {
    const input = dryRunEmailSchema.parse(await readJson(request));
    const rules = await listRules(env.DB);
    const suppliedFacts = dryRunFacts(input, config.maxBodyCharacters);
    const basicFacts: EmailFacts = {
      ...suppliedFacts,
      bodyText: "",
      attachments: [],
      hasAttachments: false,
      mimeParsed: false,
    };
    const basicSpam = assessSpam(basicFacts, config);
    const preliminaryDecision = decideWithoutMime(
      { ...basicFacts, spam: basicSpam },
      rules,
      config,
    );
    if (
      !preliminaryDecision &&
      rulesNeedMime(rules) &&
      input.rawSize > config.maxParseBytes
    ) {
      throw new HttpError(
        422,
        "Live message would exceed the configured MIME inspection limit",
        {
          rawSize: input.rawSize,
          maxParseBytes: config.maxParseBytes,
          outcome: config.failureForwardAddress
            ? "failure forwarding policy"
            : "permanent SMTP rejection",
        },
      );
    }
    const facts = preliminaryDecision ? basicFacts : suppliedFacts;
    const spam = preliminaryDecision
      ? basicSpam
      : assessSpam(suppliedFacts, config);
    const decision =
      preliminaryDecision ?? decide({ ...suppliedFacts, spam }, rules, config);
    let webhookPreview:
      | {
          variables: Record<string, string>;
          clientResolution?: unknown;
        }
      | undefined;
    if (decision.webhook) {
      try {
        const variables = extractWebhookVariables(
          suppliedFacts,
          decision.webhook.fields,
        );
        webhookPreview = { variables };
        if (decision.webhook.clientIdentityField) {
          const identity =
            variables[decision.webhook.clientIdentityField] ?? "";
          webhookPreview.clientResolution = identity.trim()
            ? await resolveClientIdentity(env.DB, identity, {
                scope: decision.webhook.clientAliasScope ?? "global",
              })
            : { status: "not_found", normalizedIdentity: "" };
        }
      } catch (error) {
        if (error instanceof WebhookExtractionError) {
          throw new HttpError(422, "Webhook field extraction failed", {
            code: error.code,
            field: error.fieldKey,
          });
        }
        throw error;
      }
    }
    const goreloPreview = decision.gorelo
      ? await prepareGoreloAction(env.DB, suppliedFacts, decision.gorelo.action)
      : undefined;
    return json({
      decision,
      facts: { ...facts, bodyText: undefined },
      ...(webhookPreview ? { webhookPreview } : {}),
      ...(goreloPreview ? { goreloPreview } : {}),
    });
  }

  return problem(404, "Not found");
}

export async function handleFetch(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);

  try {
    if (url.pathname === "/healthz" && request.method === "GET") {
      try {
        loadConfig(env);
        return json({ status: "ok", timestamp: new Date().toISOString() });
      } catch {
        return json(
          {
            status: "unhealthy",
            message: "Runtime configuration is unavailable",
            timestamp: new Date().toISOString(),
          },
          503,
        );
      }
    }

    if (url.pathname === "/" && request.method === "GET") {
      return json({
        name: "Gorelo Router",
        health: "/healthz",
        api: "/api/v1",
        admin: "/admin",
      });
    }

    if (
      (url.pathname === "/admin" || url.pathname === "/admin/") &&
      request.method === "GET"
    ) {
      return adminResponse();
    }

    if (url.pathname === "/admin/tabler.css" && request.method === "GET") {
      return adminThemeResponse();
    }

    if (url.pathname.startsWith("/api/v1/")) {
      return await handleProtectedApi(request, env, url);
    }

    return problem(404, "Not found");
  } catch (error) {
    if (error instanceof HttpError) {
      return problem(error.status, error.message, error.details);
    }
    if (error instanceof ZodError) {
      return problem(
        400,
        "Validation failed",
        error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      );
    }
    if (error instanceof ConfigurationError) {
      return problem(503, error.message);
    }
    if (error instanceof ArchivedMessageIntegrityError) {
      return problem(409, error.message);
    }
    if (error instanceof RuleActionError) {
      return problem(400, error.message);
    }
    if (error instanceof ClientAliasConflictError) {
      return problem(
        409,
        "That client alias is already assigned within the selected scope",
      );
    }
    if (error instanceof ClientAliasCanonicalConflictError) {
      return problem(
        409,
        "That alias matches another current Gorelo client's exact identity",
        { code: "canonical_identity_conflict" },
      );
    }
    if (error instanceof GoreloIntegrationError) {
      return problem(error.status, error.message, {
        code: error.code,
        ...(error.upstreamStatus === undefined
          ? {}
          : { upstreamStatus: error.upstreamStatus }),
        ...(error.diagnostic ?? {}),
      });
    }
    console.error("HTTP request failed", error);
    return problem(500, "Internal server error");
  }
}
