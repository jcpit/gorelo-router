import { canonicalizeDeliveryPayload } from "./delivery-repository";
import { getGoreloCatalog } from "./gorelo-integration";
import { prepareGoreloActionFromVariables } from "./gorelo-action";
import {
  GORELO_DELIVERY_SCHEMA_VERSION,
  executeGoreloDelivery,
  type ExecuteGoreloDeliveryInput,
} from "./gorelo-delivery";
import {
  getRule,
  recordEvent,
  recordEventWithPendingStructuredDelivery,
  recordEventWithPendingWebhookDelivery,
  updateEventProcessingOutcome,
} from "./repository";
import type {
  AuditTraceStep,
  Env,
  GoreloRuleAction,
  MessageAudit,
  ProcessingEvent,
  RuntimeConfig,
} from "./types";
import {
  executeWebhookDelivery,
  prepareWebhookDeliveryPayload,
} from "./webhook-delivery";
import { z } from "zod";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_JSON_DEPTH = 20;
const MAX_JSON_NODES = 10_000;
const MAX_JSON_PROPERTIES = 1_000;
const TOKEN_PREFIX = "grwh_";
const textEncoder = new TextEncoder();

const safeName = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
const safeIdentifier = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
  .refine(
    (value) =>
      !/(?:authorization|api.?key|access.?token|refresh.?token|password|passwd|secret|private.?key|cookie|credential)$/i.test(
        value.replace(/[^a-z0-9]/gi, ""),
      ),
    { message: "Credential-like fields cannot be mapped or retained" },
  );
const jsonPointer = z
  .string()
  .min(1)
  .max(1_024)
  .startsWith("/")
  .refine((value) => !/~(?:[^01]|$)/.test(value), {
    message: "JSON Pointer escapes must use ~0 or ~1",
  });

export const inboundWebhookMappingSchema = z
  .object({
    key: safeIdentifier,
    pointer: jsonPointer,
    required: z.boolean().default(false),
    defaultValue: z
      .string()
      .max(4_000)
      .refine((value) => !/[\u0000-\u001f\u007f]/.test(value))
      .optional(),
    maxCharacters: z.number().int().min(1).max(4_000).default(4_000),
  })
  .strict();

export const inboundWebhookActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("accept") }).strict(),
  z
    .object({
      type: z.literal("send_webhook"),
      destinationId: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-z0-9_-]+$/i),
      eventType: z
        .string()
        .min(1)
        .max(128)
        .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
        .default("webhook.routed"),
    })
    .strict(),
  z
    .object({
      type: z.literal("gorelo_rule"),
      ruleId: z.string().uuid(),
    })
    .strict(),
]);

export const inboundWebhookSourceInputSchema = z
  .object({
    name: safeName,
    slug,
    enabled: z.boolean().default(true),
    mappings: z.array(inboundWebhookMappingSchema).min(1).max(50),
    action: inboundWebhookActionSchema,
    rateLimitPerMinute: z.number().int().min(1).max(1_000).default(60),
  })
  .strict()
  .superRefine((input, context) => {
    const keys = new Set<string>();
    input.mappings.forEach((mapping, index) => {
      if (keys.has(mapping.key)) {
        context.addIssue({
          code: "custom",
          path: ["mappings", index, "key"],
          message: "Mapping keys must be unique",
        });
      }
      keys.add(mapping.key);
    });
  });

export const inboundWebhookSourceUpdateSchema = inboundWebhookSourceInputSchema
  .extend({ version: z.number().int().positive() })
  .strict();

export type InboundWebhookMapping = z.infer<typeof inboundWebhookMappingSchema>;
export type InboundWebhookAction = z.infer<typeof inboundWebhookActionSchema>;
export type InboundWebhookSourceInput = z.infer<
  typeof inboundWebhookSourceInputSchema
>;

export interface InboundWebhookSource extends InboundWebhookSourceInput {
  id: string;
  tokenHint: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  endpointPath: string;
}

interface SourceRow {
  id: string;
  name: string;
  slug: string;
  token_hash: string;
  token_hint: string;
  enabled: number;
  mappings_json: string;
  action_json: string;
  rate_limit_per_minute: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export class InboundWebhookError extends Error {
  override readonly name = "InboundWebhookError";

  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

function rowToSource(row: SourceRow): InboundWebhookSource {
  const input = inboundWebhookSourceInputSchema.parse({
    name: row.name,
    slug: row.slug,
    enabled: row.enabled === 1,
    mappings: JSON.parse(row.mappings_json) as unknown,
    action: JSON.parse(row.action_json) as unknown,
    rateLimitPerMinute: row.rate_limit_per_minute,
  });
  return {
    id: row.id,
    ...input,
    tokenHint: row.token_hint,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    endpointPath: `/hooks/v1/${row.slug}`,
  };
}

const SOURCE_COLUMNS = `id, name, slug, token_hash, token_hint, enabled,
       mappings_json, action_json, rate_limit_per_minute, version,
       created_at, updated_at`;

export async function listInboundWebhookSources(
  db: D1Database,
): Promise<InboundWebhookSource[]> {
  const result = await db
    .prepare(
      `SELECT ${SOURCE_COLUMNS}
         FROM inbound_webhook_sources
        ORDER BY name COLLATE NOCASE, id`,
    )
    .all<SourceRow>();
  return result.results.map(rowToSource);
}

export async function getInboundWebhookSource(
  db: D1Database,
  id: string,
): Promise<InboundWebhookSource | null> {
  const row = await db
    .prepare(
      `SELECT ${SOURCE_COLUMNS}
         FROM inbound_webhook_sources
        WHERE id = ?`,
    )
    .bind(id)
    .first<SourceRow>();
  return row ? rowToSource(row) : null;
}

async function getInboundWebhookSourceSecret(
  db: D1Database,
  sourceSlug: string,
): Promise<{ source: InboundWebhookSource; tokenHash: string } | null> {
  const row = await db
    .prepare(
      `SELECT ${SOURCE_COLUMNS}
         FROM inbound_webhook_sources
        WHERE slug = ?`,
    )
    .bind(sourceSlug)
    .first<SourceRow>();
  return row ? { source: rowToSource(row), tokenHash: row.token_hash } : null;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  const base64 = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  return `${TOKEN_PREFIX}${base64}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function createInboundWebhookSource(
  db: D1Database,
  input: InboundWebhookSourceInput,
): Promise<{ source: InboundWebhookSource; token: string }> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO inbound_webhook_sources
         (id, name, slug, token_hash, token_hint, enabled, mappings_json,
          action_json, rate_limit_per_minute, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(
      id,
      input.name,
      input.slug,
      tokenHash,
      token.slice(-6),
      input.enabled ? 1 : 0,
      JSON.stringify(input.mappings),
      JSON.stringify(input.action),
      input.rateLimitPerMinute,
      now,
      now,
    )
    .run();
  return {
    source: {
      id,
      ...input,
      tokenHint: token.slice(-6),
      version: 1,
      createdAt: now,
      updatedAt: now,
      endpointPath: `/hooks/v1/${input.slug}`,
    },
    token,
  };
}

export async function updateInboundWebhookSource(
  db: D1Database,
  id: string,
  input: InboundWebhookSourceInput & { version: number },
): Promise<InboundWebhookSource | null | "conflict"> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE inbound_webhook_sources
          SET name = ?, slug = ?, enabled = ?, mappings_json = ?,
              action_json = ?, rate_limit_per_minute = ?,
              version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?`,
    )
    .bind(
      input.name,
      input.slug,
      input.enabled ? 1 : 0,
      JSON.stringify(input.mappings),
      JSON.stringify(input.action),
      input.rateLimitPerMinute,
      now,
      id,
      input.version,
    )
    .run();
  if (result.meta.changes === 1) return getInboundWebhookSource(db, id);
  return (await getInboundWebhookSource(db, id)) ? "conflict" : null;
}

export async function deleteInboundWebhookSource(
  db: D1Database,
  id: string,
  version: number,
): Promise<"deleted" | "not_found" | "conflict"> {
  const result = await db
    .prepare("DELETE FROM inbound_webhook_sources WHERE id = ? AND version = ?")
    .bind(id, version)
    .run();
  if (result.meta.changes === 1) return "deleted";
  return (await getInboundWebhookSource(db, id)) ? "conflict" : "not_found";
}

export async function rotateInboundWebhookSourceToken(
  db: D1Database,
  id: string,
  version: number,
): Promise<
  { source: InboundWebhookSource; token: string } | null | "conflict"
> {
  const token = randomToken();
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE inbound_webhook_sources
          SET token_hash = ?, token_hint = ?, version = version + 1,
              updated_at = ?
        WHERE id = ? AND version = ?`,
    )
    .bind(await sha256Hex(token), token.slice(-6), now, id, version)
    .run();
  if (result.meta.changes === 1) {
    return { source: (await getInboundWebhookSource(db, id))!, token };
  }
  return (await getInboundWebhookSource(db, id)) ? "conflict" : null;
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (left.length !== 64 || right.length !== 64) return false;
  let difference = 0;
  for (let index = 0; index < 64; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function suppliedToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) return authorization.slice(7);
  return request.headers.get("x-gorelo-router-token") ?? "";
}

async function readJsonBody(
  request: Request,
): Promise<{ payload: unknown; bytes: number; digest: string }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new InboundWebhookError(
      415,
      "Content-Type must be application/json",
      "unsupported_media_type",
    );
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new InboundWebhookError(
      413,
      "Payload is too large",
      "payload_too_large",
    );
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  if (reader) {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new InboundWebhookError(
          413,
          "Payload is too large",
          "payload_too_large",
        );
      }
      chunks.push(result.value);
    }
  }
  const raw = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw)) as unknown;
  } catch {
    throw new InboundWebhookError(
      400,
      "Payload must be valid JSON",
      "invalid_json",
    );
  }
  validateJsonShape(payload);
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", raw)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return { payload, bytes, digest };
}

function validateJsonShape(payload: unknown): void {
  const stack: Array<{ value: unknown; depth: number }> = [
    { value: payload, depth: 0 },
  ];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes += 1;
    if (nodes > MAX_JSON_NODES || current.depth > MAX_JSON_DEPTH) {
      throw new InboundWebhookError(
        400,
        "JSON structure is too complex",
        "invalid_shape",
      );
    }
    if (current.value === null || typeof current.value !== "object") continue;
    const children = Array.isArray(current.value)
      ? current.value
      : Object.values(current.value as Record<string, unknown>);
    if (children.length > MAX_JSON_PROPERTIES) {
      throw new InboundWebhookError(
        400,
        "JSON structure is too wide",
        "invalid_shape",
      );
    }
    for (const value of children)
      stack.push({ value, depth: current.depth + 1 });
  }
}

function pointerValue(payload: unknown, pointer: string): unknown {
  let value = payload;
  for (const rawToken of pointer.slice(1).split("/")) {
    const token = rawToken.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(value)) {
      if (!/^(?:0|[1-9]\d*)$/.test(token)) return undefined;
      value = value[Number(token)];
    } else if (typeof value === "object" && value !== null) {
      if (!Object.prototype.hasOwnProperty.call(value, token)) return undefined;
      value = (value as Record<string, unknown>)[token];
    } else {
      return undefined;
    }
  }
  return value;
}

export function extractInboundWebhookVariables(
  payload: unknown,
  mappings: readonly InboundWebhookMapping[],
): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const mapping of mappings) {
    const extracted = pointerValue(payload, mapping.pointer);
    let value: string | undefined;
    if (
      typeof extracted === "string" ||
      typeof extracted === "number" ||
      typeof extracted === "boolean"
    ) {
      value = String(extracted);
    } else if (extracted === null) {
      value = "";
    }
    if (value === undefined || value.length === 0) value = mapping.defaultValue;
    if (value === undefined) {
      if (mapping.required) {
        throw new InboundWebhookError(
          422,
          `Required mapping ${mapping.key} was not found`,
          "mapping_failed",
        );
      }
      value = "";
    }
    variables[mapping.key] = value.slice(0, mapping.maxCharacters);
  }
  canonicalizeDeliveryPayload({ variables });
  return variables;
}

async function takeRateLimit(
  source: InboundWebhookSource,
  db: D1Database,
): Promise<void> {
  const now = new Date();
  const window = now.toISOString().slice(0, 16);
  const row = await db
    .prepare(
      `INSERT INTO inbound_webhook_rate_limits
         (source_id, window_started_at, request_count)
       VALUES (?, ?, 1)
       ON CONFLICT(source_id, window_started_at) DO UPDATE
         SET request_count = request_count + 1
       WHERE request_count < ?
       RETURNING request_count`,
    )
    .bind(source.id, window, source.rateLimitPerMinute)
    .first<{ request_count: number }>();
  if (!row) {
    throw new InboundWebhookError(
      429,
      "Source rate limit exceeded",
      "rate_limited",
    );
  }
  await db
    .prepare(
      "DELETE FROM inbound_webhook_rate_limits WHERE window_started_at < ?",
    )
    .bind(new Date(now.getTime() - 120_000).toISOString().slice(0, 16))
    .run()
    .catch(() => undefined);
}

function inboundEventIdempotencyKey(request: Request, digest: string): string {
  const supplied =
    request.headers.get("idempotency-key") ??
    request.headers.get("x-event-id") ??
    digest;
  if (
    supplied.length < 1 ||
    supplied.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(supplied)
  ) {
    throw new InboundWebhookError(
      400,
      "Invalid idempotency key",
      "invalid_idempotency_key",
    );
  }
  return supplied;
}

function eventType(request: Request): string {
  const value =
    request.headers.get("x-event-type")?.trim() || "webhook.received";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new InboundWebhookError(
      400,
      "Invalid event type",
      "invalid_event_type",
    );
  }
  return value;
}

async function existingEvent(
  db: D1Database,
  sourceId: string,
  idempotencyKey: string,
): Promise<{ id: string; status: ProcessingEvent["status"] } | null> {
  return db
    .prepare(
      `SELECT id, status
         FROM processing_events
        WHERE ingress_type = 'webhook'
          AND ingress_source_id = ? AND ingress_idempotency_key = ?`,
    )
    .bind(sourceId, idempotencyKey)
    .first<{ id: string; status: ProcessingEvent["status"] }>();
}

function ingressAudit(
  variables: Readonly<Record<string, string>>,
  trace: readonly AuditTraceStep[],
  detail: string,
): MessageAudit {
  return {
    decisionReason: detail,
    spamThreshold: 0,
    mimeParsed: false,
    bodyTruncated: false,
    headers: {},
    bodyPreview: JSON.stringify(variables, null, 2),
    attachments: [],
    trace,
  };
}

function baseEvent(input: {
  source: InboundWebhookSource;
  eventId: string;
  receivedAt: string;
  eventType: string;
  payloadDigest: string;
  idempotencyKey: string;
  variables: Readonly<Record<string, string>>;
  rawSize: number;
  trace: readonly AuditTraceStep[];
  status: ProcessingEvent["status"];
  error?: string;
  matchedRule?: { id: string; name: string };
  destination?: string;
}): ProcessingEvent {
  return {
    id: input.eventId,
    messageId: input.idempotencyKey,
    envelopeFrom: `webhook:${input.source.slug}`,
    envelopeTo: input.source.endpointPath,
    subject: input.eventType,
    rawSize: input.rawSize,
    spamScore: 0,
    spamReasons: [],
    decision: "forward",
    ...(input.matchedRule
      ? {
          matchedRuleId: input.matchedRule.id,
          matchedRuleName: input.matchedRule.name,
        }
      : {}),
    ...(input.destination ? { destination: input.destination } : {}),
    status: input.status,
    ...(input.error ? { error: input.error } : {}),
    ingress: {
      type: "webhook",
      sourceId: input.source.id,
      sourceName: input.source.name,
      eventType: input.eventType,
      payloadDigest: input.payloadDigest,
      idempotencyKey: input.idempotencyKey,
      variables: input.variables,
    },
    audit: ingressAudit(
      input.variables,
      input.trace,
      "Authenticated inbound webhook route",
    ),
    createdAt: input.receivedAt,
  };
}

function resultSucceeded(result: { status: string; reason?: string }): boolean {
  return (
    result.status === "succeeded" ||
    (result.status === "skipped" && result.reason === "already_succeeded")
  );
}

export async function handleInboundWebhook(
  request: Request,
  env: Env,
  config: RuntimeConfig,
  sourceSlug: string,
): Promise<{
  eventId: string;
  duplicate: boolean;
  status: ProcessingEvent["status"];
}> {
  if (request.method !== "POST") {
    throw new InboundWebhookError(
      405,
      "Method not allowed",
      "method_not_allowed",
    );
  }
  const found = await getInboundWebhookSourceSecret(env.DB, sourceSlug);
  const token = suppliedToken(request);
  const suppliedHash = await sha256Hex(token);
  if (
    !found ||
    !found.source.enabled ||
    token.length < TOKEN_PREFIX.length + 32 ||
    !constantTimeHexEqual(suppliedHash, found.tokenHash)
  ) {
    throw new InboundWebhookError(
      401,
      "Webhook source authentication failed",
      "unauthorized",
    );
  }
  const body = await readJsonBody(request);
  const idempotencyKey = inboundEventIdempotencyKey(request, body.digest);
  const prior = await existingEvent(env.DB, found.source.id, idempotencyKey);
  if (prior)
    return { eventId: prior.id, duplicate: true, status: prior.status };
  await takeRateLimit(found.source, env.DB);

  const variables = extractInboundWebhookVariables(
    body.payload,
    found.source.mappings,
  );
  const receivedAt = new Date().toISOString();
  const eventId = crypto.randomUUID();
  const incomingEventType = eventType(request);
  const trace: AuditTraceStep[] = [
    {
      stage: "webhook authentication",
      outcome: "success",
      detail: `Authenticated source ${found.source.name}`,
      at: receivedAt,
    },
    {
      stage: "JSON mapping",
      outcome: "success",
      detail: `Extracted ${String(Object.keys(variables).length)} bounded variable${Object.keys(variables).length === 1 ? "" : "s"}; raw payload not retained`,
      at: new Date().toISOString(),
    },
  ];

  try {
    if (found.source.action.type === "accept") {
      trace.push({
        stage: "route",
        outcome: "success",
        detail: "Accepted for audit without outbound delivery",
        at: new Date().toISOString(),
      });
      await recordEvent(
        env.DB,
        baseEvent({
          source: found.source,
          eventId,
          receivedAt,
          eventType: incomingEventType,
          payloadDigest: body.digest,
          idempotencyKey,
          variables,
          rawSize: body.bytes,
          trace,
          status: "forwarded",
          destination: "audit only",
        }),
      );
      return { eventId, duplicate: false, status: "forwarded" };
    }

    if (found.source.action.type === "send_webhook") {
      const action = found.source.action;
      const payload = await prepareWebhookDeliveryPayload(env.DB, {
        destinationId: action.destinationId,
        eventType: action.eventType,
        data: {
          variables,
          source: { id: found.source.id, name: found.source.name },
          incomingEventType,
        },
      });
      trace.push({
        stage: "route",
        outcome: "info",
        detail: "Signed outbound webhook durably queued",
        at: new Date().toISOString(),
      });
      const pending = baseEvent({
        source: found.source,
        eventId,
        receivedAt,
        eventType: incomingEventType,
        payloadDigest: body.digest,
        idempotencyKey,
        variables,
        rawSize: body.bytes,
        trace,
        status: "failed",
        error: "Webhook delivery is pending",
        destination: `webhook:${action.destinationId}`,
      });
      await recordEventWithPendingWebhookDelivery(env.DB, pending, {
        actionType: "send_webhook",
        payloadSnapshot: payload,
        ruleSnapshotId: `${found.source.id}:${found.source.updatedAt}`,
      });
      const result = await executeWebhookDelivery(env, config, {
        eventId,
        actionIndex: 0,
        destinationId: action.destinationId,
        eventType: action.eventType,
        data: {
          variables,
          source: { id: found.source.id, name: found.source.name },
          incomingEventType,
        },
        ruleSnapshotId: `${found.source.id}:${found.source.updatedAt}`,
      });
      const succeeded = resultSucceeded(result);
      trace.push({
        stage: "outbound webhook",
        outcome: succeeded ? "success" : "warning",
        detail: succeeded
          ? "Destination confirmed delivery"
          : "Delivery needs review or retry",
        at: new Date().toISOString(),
      });
      await updateEventProcessingOutcome(env.DB, eventId, {
        status: succeeded ? "forwarded" : "failed",
        ...(succeeded
          ? {}
          : { error: "Outbound webhook delivery needs review" }),
        audit: ingressAudit(
          variables,
          trace,
          "Authenticated inbound webhook relayed to a signed destination",
        ),
      });
      return {
        eventId,
        duplicate: false,
        status: succeeded ? "forwarded" : "failed",
      };
    }

    const rule = await getRule(env.DB, found.source.action.ruleId);
    if (
      !rule ||
      (rule.action.type !== "create_ticket" &&
        rule.action.type !== "create_alert")
    ) {
      throw new InboundWebhookError(
        503,
        "Configured Gorelo action template is unavailable",
        "action_unavailable",
      );
    }
    const action = rule.action as GoreloRuleAction;
    for (const field of action.fields) {
      if (field.source === "literal") variables[field.key] = field.value ?? "";
    }
    const prepared = await prepareGoreloActionFromVariables(
      env.DB,
      variables,
      action,
      {
        loadCatalog: (kind, options) =>
          getGoreloCatalog(env, config, kind, options),
      },
    );
    trace.push({
      stage: "Gorelo mapping",
      outcome: prepared.preflightError ? "error" : "success",
      detail: prepared.preflightError
        ? "Structured Gorelo mapping failed safely"
        : `Prepared Gorelo ${prepared.actionType === "create_ticket" ? "ticket" : "alert"}`,
      at: new Date().toISOString(),
    });
    const pending = baseEvent({
      source: found.source,
      eventId,
      receivedAt,
      eventType: incomingEventType,
      payloadDigest: body.digest,
      idempotencyKey,
      variables,
      rawSize: body.bytes,
      trace,
      status: "failed",
      error: "Structured Gorelo delivery is pending",
      matchedRule: { id: rule.id, name: rule.name },
      destination: `gorelo:${prepared.actionType}`,
    });
    await recordEventWithPendingStructuredDelivery(env.DB, pending, {
      actionType: prepared.actionType,
      payloadSnapshot: {
        schemaVersion: GORELO_DELIVERY_SCHEMA_VERSION,
        region: config.goreloRegion,
        request: prepared.request ?? null,
        data: prepared.data,
      },
      ruleSnapshotId: `${rule.id}:${rule.updatedAt}`,
    });
    const deliveryInput = {
      eventId,
      actionIndex: 0,
      actionType: prepared.actionType,
      data: prepared.data,
      ruleSnapshotId: `${rule.id}:${rule.updatedAt}`,
      ...(prepared.preflightError
        ? { preflightError: prepared.preflightError }
        : { request: prepared.request! }),
    } as ExecuteGoreloDeliveryInput;
    const result = await executeGoreloDelivery(env, config, deliveryInput);
    const succeeded = resultSucceeded(result);
    trace.push({
      stage: "Gorelo API",
      outcome: succeeded ? "success" : "warning",
      detail: succeeded
        ? "Gorelo confirmed creation"
        : "Gorelo delivery needs review",
      at: new Date().toISOString(),
    });
    await updateEventProcessingOutcome(env.DB, eventId, {
      status: succeeded ? "forwarded" : "failed",
      ...(succeeded ? {} : { error: "Gorelo delivery needs review" }),
      audit: ingressAudit(
        variables,
        trace,
        "Authenticated inbound webhook routed to Gorelo",
      ),
    });
    return {
      eventId,
      duplicate: false,
      status: succeeded ? "forwarded" : "failed",
    };
  } catch (error) {
    if (error instanceof InboundWebhookError) throw error;
    const duplicate = await existingEvent(
      env.DB,
      found.source.id,
      idempotencyKey,
    );
    if (duplicate)
      return {
        eventId: duplicate.id,
        duplicate: true,
        status: duplicate.status,
      };
    throw error;
  }
}
