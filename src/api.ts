import { adminResponse } from "./admin";
import {
  ArchivedMessageIntegrityError,
  createReleasedEmailMessage,
  prepareReleasedMessage,
  readArchivedMessage,
  verifiedArchivedArrayBuffer,
} from "./archive";
import {
  ConfigurationError,
  isAllowedMailboxDestination,
  loadConfig,
} from "./config";
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
import {
  createGoreloMailbox,
  deleteGoreloMailbox,
  GoreloMailboxInvariantError,
  loadGoreloMailboxDirectory,
  normalizeGoreloMailboxAddress,
  setDefaultGoreloMailbox,
  updateGoreloMailbox,
  type GoreloMailboxDirectory,
} from "./mailbox-repository";
import {
  ActiveParserCaptureError,
  cancelParserCapture,
  createParserCapture,
  getParserCapture,
  getParserCaptureStorage,
  listParserCaptures,
  ParserCaptureLimitError,
} from "./parser-capture-repository";
import { readParserSample } from "./parser-sample";
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
  RuleMailboxUnavailableError,
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
const MAX_TRAINING_SAMPLE_CHARACTERS = 50_000;
const INSECURE_ADMIN_TOKENS = new Set(["replace-with-a-long-random-token"]);

const releaseRequestSchema = z
  .object({
    version: z.number().int().min(1),
    destination: z.string().trim().email().optional(),
    mailboxId: z.string().uuid().optional(),
    note: z.string().trim().max(2_000).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.destination !== undefined && input.mailboxId !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["mailboxId"],
        message: "Choose a Gorelo mailbox or a legacy destination, not both",
      });
    }
  });

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

const safeMailboxNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), {
    message: "Mailbox name must not contain control characters",
  });

const mailboxCreateSchema = z
  .object({
    name: safeMailboxNameSchema,
    address: z.string().trim().email(),
    enabled: z.boolean().default(true),
  })
  .strict();

const mailboxUpdateSchema = z
  .object({
    name: safeMailboxNameSchema,
    enabled: z.boolean(),
    version: z.number().int().positive(),
  })
  .strict();

const mailboxDefaultSchema = z
  .object({
    mailboxId: z.string().uuid(),
    version: z.number().int().positive(),
  })
  .strict();

const parserCaptureCreateSchema = z
  .object({
    sourceEventId: z.string().uuid(),
    match: z
      .object({
        recipient: z.string().trim().email(),
        senderMode: z.enum(["any", "address", "domain"]),
        senderValue: z.string().trim().min(1).max(254).optional(),
        subjectContains: z.string().trim().min(1).max(200).optional(),
      })
      .strict()
      .superRefine((match, context) => {
        if (match.senderMode === "any") {
          if (match.senderValue !== undefined) {
            context.addIssue({
              code: "custom",
              path: ["senderValue"],
              message: "senderValue is not allowed when senderMode is any",
            });
          }
          return;
        }
        if (match.senderValue === undefined) {
          context.addIssue({
            code: "custom",
            path: ["senderValue"],
            message: `senderValue is required when senderMode is ${match.senderMode}`,
          });
          return;
        }
        if (
          match.senderMode === "address" &&
          !z.string().email().safeParse(match.senderValue).success
        ) {
          context.addIssue({
            code: "custom",
            path: ["senderValue"],
            message: "senderValue must be a valid email address",
          });
        }
        if (
          match.senderMode === "domain" &&
          !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
            match.senderValue,
          )
        ) {
          context.addIssue({
            code: "custom",
            path: ["senderValue"],
            message: "senderValue must be a valid domain",
          });
        }
      }),
    expiresInSeconds: z.number().int().min(300).max(3_600).default(900),
  })
  .strict();

const parserCaptureCancelSchema = z
  .object({ version: z.number().int().positive() })
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

function isGoreloMailboxConflictError(error: unknown): boolean {
  if (isUniqueConstraintError(error, "gorelo_mailboxes")) return true;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("gorelo mailboxes cannot be replaced") ||
    message.includes("gorelo mailbox names cannot replace")
  );
}

async function goreloMailboxDirectory(
  env: Env,
  config: RuntimeConfig,
): Promise<GoreloMailboxDirectory> {
  return loadGoreloMailboxDirectory(env.DB, {
    allowedAddresses: config.allowedForwardDestinations,
    allowedDomains: config.allowedForwardDomains,
    bootstrapAddress: config.defaultGoreloAddress,
  });
}

function publicMailboxDirectory(directory: GoreloMailboxDirectory): {
  mailboxes: GoreloMailboxDirectory["mailboxes"];
  defaultMailboxId: string | null;
  version: number | null;
} {
  return {
    mailboxes: directory.mailboxes,
    defaultMailboxId: directory.settings?.defaultMailboxId ?? null,
    version: directory.settings?.version ?? null,
  };
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
  const mailboxDirectory =
    (action.type === "forward" || action.type === "forward_webhook") &&
    action.destination === undefined
      ? await goreloMailboxDirectory(env, config)
      : undefined;
  validateRuleAction(action, config, mailboxDirectory);
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

type TrainingBodyStatus = "complete" | "truncated" | "unavailable";

interface TrainingSampleResponse {
  sample: {
    eventId: string;
    from: string;
    to: string;
    subject: string;
    bodyText: string;
    body: {
      status: TrainingBodyStatus;
      source:
        "temporary_capture" | "retained_original" | "audit_preview" | "none";
      expiresAt?: string;
    };
    createdAt: string;
  };
  canCaptureNext: boolean;
  warnings: readonly { code: string }[];
}

/** Returns a plain-text-only parser sample without exposing raw MIME or R2 keys. */
async function trainingSampleForEvent(
  env: Env,
  config: RuntimeConfig,
  event: ProcessingEvent,
): Promise<TrainingSampleResponse> {
  const warnings: { code: string }[] = [];
  const base = {
    eventId: event.id,
    from: event.envelopeFrom,
    to: event.envelopeTo,
    subject: event.subject,
    createdAt: event.createdAt,
  };

  if (env.MESSAGE_ARCHIVE) {
    try {
      const captureRow = await env.DB.prepare(
        `SELECT id
             FROM parser_captures
            WHERE captured_event_id = ? AND state = 'captured'
            ORDER BY captured_at DESC
            LIMIT 1`,
      )
        .bind(event.id)
        .first<{ id: string }>();
      const storage = captureRow
        ? await getParserCaptureStorage(env.DB, captureRow.id)
        : null;
      if (storage) {
        const captured = await readParserSample(env.MESSAGE_ARCHIVE, storage);
        if (captured?.eventId === event.id) {
          return {
            sample: {
              ...base,
              from: captured.from,
              to: captured.to,
              subject: captured.subject,
              bodyText: captured.bodyText,
              body: {
                status: captured.bodyTruncated ? "truncated" : "complete",
                source: "temporary_capture",
                expiresAt: storage.expiresAt,
              },
            },
            canCaptureNext: true,
            warnings,
          };
        }
        if (!captured) warnings.push({ code: "temporary_sample_missing" });
      }
    } catch {
      warnings.push({ code: "temporary_sample_unavailable" });
    }
  }

  if (env.MESSAGE_ARCHIVE && event.audit?.rawAvailable) {
    const storage = event.quarantine
      ? await getQuarantineStorage(env.DB, event.id)
      : await getEventStorage(env.DB, event.id);
    if (storage?.objectKey) {
      try {
        const archived = await readArchivedMessage(
          env.MESSAGE_ARCHIVE,
          storage.objectKey,
        );
        if (!archived) {
          warnings.push({ code: "retained_original_missing" });
        } else if (archived.size > config.maxParseBytes) {
          warnings.push({ code: "retained_original_too_large" });
        } else {
          const content = await inspectArchivedContent(
            await verifiedArchivedArrayBuffer(archived, storage.sha256),
            config,
          );
          const responseTruncated =
            content.bodyText.length > MAX_TRAINING_SAMPLE_CHARACTERS;
          return {
            sample: {
              ...base,
              bodyText: content.bodyText.slice(
                0,
                MAX_TRAINING_SAMPLE_CHARACTERS,
              ),
              body: {
                status:
                  content.bodyTruncated || responseTruncated
                    ? "truncated"
                    : "complete",
                source: "retained_original",
              },
            },
            canCaptureNext: true,
            warnings,
          };
        }
      } catch {
        warnings.push({ code: "retained_original_unavailable" });
      }
    }
  }

  const auditBody = event.audit?.mimeParsed
    ? (event.audit.bodyPreview ?? "")
    : "";
  if (auditBody) {
    return {
      sample: {
        ...base,
        bodyText: auditBody.slice(0, MAX_TRAINING_SAMPLE_CHARACTERS),
        body: {
          status: event.audit?.bodyTruncated ? "truncated" : "complete",
          source: "audit_preview",
        },
      },
      canCaptureNext: Boolean(env.MESSAGE_ARCHIVE),
      warnings,
    };
  }

  return {
    sample: {
      ...base,
      bodyText: "",
      body: { status: "unavailable", source: "none" },
    },
    canCaptureNext: Boolean(env.MESSAGE_ARCHIVE),
    warnings,
  };
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
    const mailboxDirectory = await goreloMailboxDirectory(env, config).catch(
      () => undefined,
    );
    return json({
      runtime: {
        spamAction: config.spamAction,
        spamThreshold: config.spamThreshold,
        quarantineMode: config.quarantineMode,
        archiveMode: config.archiveMode,
        ...(config.quarantineAddress
          ? { quarantineAddress: config.quarantineAddress }
          : {}),
        defaultGoreloAddress:
          mailboxDirectory?.defaultMailbox?.address ??
          config.defaultGoreloAddress,
        defaultGoreloMailboxId: mailboxDirectory?.defaultMailbox?.id ?? null,
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

  if (url.pathname === "/api/v1/parser-captures") {
    if (request.method === "GET") {
      return json({
        captures: await listParserCaptures(env.DB, {
          limit: 20,
          sampleAvailableAt: new Date().toISOString(),
        }),
      });
    }
    if (request.method === "POST") {
      if (!env.MESSAGE_ARCHIVE) {
        throw new HttpError(
          503,
          "Capture next requires the private MESSAGE_ARCHIVE binding",
        );
      }
      const input = parserCaptureCreateSchema.parse(await readJson(request));
      const sourceEvent = await getEvent(env.DB, input.sourceEventId);
      if (!sourceEvent) {
        throw new HttpError(404, "Source processing event not found");
      }
      const now = new Date();
      const capture = await createParserCapture(env.DB, {
        sourceEventId: sourceEvent.id,
        match: input.match,
        requestedBy: reviewActor(request),
        createdAt: now.toISOString(),
        waitExpiresAt: new Date(
          now.getTime() + input.expiresInSeconds * 1_000,
        ).toISOString(),
      });
      return json({ capture }, 201);
    }
    return problem(405, "Method not allowed");
  }

  const parserCaptureCancelMatch = url.pathname.match(
    /^\/api\/v1\/parser-captures\/([^/]+)\/cancel$/,
  );
  if (parserCaptureCancelMatch) {
    if (request.method !== "POST") return problem(405, "Method not allowed");
    const id = z
      .string()
      .uuid()
      .parse(decodeURIComponent(parserCaptureCancelMatch[1]!));
    const input = parserCaptureCancelSchema.parse(await readJson(request));
    const result = await cancelParserCapture(env.DB, id, input.version);
    if (result.status === "updated") return json({ capture: result.capture });
    if (result.status === "not_found") {
      return problem(404, "Parser capture not found");
    }
    return problem(
      409,
      "The parser capture changed; refresh before trying again",
    );
  }

  const parserCaptureMatch = url.pathname.match(
    /^\/api\/v1\/parser-captures\/([^/]+)$/,
  );
  if (parserCaptureMatch) {
    if (request.method !== "GET") return problem(405, "Method not allowed");
    const id = z
      .string()
      .uuid()
      .parse(decodeURIComponent(parserCaptureMatch[1]!));
    const capture = await getParserCapture(
      env.DB,
      id,
      new Date().toISOString(),
    );
    return capture
      ? json({ capture })
      : problem(404, "Parser capture not found");
  }

  if (url.pathname === "/api/v1/setup/status" && request.method === "GET") {
    return json({ setup: await buildSetupStatus(env, config) });
  }

  if (url.pathname === "/api/v1/integrations/gorelo/test") {
    if (request.method !== "POST") return problem(405, "Method not allowed");
    return json({ gorelo: await testGoreloConnection(env, config) });
  }

  if (url.pathname === "/api/v1/integrations/gorelo/mailboxes") {
    const directory = await goreloMailboxDirectory(env, config);
    if (request.method === "GET") {
      return json(publicMailboxDirectory(directory));
    }
    if (request.method === "POST") {
      const input = mailboxCreateSchema.parse(await readJson(request));
      const address = normalizeGoreloMailboxAddress(input.address);
      if (!isAllowedMailboxDestination(address, config)) {
        const domain = address.slice(address.lastIndexOf("@") + 1);
        throw new HttpError(
          400,
          `Mailbox domain ${domain} is not allowed. Add it to ALLOWED_FORWARD_DOMAINS or add the full address to ALLOWED_FORWARD_DESTINATIONS`,
        );
      }
      try {
        const mailbox = await createGoreloMailbox(env.DB, {
          ...input,
          address,
        });
        return json({ mailbox }, 201);
      } catch (error) {
        if (isGoreloMailboxConflictError(error)) {
          throw new HttpError(
            409,
            "A Gorelo mailbox with that name or address already exists",
          );
        }
        throw error;
      }
    }
    return problem(405, "Method not allowed");
  }

  if (url.pathname === "/api/v1/integrations/gorelo/mailboxes/default") {
    if (request.method !== "PUT") return problem(405, "Method not allowed");
    const input = mailboxDefaultSchema.parse(await readJson(request));
    const directory = await goreloMailboxDirectory(env, config);
    const target = directory.byId.get(input.mailboxId);
    if (!target) throw new HttpError(404, "Gorelo mailbox not found");
    if (!target.enabled) {
      throw new HttpError(409, "A disabled mailbox cannot be the default");
    }
    if (!target.allowlisted) {
      throw new HttpError(
        400,
        "The selected mailbox is outside the allowed domain and address policy",
      );
    }
    const result = await setDefaultGoreloMailbox(
      env.DB,
      input.mailboxId,
      input.version,
    );
    if (result.status === "updated") {
      return json({ mailbox: result.mailbox, settings: result.settings });
    }
    if (result.status === "not_found") {
      return problem(404, "Gorelo mailbox not found");
    }
    if (result.status === "disabled") {
      return problem(409, "A disabled mailbox cannot be the default");
    }
    return problem(
      409,
      "The Gorelo mailbox registry changed; refresh before trying again",
    );
  }

  const goreloMailboxMatch = url.pathname.match(
    /^\/api\/v1\/integrations\/gorelo\/mailboxes\/([^/]+)$/,
  );
  if (goreloMailboxMatch) {
    const id = z
      .string()
      .uuid()
      .parse(decodeURIComponent(goreloMailboxMatch[1]!));
    if (request.method === "PUT") {
      const input = mailboxUpdateSchema.parse(await readJson(request));
      let result;
      try {
        result = await updateGoreloMailbox(env.DB, id, input.version, input);
      } catch (error) {
        if (isGoreloMailboxConflictError(error)) {
          throw new HttpError(
            409,
            "A Gorelo mailbox with that name already exists",
          );
        }
        throw error;
      }
      if (result.status === "updated") {
        return json({ mailbox: result.mailbox });
      }
      if (result.status === "not_found") {
        return problem(404, "Gorelo mailbox not found");
      }
      if (result.status === "default") {
        return problem(409, "The default mailbox cannot be disabled");
      }
      if (result.status === "referenced") {
        return problem(
          409,
          "Repoint rules that use this mailbox before disabling it",
        );
      }
      return problem(
        409,
        "The Gorelo mailbox changed; refresh before trying again",
      );
    }
    if (request.method === "DELETE") {
      const version = positiveQueryInteger(
        url.searchParams.get("version"),
        "version",
      );
      const result = await deleteGoreloMailbox(env.DB, id, version);
      if (result === "deleted") return new Response(null, { status: 204 });
      if (result === "not_found") {
        return problem(404, "Gorelo mailbox not found");
      }
      if (result === "default") {
        return problem(409, "The default mailbox cannot be deleted");
      }
      if (result === "referenced") {
        return problem(
          409,
          "Repoint rules that use this mailbox before deleting it",
        );
      }
      return problem(
        409,
        "The Gorelo mailbox changed; refresh before trying again",
      );
    }
    return problem(405, "Method not allowed");
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
    try {
      return json({ rule: await createRule(env.DB, input) }, 201);
    } catch (error) {
      if (error instanceof RuleMailboxUnavailableError) {
        throw new HttpError(
          409,
          "The selected Gorelo mailbox changed; refresh before saving the rule",
        );
      }
      throw error;
    }
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
      let rule;
      try {
        rule = await updateRule(env.DB, id, input);
      } catch (error) {
        if (error instanceof RuleMailboxUnavailableError) {
          throw new HttpError(
            409,
            "The selected Gorelo mailbox changed; refresh before saving the rule",
          );
        }
        throw error;
      }
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

  const eventTrainingSampleMatch = url.pathname.match(
    /^\/api\/v1\/events\/([^/]+)\/training-sample$/,
  );
  if (eventTrainingSampleMatch) {
    if (request.method !== "GET") return problem(405, "Method not allowed");
    const eventId = decodeURIComponent(eventTrainingSampleMatch[1]!);
    const event = await getEvent(env.DB, eventId);
    if (!event) return problem(404, "Processing event not found");
    return json(await trainingSampleForEvent(env, config, event));
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
    const mailboxDirectory = await goreloMailboxDirectory(env, config);
    const selectedMailbox = input.mailboxId
      ? mailboxDirectory.byId.get(input.mailboxId)
      : input.destination
        ? undefined
        : mailboxDirectory.defaultMailbox;
    if (input.mailboxId && !selectedMailbox) {
      throw new HttpError(400, "The selected Gorelo mailbox is not registered");
    }
    if (selectedMailbox && !selectedMailbox.routable) {
      throw new HttpError(
        400,
        "The selected Gorelo mailbox is disabled or outside the allowed destination policy",
      );
    }
    const destination =
      input.destination ??
      selectedMailbox?.address ??
      config.defaultGoreloAddress;
    validateRuleAction(
      input.destination
        ? { type: "forward", destination, bypassSpam: false }
        : {
            type: "forward",
            ...(selectedMailbox ? { mailboxId: selectedMailbox.id } : {}),
            bypassSpam: false,
          },
      config,
      mailboxDirectory,
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
    const [rules, mailboxDirectory] = await Promise.all([
      listRules(env.DB),
      goreloMailboxDirectory(env, config),
    ]);
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
      mailboxDirectory,
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
      preliminaryDecision ??
      decide({ ...suppliedFacts, spam }, rules, config, mailboxDirectory);
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
    if (error instanceof GoreloMailboxInvariantError) {
      return problem(409, error.message);
    }
    if (error instanceof ActiveParserCaptureError) {
      return problem(409, error.message, { code: "capture_already_active" });
    }
    if (error instanceof ParserCaptureLimitError) {
      return problem(429, error.message, { code: "capture_limit_reached" });
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
