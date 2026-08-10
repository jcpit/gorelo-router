import type {
  CreateDeliveryInput,
  CreateOrGetDeliveryResult,
  DeliveryAttempt,
  DeliveryAttemptOutcome,
  DeliveryActionType,
  DeliveryCompletionOptions,
  DeliveryFailureOptions,
  DeliveryJsonObject,
  DeliveryMutationResult,
  DeliveryState,
  DeliveryUncertainOptions,
  ListDeliveriesOptions,
  OutboundDelivery,
  OutboundDeliveryDetail,
  OutboundDeliverySummary,
} from "./delivery-types";
import { DELIVERY_ACTION_TYPES } from "./delivery-types";
import type { ProcessingStatus } from "./types";

export const MAX_DELIVERY_PAYLOAD_BYTES = 65_536;
export const MAX_DELIVERY_PAYLOAD_DEPTH = 20;
export const MAX_DELIVERY_ACTION_INDEX = 999;
export const MAX_DELIVERY_SNAPSHOT_ID_CHARACTERS = 320;
export const MAX_DELIVERY_PROVIDER_ID_CHARACTERS = 512;
export const MAX_DELIVERY_SAFE_ERROR_CHARACTERS = 2_000;

/** Keys which must never be persisted inside an outbound payload snapshot. */
export const DELIVERY_CREDENTIAL_FIELD_NAMES = Object.freeze([
  "authorization",
  "proxy-authorization",
  "api-key",
  "x-api-key",
  "apikey",
  "access-token",
  "refresh-token",
  "token",
  "password",
  "passwd",
  "secret",
  "client-secret",
  "private-key",
  "cookie",
  "set-cookie",
  "credential",
  "credentials",
] as const);

interface DeliverySummaryRow {
  id: string;
  event_id: string;
  action_index: number;
  action_type: OutboundDelivery["actionType"];
  state: DeliveryState;
  payload_digest: string;
  parser_snapshot_id: string | null;
  rule_snapshot_id: string | null;
  attempts: number;
  provider_id: string | null;
  safe_error: string | null;
  created_at: string;
  updated_at: string;
  next_attempt_at: string | null;
  attempt_started_at: string | null;
  version: number;
}

interface DeliveryRow extends DeliverySummaryRow {
  payload_json: string;
}

interface AttemptRow {
  id: string;
  delivery_id: string;
  attempt_number: number;
  outcome: DeliveryAttemptOutcome;
  http_status: number | null;
  safe_error: string | null;
  started_at: string;
  ended_at: string;
}

const SUMMARY_COLUMNS = `id, event_id, action_index, action_type, state,
       payload_digest, parser_snapshot_id, rule_snapshot_id, attempts,
       provider_id, safe_error, created_at, updated_at, next_attempt_at,
       attempt_started_at, version`;

const CREDENTIAL_KEYS = new Set(
  DELIVERY_CREDENTIAL_FIELD_NAMES.map(normalizeCredentialKey),
);
const CREDENTIAL_KEY_SUFFIXES = [
  "authorization",
  "apikey",
  "accesstoken",
  "refreshtoken",
  "authtoken",
  "password",
  "passwd",
  "secret",
  "privatekey",
  "cookie",
  "credential",
  "credentials",
] as const;

export class DeliveryIdentityConflictError extends Error {
  constructor(eventId: string, actionIndex: number) {
    super(
      `Outbound delivery ${eventId}/${String(actionIndex)} already exists with different immutable data`,
    );
    this.name = "DeliveryIdentityConflictError";
  }
}

function normalizeCredentialKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isCredentialKey(value: string): boolean {
  const normalized = normalizeCredentialKey(value);
  return (
    CREDENTIAL_KEYS.has(normalized) ||
    CREDENTIAL_KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}

function requiredIdentifier(
  value: string,
  label: string,
  maximum = MAX_DELIVERY_SNAPSHOT_ID_CHARACTERS,
): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  if (normalized.length > maximum) {
    throw new Error(`${label} must not exceed ${String(maximum)} characters`);
  }
  return normalized;
}

function optionalIdentifier(
  value: string | undefined,
  label: string,
): string | null {
  return value === undefined ? null : requiredIdentifier(value, label);
}

function timestamp(value: string | undefined, label: string): string {
  const candidate = value ?? new Date().toISOString();
  const milliseconds = Date.parse(candidate);
  if (!Number.isFinite(milliseconds)) throw new Error(`${label} is invalid`);
  return new Date(milliseconds).toISOString();
}

function requireVersion(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("expectedVersion must be a positive integer");
  }
}

function httpStatus(value: number | undefined): number | null {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value < 100 || value > 599) {
    throw new Error("httpStatus must be an integer between 100 and 599");
  }
  return value;
}

function providerId(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, MAX_DELIVERY_PROVIDER_ID_CHARACTERS);
}

/**
 * This is defence in depth, not a secret detector. Callers must pass only an
 * operationally safe error string and must never include request headers.
 */
export function cleanDeliverySafeError(value: string): string {
  const cleaned = value
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, "$1 [REDACTED]")
    .replace(
      /\b(api[-_ ]?key|authorization|access[-_ ]?token|refresh[-_ ]?token|password|secret)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1=[REDACTED]",
    )
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) throw new Error("safeError is required");
  return cleaned.slice(0, MAX_DELIVERY_SAFE_ERROR_CHARACTERS);
}

function canonicalJson(
  value: unknown,
  path: string,
  depth: number,
  ancestors: WeakSet<object>,
): string {
  if (depth > MAX_DELIVERY_PAYLOAD_DEPTH) {
    throw new Error(
      `payloadSnapshot exceeds the maximum depth of ${String(MAX_DELIVERY_PAYLOAD_DEPTH)}`,
    );
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} contains a non-finite number`);
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new Error(`${path} contains a value that JSON cannot represent`);
  }
  if (ancestors.has(value))
    throw new Error(`${path} contains a circular value`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${Array.from({ length: value.length }, (_, index) =>
        canonicalJson(
          value[index],
          `${path}[${String(index)}]`,
          depth + 1,
          ancestors,
        ),
      ).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path} contains a non-plain object`);
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => {
        if (isCredentialKey(key)) {
          throw new Error(
            `${path}.${key} may contain credentials and cannot be stored`,
          );
        }
        return `${JSON.stringify(key)}:${canonicalJson(
          record[key],
          `${path}.${key}`,
          depth + 1,
          ancestors,
        )}`;
      })
      .join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

/** Produces the canonical JSON representation used for the payload digest. */
export function canonicalizeDeliveryPayload(
  payloadSnapshot: Readonly<Record<string, unknown>>,
): string {
  const canonical = canonicalJson(
    payloadSnapshot,
    "payloadSnapshot",
    0,
    new WeakSet(),
  );
  const size = new TextEncoder().encode(canonical).byteLength;
  if (size > MAX_DELIVERY_PAYLOAD_BYTES) {
    throw new Error(
      `payloadSnapshot must not exceed ${String(MAX_DELIVERY_PAYLOAD_BYTES)} UTF-8 bytes`,
    );
  }
  return canonical;
}

async function digestCanonicalPayload(canonical: string): Promise<string> {
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Computes the stable SHA-256 digest used for idempotency checks. */
export async function digestDeliveryPayload(
  payloadSnapshot: Readonly<Record<string, unknown>>,
): Promise<string> {
  return digestCanonicalPayload(canonicalizeDeliveryPayload(payloadSnapshot));
}

function rowToSummary(row: DeliverySummaryRow): OutboundDeliverySummary {
  return {
    id: row.id,
    eventId: row.event_id,
    actionIndex: row.action_index,
    actionType: row.action_type,
    state: row.state,
    payloadDigest: row.payload_digest,
    ...(row.parser_snapshot_id
      ? { parserSnapshotId: row.parser_snapshot_id }
      : {}),
    ...(row.rule_snapshot_id ? { ruleSnapshotId: row.rule_snapshot_id } : {}),
    attemptCount: row.attempts,
    ...(row.provider_id ? { providerId: row.provider_id } : {}),
    ...(row.safe_error ? { safeError: row.safe_error } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.next_attempt_at ? { nextAttemptAt: row.next_attempt_at } : {}),
    ...(row.attempt_started_at
      ? { attemptStartedAt: row.attempt_started_at }
      : {}),
    version: row.version,
  };
}

function parsePayload(value: string): DeliveryJsonObject {
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Stored outbound delivery payload is invalid");
  }
  return parsed as DeliveryJsonObject;
}

function rowToDelivery(row: DeliveryRow): OutboundDelivery {
  return {
    ...rowToSummary(row),
    payloadSnapshot: parsePayload(row.payload_json),
  };
}

function rowToAttempt(row: AttemptRow): DeliveryAttempt {
  return {
    id: row.id,
    deliveryId: row.delivery_id,
    attemptNumber: row.attempt_number,
    outcome: row.outcome,
    ...(row.http_status === null ? {} : { httpStatus: row.http_status }),
    ...(row.safe_error ? { safeError: row.safe_error } : {}),
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

async function getStoredDelivery(
  db: D1Database,
  id: string,
): Promise<OutboundDelivery | null> {
  const row = await db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}, payload_json
         FROM outbound_deliveries
        WHERE id = ?`,
    )
    .bind(id)
    .first<DeliveryRow>();
  return row ? rowToDelivery(row) : null;
}

async function getStoredDeliveryByEventAction(
  db: D1Database,
  eventId: string,
  actionIndex: number,
): Promise<OutboundDelivery | null> {
  const row = await db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}, payload_json
         FROM outbound_deliveries
        WHERE event_id = ? AND action_index = ?`,
    )
    .bind(eventId, actionIndex)
    .first<DeliveryRow>();
  return row ? rowToDelivery(row) : null;
}

export async function listDeliveryAttempts(
  db: D1Database,
  deliveryId: string,
): Promise<DeliveryAttempt[]> {
  const result = await db
    .prepare(
      `SELECT id, delivery_id, attempt_number, outcome, http_status,
              safe_error, started_at, ended_at
         FROM delivery_attempts
        WHERE delivery_id = ?
        ORDER BY attempt_number ASC`,
    )
    .bind(deliveryId)
    .all<AttemptRow>();
  return result.results.map(rowToAttempt);
}

export async function getDelivery(
  db: D1Database,
  id: string,
): Promise<OutboundDeliveryDetail | null> {
  const delivery = await getStoredDelivery(db, id);
  if (!delivery) return null;
  return {
    ...delivery,
    attemptHistory: await listDeliveryAttempts(db, delivery.id),
  };
}

export async function getDeliveryByEventAction(
  db: D1Database,
  eventId: string,
  actionIndex: number,
): Promise<OutboundDeliveryDetail | null> {
  const delivery = await getStoredDeliveryByEventAction(
    db,
    requiredIdentifier(eventId, "eventId"),
    actionIndex,
  );
  if (!delivery) return null;
  return {
    ...delivery,
    attemptHistory: await listDeliveryAttempts(db, delivery.id),
  };
}

export async function listDeliveries(
  db: D1Database,
  options: ListDeliveriesOptions = {},
): Promise<OutboundDeliverySummary[]> {
  const clauses: string[] = [];
  const bindings: (string | number)[] = [];
  if (options.eventId !== undefined) {
    clauses.push("event_id = ?");
    bindings.push(requiredIdentifier(options.eventId, "eventId"));
  }
  if (options.state !== undefined) {
    clauses.push("state = ?");
    bindings.push(options.state);
  }
  const limit = Math.max(1, Math.min(100, options.limit ?? 50));
  bindings.push(limit);
  const result = await db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}
         FROM outbound_deliveries
         ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
    )
    .bind(...bindings)
    .all<DeliverySummaryRow>();
  return result.results.map(rowToSummary);
}

export async function listClaimableDeliveries(
  db: D1Database,
  now?: string,
  limit = 50,
  maxAttempts = Number.MAX_SAFE_INTEGER,
  actionTypes?: readonly DeliveryActionType[],
  requiredEventStatus?: ProcessingStatus,
): Promise<OutboundDeliverySummary[]> {
  const readyAt = timestamp(now, "now");
  const boundedLimit = Math.max(1, Math.min(100, limit));
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("maxAttempts must be a positive safe integer");
  }
  const allowedActionTypes = new Set<DeliveryActionType>(DELIVERY_ACTION_TYPES);
  const filteredActionTypes = actionTypes
    ? [...new Set(actionTypes)]
    : undefined;
  if (
    filteredActionTypes &&
    (filteredActionTypes.length === 0 ||
      filteredActionTypes.some((type) => !allowedActionTypes.has(type)))
  ) {
    throw new Error("actionTypes must contain supported delivery action types");
  }
  const actionClause = filteredActionTypes
    ? `AND action_type IN (${filteredActionTypes.map(() => "?").join(", ")})`
    : "";
  const eventStatusClause = requiredEventStatus
    ? `AND EXISTS (
               SELECT 1
                 FROM processing_events p
                WHERE p.id = outbound_deliveries.event_id
                  AND p.status = ?
             )`
    : "";
  const result = await db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}
         FROM outbound_deliveries
        WHERE attempts < ?
          ${actionClause}
          ${eventStatusClause}
          AND (
            state = 'pending'
            OR (
              state = 'failed'
              AND next_attempt_at IS NOT NULL
              AND next_attempt_at <= ?
            )
          )
        ORDER BY COALESCE(next_attempt_at, created_at) ASC, created_at ASC, id ASC
        LIMIT ?`,
    )
    .bind(
      maxAttempts,
      ...(filteredActionTypes ?? []),
      ...(requiredEventStatus ? [requiredEventStatus] : []),
      readyAt,
      boundedLimit,
    )
    .all<DeliverySummaryRow>();
  return result.results.map(rowToSummary);
}

/** Finds abandoned claims for reconciliation; callers must never resend them. */
export async function listStaleDeliveringDeliveries(
  db: D1Database,
  staleBefore: string,
  actionType: DeliveryActionType,
  limit = 100,
): Promise<OutboundDeliverySummary[]> {
  const cutoff = timestamp(staleBefore, "staleBefore");
  const boundedLimit = Math.max(1, Math.min(100, limit));
  const result = await db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}
         FROM outbound_deliveries
        WHERE action_type = ?
          AND state = 'delivering'
          AND attempt_started_at IS NOT NULL
          AND attempt_started_at <= ?
        ORDER BY attempt_started_at ASC, created_at ASC, id ASC
        LIMIT ?`,
    )
    .bind(actionType, cutoff, boundedLimit)
    .all<DeliverySummaryRow>();
  return result.results.map(rowToSummary);
}

export async function createOrGetDelivery(
  db: D1Database,
  input: CreateDeliveryInput,
): Promise<CreateOrGetDeliveryResult> {
  const eventId = requiredIdentifier(input.eventId, "eventId");
  if (
    !Number.isInteger(input.actionIndex) ||
    input.actionIndex < 0 ||
    input.actionIndex > MAX_DELIVERY_ACTION_INDEX
  ) {
    throw new Error(
      `actionIndex must be an integer between 0 and ${String(MAX_DELIVERY_ACTION_INDEX)}`,
    );
  }
  const parserSnapshotId = optionalIdentifier(
    input.parserSnapshotId,
    "parserSnapshotId",
  );
  const ruleSnapshotId = optionalIdentifier(
    input.ruleSnapshotId,
    "ruleSnapshotId",
  );
  const payloadJson = canonicalizeDeliveryPayload(input.payloadSnapshot);
  const payloadDigest = await digestCanonicalPayload(payloadJson);
  const createdAt = timestamp(input.createdAt, "createdAt");
  const id = crypto.randomUUID();
  const result = await db
    .prepare(
      `INSERT INTO outbound_deliveries
         (id, event_id, action_index, action_type, state, payload_json,
          payload_digest, parser_snapshot_id, rule_snapshot_id, attempts,
          created_at, updated_at, version)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, 0, ?, ?, 1)
       ON CONFLICT(event_id, action_index) DO NOTHING`,
    )
    .bind(
      id,
      eventId,
      input.actionIndex,
      input.actionType,
      payloadJson,
      payloadDigest,
      parserSnapshotId,
      ruleSnapshotId,
      createdAt,
      createdAt,
    )
    .run();
  const delivery = await getStoredDeliveryByEventAction(
    db,
    eventId,
    input.actionIndex,
  );
  if (!delivery) throw new Error("Outbound delivery could not be persisted");
  if (
    delivery.actionType !== input.actionType ||
    delivery.payloadDigest !== payloadDigest ||
    (delivery.parserSnapshotId ?? null) !== parserSnapshotId ||
    (delivery.ruleSnapshotId ?? null) !== ruleSnapshotId
  ) {
    throw new DeliveryIdentityConflictError(eventId, input.actionIndex);
  }
  return {
    status: result.meta.changes === 1 ? "created" : "existing",
    delivery,
  };
}

async function mutationFailure(
  db: D1Database,
  id: string,
): Promise<DeliveryMutationResult> {
  return (await getStoredDelivery(db, id))
    ? { status: "conflict" }
    : { status: "not_found" };
}

export async function claimDelivery(
  db: D1Database,
  id: string,
  expectedVersion: number,
  claimedAt?: string,
): Promise<DeliveryMutationResult> {
  requireVersion(expectedVersion);
  const deliveryId = requiredIdentifier(id, "deliveryId");
  const now = timestamp(claimedAt, "claimedAt");
  const result = await db
    .prepare(
      `UPDATE outbound_deliveries
          SET state = 'delivering', attempts = attempts + 1,
              provider_id = NULL, safe_error = NULL, next_attempt_at = NULL,
              attempt_started_at = ?, updated_at = ?, version = version + 1
        WHERE id = ? AND version = ?
          AND state IN ('pending', 'failed')
          AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
    )
    .bind(now, now, deliveryId, expectedVersion, now)
    .run();
  if (result.meta.changes === 1) {
    const delivery = await getStoredDelivery(db, deliveryId);
    return delivery ? { status: "updated", delivery } : { status: "not_found" };
  }
  const existing = await getStoredDelivery(db, deliveryId);
  if (!existing) return { status: "not_found" };
  if (
    existing.version === expectedVersion &&
    (existing.state === "pending" || existing.state === "failed") &&
    existing.nextAttemptAt !== undefined &&
    existing.nextAttemptAt > now
  ) {
    return { status: "not_due" };
  }
  return { status: "conflict" };
}

async function completeDelivery(
  db: D1Database,
  id: string,
  outcome: DeliveryAttemptOutcome,
  options: DeliveryCompletionOptions,
  safeError: string | null,
  nextAttemptAt: string | null,
): Promise<DeliveryMutationResult> {
  requireVersion(options.expectedVersion);
  const deliveryId = requiredIdentifier(id, "deliveryId");
  const completedAt = timestamp(options.completedAt, "completedAt");
  const normalizedProviderId = providerId(options.providerId);
  const normalizedHttpStatus = httpStatus(options.httpStatus);
  const update = db
    .prepare(
      `UPDATE outbound_deliveries
          SET state = ?, provider_id = ?, safe_error = ?, next_attempt_at = ?,
              updated_at = ?, version = version + 1
        WHERE id = ? AND version = ? AND state = 'delivering'
          AND attempt_started_at IS NOT NULL AND attempt_started_at <= ?`,
    )
    .bind(
      outcome,
      normalizedProviderId,
      safeError,
      nextAttemptAt,
      completedAt,
      deliveryId,
      options.expectedVersion,
      completedAt,
    );
  const attempt = db
    .prepare(
      `INSERT INTO delivery_attempts
         (id, delivery_id, attempt_number, outcome, http_status, safe_error,
          started_at, ended_at)
       SELECT ?, id, attempts, ?, ?, ?, attempt_started_at, ?
         FROM outbound_deliveries
        WHERE id = ? AND state = ? AND version = ? AND changes() = 1`,
    )
    .bind(
      crypto.randomUUID(),
      outcome,
      normalizedHttpStatus,
      safeError,
      completedAt,
      deliveryId,
      outcome,
      options.expectedVersion + 1,
    );
  const [updateResult] = await db.batch([update, attempt]);
  if (!updateResult || updateResult.meta.changes !== 1) {
    return mutationFailure(db, deliveryId);
  }
  const delivery = await getStoredDelivery(db, deliveryId);
  return delivery ? { status: "updated", delivery } : { status: "not_found" };
}

export async function markDeliverySucceeded(
  db: D1Database,
  id: string,
  options: DeliveryCompletionOptions,
): Promise<DeliveryMutationResult> {
  return completeDelivery(db, id, "succeeded", options, null, null);
}

export async function markDeliveryFailed(
  db: D1Database,
  id: string,
  options: DeliveryFailureOptions,
): Promise<DeliveryMutationResult> {
  const safeError = cleanDeliverySafeError(options.safeError);
  const nextAttemptAt =
    options.nextAttemptAt === undefined
      ? null
      : timestamp(options.nextAttemptAt, "nextAttemptAt");
  return completeDelivery(db, id, "failed", options, safeError, nextAttemptAt);
}

export async function markDeliveryUncertain(
  db: D1Database,
  id: string,
  options: DeliveryUncertainOptions,
): Promise<DeliveryMutationResult> {
  return completeDelivery(
    db,
    id,
    "uncertain",
    options,
    cleanDeliverySafeError(options.safeError),
    null,
  );
}
