export const MAX_ACTIVE_PARSER_CAPTURES = 10;
export const MAX_PARSER_CAPTURE_WAIT_MS = 60 * 60 * 1_000;
export const MAX_PARSER_CAPTURE_SAMPLE_RETENTION_MS = 60 * 60 * 1_000;
export const PARSER_CAPTURE_SAMPLE_RETENTION_MS = 55 * 60 * 1_000;
export const MAX_PARSER_CAPTURE_SAMPLE_BYTES = 256 * 1_024;
export const MAX_PARSER_CAPTURE_SUBJECT_CHARACTERS = 200;

export const PARSER_CAPTURE_STATES = [
  "pending",
  "claimed",
  "captured",
  "cancelled",
  "expired",
  "failed",
] as const;

export type ParserCaptureState = (typeof PARSER_CAPTURE_STATES)[number];
export type ParserCaptureSenderMode = "any" | "address" | "domain";

export interface ParserCaptureMatch {
  recipient: string;
  senderMode: ParserCaptureSenderMode;
  senderValue?: string | undefined;
  subjectContains?: string | undefined;
}

/** Safe for the authenticated admin API. R2 keys and digests are omitted. */
export interface ParserCapture {
  id: string;
  sourceEventId?: string;
  state: ParserCaptureState;
  match: ParserCaptureMatch;
  requestedBy: string;
  waitExpiresAt: string;
  claimedAt?: string;
  capturedEventId?: string;
  capturedAt?: string;
  sampleAvailable: boolean;
  sampleExpiresAt?: string;
  safeErrorCode?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ParserCaptureStorage {
  captureId: string;
  capturedEventId: string;
  objectKey: string;
  sha256: string;
  size: number;
  expiresAt: string;
  version: number;
}

export interface CreateParserCaptureInput {
  sourceEventId?: string | undefined;
  match: ParserCaptureMatch;
  requestedBy: string;
  waitExpiresAt: string;
  createdAt?: string | undefined;
}

export interface UpdatePendingParserCaptureInput {
  expectedVersion: number;
  match: ParserCaptureMatch;
  waitExpiresAt: string;
  updatedAt?: string | undefined;
}

export interface ParserCaptureMessageFacts {
  eventId: string;
  envelopeFrom: string;
  envelopeTo: string;
  subject: string;
}

export interface FinalizeParserCaptureInput {
  expectedVersion: number;
  claimEventId: string;
  capturedEventId: string;
  objectKey: string;
  sha256: string;
  size: number;
  sampleExpiresAt: string;
  capturedAt?: string | undefined;
}

export interface FailParserCaptureInput {
  expectedVersion: number;
  claimEventId: string;
  safeErrorCode: string;
  failedAt?: string | undefined;
}

export type ParserCaptureMutationResult =
  | { status: "updated"; capture: ParserCapture }
  | { status: "not_found" | "conflict" | "not_due" };

export type ParserCaptureClaimResult =
  { status: "claimed"; capture: ParserCapture } | { status: "none" };

export class ParserCaptureLimitError extends Error {
  override readonly name = "ParserCaptureLimitError";

  constructor() {
    super(
      `No more than ${String(MAX_ACTIVE_PARSER_CAPTURES)} parser captures may be active`,
    );
  }
}

export class ActiveParserCaptureError extends Error {
  override readonly name = "ActiveParserCaptureError";

  constructor(readonly recipient: string) {
    super(`A parser capture is already active for ${recipient}`);
  }
}

interface ParserCaptureRow {
  id: string;
  source_event_id: string | null;
  state: ParserCaptureState;
  match_recipient: string;
  match_sender_mode: ParserCaptureSenderMode;
  match_sender_value: string | null;
  match_subject_contains: string | null;
  requested_by: string;
  wait_expires_at: string;
  claim_event_id: string | null;
  claimed_at: string | null;
  captured_event_id: string | null;
  captured_at: string | null;
  sample_object_key: string | null;
  sample_sha256: string | null;
  sample_size: number | null;
  sample_expires_at: string | null;
  safe_error_code: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

const CAPTURE_COLUMNS = `id, source_event_id, state, match_recipient,
       match_sender_mode, match_sender_value, match_subject_contains,
       requested_by, wait_expires_at, claim_event_id, claimed_at,
       captured_event_id, captured_at, sample_object_key, sample_sha256,
       sample_size, sample_expires_at, safe_error_code, version,
       created_at, updated_at`;

const LOCAL_PART_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i;
const DOMAIN_LABEL_PATTERN = /^[A-Z0-9-]+$/i;
const SAFE_ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{0,79}$/;
const SAFE_EVENT_ID_PATTERN = /^[a-z0-9:_-]{1,320}$/i;
const SAMPLE_OBJECT_KEY_PATTERN =
  /^parser-samples\/[A-Za-z0-9][A-Za-z0-9/_-]*\.json$/;

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

function requiredText(value: string, label: string, maximum: number): string {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized) throw new Error(`${label} is required`);
  if (normalized.length > maximum) {
    throw new Error(`${label} must not exceed ${String(maximum)} characters`);
  }
  if (/\p{Cc}/u.test(normalized)) {
    throw new Error(`${label} must not contain control characters`);
  }
  return normalized;
}

function eventId(value: string, label = "eventId"): string {
  const normalized = value.trim();
  if (!SAFE_EVENT_ID_PATTERN.test(normalized)) {
    throw new Error(`${label} is invalid`);
  }
  return normalized;
}

function optionalEventId(
  value: string | undefined,
  label: string,
): string | null {
  return value === undefined ? null : eventId(value, label);
}

function isValidDomain(value: string): boolean {
  if (value.length > 253) return false;
  const labels = value.split(".");
  return (
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        DOMAIN_LABEL_PATTERN.test(label) &&
        !label.startsWith("-") &&
        !label.endsWith("-"),
    )
  );
}

function normalizedEmail(value: string, label: string): string {
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  if (normalized.length > 254) throw new Error(`${label} is invalid`);
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || normalized.indexOf("@") !== at) {
    throw new Error(`${label} is invalid`);
  }
  const localPart = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (
    localPart.length > 64 ||
    !LOCAL_PART_PATTERN.test(localPart) ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    !isValidDomain(domain)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return normalized;
}

function normalizedDomain(value: string, label: string): string {
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  if (!isValidDomain(normalized)) throw new Error(`${label} is invalid`);
  return normalized;
}

function normalizedMatch(input: ParserCaptureMatch): {
  recipient: string;
  senderMode: ParserCaptureSenderMode;
  senderValue: string | null;
  subjectContains: string | null;
} {
  const recipient = normalizedEmail(input.recipient, "match.recipient");
  if (!(["any", "address", "domain"] as const).includes(input.senderMode)) {
    throw new Error("match.senderMode is invalid");
  }
  let senderValue: string | null = null;
  if (input.senderMode === "any") {
    if (input.senderValue?.trim()) {
      throw new Error("match.senderValue is not allowed for any sender");
    }
  } else {
    if (!input.senderValue) {
      throw new Error("match.senderValue is required");
    }
    senderValue =
      input.senderMode === "address"
        ? normalizedEmail(input.senderValue, "match.senderValue")
        : normalizedDomain(input.senderValue, "match.senderValue");
  }
  const subjectContains = input.subjectContains?.trim()
    ? requiredText(
        input.subjectContains,
        "match.subjectContains",
        MAX_PARSER_CAPTURE_SUBJECT_CHARACTERS,
      )
    : null;
  return {
    recipient,
    senderMode: input.senderMode,
    senderValue,
    subjectContains,
  };
}

function boundedWaitExpiry(waitExpiresAt: string, referenceAt: string): string {
  const expiry = timestamp(waitExpiresAt, "waitExpiresAt");
  const duration = Date.parse(expiry) - Date.parse(referenceAt);
  if (duration <= 0 || duration > MAX_PARSER_CAPTURE_WAIT_MS) {
    throw new Error(
      "waitExpiresAt must be after the request time and within one hour",
    );
  }
  return expiry;
}

function rowToCapture(
  row: ParserCaptureRow,
  sampleAvailableAt?: string,
): ParserCapture {
  const sampleUnexpired =
    sampleAvailableAt === undefined ||
    (row.sample_expires_at !== null &&
      Date.parse(row.sample_expires_at) > Date.parse(sampleAvailableAt));
  return {
    id: row.id,
    ...(row.source_event_id ? { sourceEventId: row.source_event_id } : {}),
    state: row.state,
    match: {
      recipient: row.match_recipient,
      senderMode: row.match_sender_mode,
      ...(row.match_sender_value
        ? { senderValue: row.match_sender_value }
        : {}),
      ...(row.match_subject_contains
        ? { subjectContains: row.match_subject_contains }
        : {}),
    },
    requestedBy: row.requested_by,
    waitExpiresAt: row.wait_expires_at,
    ...(row.claimed_at ? { claimedAt: row.claimed_at } : {}),
    ...(row.captured_event_id
      ? { capturedEventId: row.captured_event_id }
      : {}),
    ...(row.captured_at ? { capturedAt: row.captured_at } : {}),
    sampleAvailable:
      row.state === "captured" &&
      row.sample_object_key !== null &&
      sampleUnexpired,
    ...(row.sample_expires_at
      ? { sampleExpiresAt: row.sample_expires_at }
      : {}),
    ...(row.safe_error_code ? { safeErrorCode: row.safe_error_code } : {}),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getCaptureRow(
  db: D1Database,
  id: string,
): Promise<ParserCaptureRow | null> {
  return db
    .prepare(
      `SELECT ${CAPTURE_COLUMNS}
         FROM parser_captures
        WHERE id = ?
        LIMIT 1`,
    )
    .bind(id)
    .first<ParserCaptureRow>();
}

async function mutationFailure(
  db: D1Database,
  id: string,
): Promise<ParserCaptureMutationResult> {
  return (await getCaptureRow(db, id))
    ? { status: "conflict" }
    : { status: "not_found" };
}

export async function getParserCapture(
  db: D1Database,
  id: string,
  sampleAvailableAt?: string,
): Promise<ParserCapture | null> {
  const row = await getCaptureRow(db, id);
  return row ? rowToCapture(row, sampleAvailableAt) : null;
}

export async function listParserCaptures(
  db: D1Database,
  options: {
    state?: ParserCaptureState;
    sourceEventId?: string;
    limit?: number;
    sampleAvailableAt?: string;
  } = {},
): Promise<ParserCapture[]> {
  if (
    options.state !== undefined &&
    !PARSER_CAPTURE_STATES.includes(options.state)
  ) {
    throw new Error("state is invalid");
  }
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  if (!Number.isInteger(limit)) throw new Error("limit must be an integer");
  const clauses: string[] = [];
  const bindings: (number | string)[] = [];
  if (options.state) {
    clauses.push("state = ?");
    bindings.push(options.state);
  }
  if (options.sourceEventId) {
    clauses.push("source_event_id = ?");
    bindings.push(eventId(options.sourceEventId, "sourceEventId"));
  }
  const result = await db
    .prepare(
      `SELECT ${CAPTURE_COLUMNS}
         FROM parser_captures
        ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
    )
    .bind(...bindings, limit)
    .all<ParserCaptureRow>();
  return result.results.map((row) =>
    rowToCapture(row, options.sampleAvailableAt),
  );
}

export async function createParserCapture(
  db: D1Database,
  input: CreateParserCaptureInput,
): Promise<ParserCapture> {
  const match = normalizedMatch(input.match);
  const createdAt = timestamp(input.createdAt, "createdAt");
  const waitExpiresAt = boundedWaitExpiry(input.waitExpiresAt, createdAt);
  const requestedBy = requiredText(input.requestedBy, "requestedBy", 320);
  const sourceEventId = optionalEventId(input.sourceEventId, "sourceEventId");
  await expirePendingParserCaptures(db, createdAt);
  const id = crypto.randomUUID();
  const result = await db
    .prepare(
      `INSERT INTO parser_captures
         (id, source_event_id, state, match_recipient, match_sender_mode,
          match_sender_value, match_subject_contains, requested_by,
          wait_expires_at, version, created_at, updated_at)
       SELECT ?, ?, 'pending', ?, ?, ?, ?, ?, ?, 1, ?, ?
        WHERE (SELECT COUNT(*) FROM parser_captures
                WHERE state IN ('pending', 'claimed')) < ?
       ON CONFLICT DO NOTHING`,
    )
    .bind(
      id,
      sourceEventId,
      match.recipient,
      match.senderMode,
      match.senderValue,
      match.subjectContains,
      requestedBy,
      waitExpiresAt,
      createdAt,
      createdAt,
      MAX_ACTIVE_PARSER_CAPTURES,
    )
    .run();
  if (result.meta.changes !== 1) {
    const active = await db
      .prepare(
        `SELECT id FROM parser_captures
          WHERE match_recipient = ? AND state IN ('pending', 'claimed')
          LIMIT 1`,
      )
      .bind(match.recipient)
      .first<{ id: string }>();
    if (active) throw new ActiveParserCaptureError(match.recipient);
    throw new ParserCaptureLimitError();
  }
  const capture = await getParserCapture(db, id);
  if (!capture) throw new Error("Parser capture could not be persisted");
  return capture;
}

export async function updatePendingParserCapture(
  db: D1Database,
  id: string,
  input: UpdatePendingParserCaptureInput,
): Promise<ParserCaptureMutationResult> {
  requireVersion(input.expectedVersion);
  const captureId = eventId(id, "captureId");
  const match = normalizedMatch(input.match);
  const updatedAt = timestamp(input.updatedAt, "updatedAt");
  const waitExpiresAt = boundedWaitExpiry(input.waitExpiresAt, updatedAt);
  let result: D1Result;
  try {
    result = await db
      .prepare(
        `UPDATE parser_captures
            SET match_recipient = ?, match_sender_mode = ?,
                match_sender_value = ?, match_subject_contains = ?,
                wait_expires_at = ?, updated_at = ?, version = version + 1
          WHERE id = ? AND version = ? AND state = 'pending'
            AND wait_expires_at > ?`,
      )
      .bind(
        match.recipient,
        match.senderMode,
        match.senderValue,
        match.subjectContains,
        waitExpiresAt,
        updatedAt,
        captureId,
        input.expectedVersion,
        updatedAt,
      )
      .run();
  } catch (error) {
    const active = await db
      .prepare(
        `SELECT id FROM parser_captures
          WHERE match_recipient = ? AND state IN ('pending', 'claimed')
            AND id <> ?
          LIMIT 1`,
      )
      .bind(match.recipient, captureId)
      .first<{ id: string }>();
    if (active) throw new ActiveParserCaptureError(match.recipient);
    throw error;
  }
  if (result.meta.changes !== 1) return mutationFailure(db, captureId);
  const capture = await getParserCapture(db, captureId);
  return capture ? { status: "updated", capture } : { status: "not_found" };
}

export async function cancelParserCapture(
  db: D1Database,
  id: string,
  expectedVersion: number,
  cancelledAt?: string,
): Promise<ParserCaptureMutationResult> {
  requireVersion(expectedVersion);
  const captureId = eventId(id, "captureId");
  const now = timestamp(cancelledAt, "cancelledAt");
  const result = await db
    .prepare(
      `UPDATE parser_captures
          SET state = 'cancelled', updated_at = ?, version = version + 1
        WHERE id = ? AND version = ? AND state = 'pending'`,
    )
    .bind(now, captureId, expectedVersion)
    .run();
  if (result.meta.changes !== 1) return mutationFailure(db, captureId);
  const capture = await getParserCapture(db, captureId);
  return capture ? { status: "updated", capture } : { status: "not_found" };
}

function senderDomain(address: string): string | null {
  try {
    const normalized = normalizedEmail(address, "envelopeFrom");
    return normalized.slice(normalized.lastIndexOf("@") + 1);
  } catch {
    return null;
  }
}

function matchesMessage(
  capture: ParserCaptureRow,
  facts: ParserCaptureMessageFacts,
): boolean {
  let senderMatches = capture.match_sender_mode === "any";
  if (capture.match_sender_mode === "address") {
    try {
      senderMatches =
        normalizedEmail(facts.envelopeFrom, "envelopeFrom") ===
        capture.match_sender_value;
    } catch {
      senderMatches = false;
    }
  } else if (capture.match_sender_mode === "domain") {
    senderMatches =
      senderDomain(facts.envelopeFrom) === capture.match_sender_value;
  }
  if (!senderMatches) return false;
  if (!capture.match_subject_contains) return true;
  return facts.subject
    .normalize("NFKC")
    .toLowerCase()
    .includes(capture.match_subject_contains.toLowerCase());
}

export async function claimMatchingParserCapture(
  db: D1Database,
  facts: ParserCaptureMessageFacts,
  claimedAt?: string,
): Promise<ParserCaptureClaimResult> {
  const now = timestamp(claimedAt, "claimedAt");
  const recipient = normalizedEmail(facts.envelopeTo, "envelopeTo");
  const incomingEventId = eventId(facts.eventId);
  const candidate = await db
    .prepare(
      `SELECT ${CAPTURE_COLUMNS}
         FROM parser_captures
        WHERE state = 'pending' AND match_recipient = ?
          AND wait_expires_at > ?
        ORDER BY created_at ASC, id ASC
        LIMIT 1`,
    )
    .bind(recipient, now)
    .first<ParserCaptureRow>();
  if (!candidate || !matchesMessage(candidate, facts)) {
    return { status: "none" };
  }
  const result = await db
    .prepare(
      `UPDATE parser_captures
          SET state = 'claimed', claim_event_id = ?, claimed_at = ?,
              updated_at = ?, version = version + 1
        WHERE id = ? AND version = ? AND state = 'pending'
          AND wait_expires_at > ?`,
    )
    .bind(incomingEventId, now, now, candidate.id, candidate.version, now)
    .run();
  if (result.meta.changes !== 1) return { status: "none" };
  const capture = await getParserCapture(db, candidate.id);
  return capture ? { status: "claimed", capture } : { status: "none" };
}

function sampleObjectKey(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length > 1_024 ||
    normalized.includes("..") ||
    normalized.includes("//") ||
    !SAMPLE_OBJECT_KEY_PATTERN.test(normalized)
  ) {
    throw new Error("objectKey must be an opaque parser-samples JSON key");
  }
  return normalized;
}

function sha256(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error("sha256 must be a lowercase hexadecimal digest");
  }
  return normalized;
}

function sampleSize(value: number): number {
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_PARSER_CAPTURE_SAMPLE_BYTES
  ) {
    throw new Error(
      `size must be between 1 and ${String(MAX_PARSER_CAPTURE_SAMPLE_BYTES)} bytes`,
    );
  }
  return value;
}

function normalizedFinalizeInput(
  input: FinalizeParserCaptureInput,
): Required<FinalizeParserCaptureInput> {
  requireVersion(input.expectedVersion);
  const claimEventId = eventId(input.claimEventId, "claimEventId");
  const capturedEventId = eventId(input.capturedEventId, "capturedEventId");
  if (claimEventId !== capturedEventId) {
    throw new Error("capturedEventId must match the claimed inbound event");
  }
  const capturedAt = timestamp(input.capturedAt, "capturedAt");
  const sampleExpiresAt = timestamp(input.sampleExpiresAt, "sampleExpiresAt");
  const retention = Date.parse(sampleExpiresAt) - Date.parse(capturedAt);
  if (retention <= 0 || retention > MAX_PARSER_CAPTURE_SAMPLE_RETENTION_MS) {
    throw new Error(
      "sampleExpiresAt must be after capture and within one hour",
    );
  }
  return {
    expectedVersion: input.expectedVersion,
    claimEventId,
    capturedEventId,
    objectKey: sampleObjectKey(input.objectKey),
    sha256: sha256(input.sha256),
    size: sampleSize(input.size),
    sampleExpiresAt,
    capturedAt,
  };
}

/**
 * Builds the capture-finalization statement so callers can append it after the
 * processing-event insert in the same D1 batch transaction.
 */
export function parserCaptureFinalizeStatement(
  db: D1Database,
  id: string,
  input: FinalizeParserCaptureInput,
): D1PreparedStatement {
  const captureId = eventId(id, "captureId");
  const normalized = normalizedFinalizeInput(input);
  return db
    .prepare(
      `UPDATE parser_captures
          SET state = 'captured', claim_event_id = NULL, claimed_at = NULL,
              captured_event_id = ?, captured_at = ?, sample_object_key = ?,
              sample_sha256 = ?, sample_size = ?, sample_expires_at = ?,
              safe_error_code = NULL, updated_at = ?, version = version + 1
        WHERE id = ? AND version = ? AND state = 'claimed'
          AND claim_event_id = ?`,
    )
    .bind(
      normalized.capturedEventId,
      normalized.capturedAt,
      normalized.objectKey,
      normalized.sha256,
      normalized.size,
      normalized.sampleExpiresAt,
      normalized.capturedAt,
      captureId,
      normalized.expectedVersion,
      normalized.claimEventId,
    );
}

export async function finalizeParserCapture(
  db: D1Database,
  id: string,
  input: FinalizeParserCaptureInput,
): Promise<ParserCaptureMutationResult> {
  const captureId = eventId(id, "captureId");
  const result = await parserCaptureFinalizeStatement(
    db,
    captureId,
    input,
  ).run();
  if (result.meta.changes !== 1) return mutationFailure(db, captureId);
  const capture = await getParserCapture(db, captureId);
  return capture ? { status: "updated", capture } : { status: "not_found" };
}

export async function failParserCapture(
  db: D1Database,
  id: string,
  input: FailParserCaptureInput,
): Promise<ParserCaptureMutationResult> {
  requireVersion(input.expectedVersion);
  const captureId = eventId(id, "captureId");
  const claimEventId = eventId(input.claimEventId, "claimEventId");
  if (!SAFE_ERROR_CODE_PATTERN.test(input.safeErrorCode)) {
    throw new Error("safeErrorCode must be a credential-free machine code");
  }
  const failedAt = timestamp(input.failedAt, "failedAt");
  const result = await db
    .prepare(
      `UPDATE parser_captures
          SET state = 'failed', claim_event_id = NULL, claimed_at = NULL,
              safe_error_code = ?, updated_at = ?, version = version + 1
        WHERE id = ? AND version = ? AND state = 'claimed'
          AND claim_event_id = ?`,
    )
    .bind(
      input.safeErrorCode,
      failedAt,
      captureId,
      input.expectedVersion,
      claimEventId,
    )
    .run();
  if (result.meta.changes !== 1) return mutationFailure(db, captureId);
  const capture = await getParserCapture(db, captureId);
  return capture ? { status: "updated", capture } : { status: "not_found" };
}

export async function recoverStaleParserCaptureClaims(
  db: D1Database,
  options: { staleBefore: string; recoveredAt?: string },
): Promise<{ recovered: number; expired: number }> {
  const now = timestamp(options.recoveredAt, "recoveredAt");
  const staleBefore = timestamp(options.staleBefore, "staleBefore");
  if (staleBefore > now) {
    throw new Error("staleBefore must not be after recoveredAt");
  }
  const [recovered, expired] = await db.batch([
    db
      .prepare(
        `UPDATE parser_captures
            SET state = 'pending', claim_event_id = NULL, claimed_at = NULL,
                updated_at = ?, version = version + 1
          WHERE state = 'claimed' AND claimed_at <= ?
            AND wait_expires_at > ?`,
      )
      .bind(now, staleBefore, now),
    db
      .prepare(
        `UPDATE parser_captures
            SET state = 'expired', claim_event_id = NULL, claimed_at = NULL,
                updated_at = ?, version = version + 1
          WHERE state = 'claimed' AND claimed_at <= ?
            AND wait_expires_at <= ?`,
      )
      .bind(now, staleBefore, now),
  ]);
  return {
    recovered: recovered?.meta.changes ?? 0,
    expired: expired?.meta.changes ?? 0,
  };
}

export async function expirePendingParserCaptures(
  db: D1Database,
  expiredAt?: string,
): Promise<number> {
  const now = timestamp(expiredAt, "expiredAt");
  const result = await db
    .prepare(
      `UPDATE parser_captures
          SET state = 'expired', updated_at = ?, version = version + 1
        WHERE state = 'pending' AND wait_expires_at <= ?`,
    )
    .bind(now, now)
    .run();
  return result.meta.changes;
}

/** Internal-only R2 locator. Never serialize this value into an API response. */
export async function getParserCaptureStorage(
  db: D1Database,
  id: string,
  availableAt?: string,
): Promise<ParserCaptureStorage | null> {
  const captureId = eventId(id, "captureId");
  const now = timestamp(availableAt, "availableAt");
  const row = await getCaptureRow(db, captureId);
  if (
    !row ||
    row.state !== "captured" ||
    !row.captured_event_id ||
    !row.sample_object_key ||
    !row.sample_sha256 ||
    row.sample_size === null ||
    !row.sample_expires_at ||
    row.sample_expires_at <= now
  ) {
    return null;
  }
  return {
    captureId: row.id,
    capturedEventId: row.captured_event_id,
    objectKey: row.sample_object_key,
    sha256: row.sample_sha256,
    size: row.sample_size,
    expiresAt: row.sample_expires_at,
    version: row.version,
  };
}

export async function listExpiredParserCaptureSamples(
  db: D1Database,
  expiredAt?: string,
  limit = 100,
): Promise<ParserCaptureStorage[]> {
  const now = timestamp(expiredAt, "expiredAt");
  if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
    throw new Error("limit must be an integer between 1 and 1000");
  }
  const result = await db
    .prepare(
      `SELECT ${CAPTURE_COLUMNS}
         FROM parser_captures
        WHERE state = 'captured' AND sample_object_key IS NOT NULL
          AND sample_expires_at <= ?
        ORDER BY sample_expires_at ASC, id ASC
        LIMIT ?`,
    )
    .bind(now, limit)
    .all<ParserCaptureRow>();
  return result.results.map((row) => ({
    captureId: row.id,
    capturedEventId: row.captured_event_id!,
    objectKey: row.sample_object_key!,
    sha256: row.sample_sha256!,
    size: row.sample_size!,
    expiresAt: row.sample_expires_at!,
    version: row.version,
  }));
}

/** Call only after the corresponding R2 object has been deleted. */
export async function expireCapturedParserCapture(
  db: D1Database,
  id: string,
  expectedVersion: number,
  expiredAt?: string,
): Promise<ParserCaptureMutationResult> {
  requireVersion(expectedVersion);
  const captureId = eventId(id, "captureId");
  const now = timestamp(expiredAt, "expiredAt");
  const result = await db
    .prepare(
      `UPDATE parser_captures
          SET state = 'expired', sample_object_key = NULL,
              sample_sha256 = NULL, sample_size = NULL,
              sample_expires_at = NULL, updated_at = ?,
              version = version + 1
        WHERE id = ? AND version = ? AND state = 'captured'
          AND sample_expires_at <= ?`,
    )
    .bind(now, captureId, expectedVersion, now)
    .run();
  if (result.meta.changes !== 1) {
    const existing = await getCaptureRow(db, captureId);
    if (!existing) return { status: "not_found" };
    if (
      existing.version === expectedVersion &&
      existing.state === "captured" &&
      existing.sample_expires_at &&
      existing.sample_expires_at > now
    ) {
      return { status: "not_due" };
    }
    return { status: "conflict" };
  }
  const capture = await getParserCapture(db, captureId);
  return capture ? { status: "updated", capture } : { status: "not_found" };
}

export async function deleteTerminalParserCapturesBefore(
  db: D1Database,
  cutoff: string,
): Promise<number> {
  const before = timestamp(cutoff, "cutoff");
  const result = await db
    .prepare(
      `DELETE FROM parser_captures
        WHERE state IN ('cancelled', 'expired', 'failed')
          AND sample_object_key IS NULL AND updated_at < ?`,
    )
    .bind(before)
    .run();
  return result.meta.changes;
}
