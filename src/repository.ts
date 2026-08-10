import type {
  AttachmentFacts,
  AuditTraceOutcome,
  AuditTraceStep,
  MessageAudit,
  ProcessingEvent,
  QuarantineReview,
  QuarantineState,
  ReviewTimelineEntry,
  StoredRule,
} from "./types";
import {
  canonicalizeDeliveryPayload,
  digestDeliveryPayload,
} from "./delivery-repository";
import type { DeliveryActionType } from "./delivery-types";
import {
  parserCaptureFinalizeStatement,
  type FinalizeParserCaptureInput,
} from "./parser-capture-repository";
import { ruleInputSchema, type RuleInput } from "./validation";

interface RuleRow {
  id: string;
  name: string;
  description: string;
  priority: number;
  enabled: number;
  match_mode: string;
  conditions_json: string;
  action_json: string;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  message_id: string;
  envelope_from: string;
  envelope_to: string;
  subject: string;
  raw_size: number;
  spam_score: number;
  spam_reasons_json: string;
  decision: ProcessingEvent["decision"];
  matched_rule_id: string | null;
  matched_rule_name: string | null;
  destination: string | null;
  destination_mailbox_id: string | null;
  destination_mailbox_name: string | null;
  status: ProcessingEvent["status"];
  error: string | null;
  created_at: string;
  audit_json: string | null;
  archive_key: string | null;
  quarantine_object_key: string | null;
  quarantine_state: QuarantineState | null;
  quarantine_expires_at: string | null;
  quarantine_reviewed_at: string | null;
  quarantine_reviewer: string | null;
  quarantine_note: string | null;
  quarantine_release_destination: string | null;
  quarantine_release_message_id: string | null;
  quarantine_last_error: string | null;
  quarantine_version: number | null;
}

interface ReviewActionRow {
  id: string;
  action: string;
  actor: string;
  note: string | null;
  detail_json: string;
  created_at: string;
}

interface QuarantineStorageRow {
  object_key: string | null;
  sha256: string | null;
  state: QuarantineState;
  version: number;
  expires_at: string;
  release_destination: string | null;
}

const EVENT_SELECT = `SELECT p.id, p.message_id, p.envelope_from, p.envelope_to,
       p.subject, p.raw_size, p.spam_score, p.spam_reasons_json,
       p.decision, p.matched_rule_id, p.matched_rule_name, p.destination,
       p.destination_mailbox_id, p.destination_mailbox_name,
       p.status, p.error, p.created_at, p.audit_json, p.archive_key,
       q.object_key AS quarantine_object_key,
       q.state AS quarantine_state,
       q.expires_at AS quarantine_expires_at,
       q.reviewed_at AS quarantine_reviewed_at,
       q.reviewer AS quarantine_reviewer,
       q.note AS quarantine_note,
       q.release_destination AS quarantine_release_destination,
       q.release_message_id AS quarantine_release_message_id,
       q.last_error AS quarantine_last_error,
       q.version AS quarantine_version
  FROM processing_events p
  LEFT JOIN quarantine_items q ON q.event_id = p.id`;

const TRACE_OUTCOMES = new Set<AuditTraceOutcome>([
  "info",
  "success",
  "warning",
  "error",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(value: string | null, fallback: unknown): unknown {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

function parseStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function parseAttachments(value: unknown): AttachmentFacts[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((attachment) => {
    if (
      !isRecord(attachment) ||
      typeof attachment.filename !== "string" ||
      typeof attachment.mimeType !== "string" ||
      typeof attachment.size !== "number"
    ) {
      return [];
    }
    return [
      {
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
      },
    ];
  });
}

function parseTrace(value: unknown): AuditTraceStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((step) => {
    if (
      !isRecord(step) ||
      typeof step.stage !== "string" ||
      typeof step.outcome !== "string" ||
      !TRACE_OUTCOMES.has(step.outcome as AuditTraceOutcome) ||
      typeof step.detail !== "string" ||
      typeof step.at !== "string"
    ) {
      return [];
    }
    return [
      {
        stage: step.stage,
        outcome: step.outcome as AuditTraceOutcome,
        detail: step.detail,
        at: step.at,
      },
    ];
  });
}

function parseAudit(value: string | null, rawAvailable: boolean): MessageAudit {
  const parsed = parseJson(value, {});
  const audit = isRecord(parsed) ? parsed : {};
  return {
    decisionReason:
      typeof audit.decisionReason === "string" ? audit.decisionReason : "",
    spamThreshold:
      typeof audit.spamThreshold === "number" ? audit.spamThreshold : 0,
    mimeParsed:
      typeof audit.mimeParsed === "boolean" ? audit.mimeParsed : false,
    bodyTruncated:
      typeof audit.bodyTruncated === "boolean" ? audit.bodyTruncated : false,
    headers: parseStringRecord(audit.headers),
    bodyPreview: typeof audit.bodyPreview === "string" ? audit.bodyPreview : "",
    attachments: parseAttachments(audit.attachments),
    trace: parseTrace(audit.trace),
    ...(rawAvailable ? { rawAvailable: true } : {}),
  };
}

function timelineEntry(row: ReviewActionRow): ReviewTimelineEntry {
  const detail = parseJson(row.detail_json, {});
  return {
    id: row.id,
    action: row.action,
    at: row.created_at,
    ...(row.actor ? { actor: row.actor } : {}),
    ...(row.note ? { note: row.note } : {}),
    ...(isRecord(detail) && Object.keys(detail).length > 0 ? { detail } : {}),
  };
}

function rowToRule(row: RuleRow): StoredRule {
  const input = ruleInputSchema.parse({
    name: row.name,
    description: row.description,
    priority: row.priority,
    enabled: row.enabled === 1,
    match: row.match_mode,
    conditions: JSON.parse(row.conditions_json) as unknown,
    action: JSON.parse(row.action_json) as unknown,
  });
  return {
    id: row.id,
    ...input,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToEvent(
  row: EventRow,
  timeline?: readonly ReviewTimelineEntry[],
): ProcessingEvent {
  const quarantine =
    row.quarantine_state &&
    row.quarantine_expires_at &&
    row.quarantine_version !== null
      ? {
          state: row.quarantine_state,
          version: row.quarantine_version,
          expiresAt: row.quarantine_expires_at,
          rawAvailable: row.quarantine_object_key !== null,
          ...(row.quarantine_reviewed_at
            ? { reviewedAt: row.quarantine_reviewed_at }
            : {}),
          ...(row.quarantine_reviewer
            ? { reviewer: row.quarantine_reviewer }
            : {}),
          ...(row.quarantine_note ? { note: row.quarantine_note } : {}),
          ...(row.quarantine_release_destination
            ? { releaseDestination: row.quarantine_release_destination }
            : {}),
          ...(row.quarantine_release_message_id
            ? { releaseMessageId: row.quarantine_release_message_id }
            : {}),
          ...(row.quarantine_last_error
            ? { lastError: row.quarantine_last_error }
            : {}),
          ...(timeline ? { timeline } : {}),
        }
      : undefined;
  return {
    id: row.id,
    messageId: row.message_id,
    envelopeFrom: row.envelope_from,
    envelopeTo: row.envelope_to,
    subject: row.subject,
    rawSize: row.raw_size,
    spamScore: row.spam_score,
    spamReasons: JSON.parse(row.spam_reasons_json) as string[],
    decision: row.decision,
    ...(row.matched_rule_id ? { matchedRuleId: row.matched_rule_id } : {}),
    ...(row.matched_rule_name
      ? { matchedRuleName: row.matched_rule_name }
      : {}),
    ...(row.destination ? { destination: row.destination } : {}),
    ...(row.destination_mailbox_id
      ? { destinationMailboxId: row.destination_mailbox_id }
      : {}),
    ...(row.destination_mailbox_name
      ? { destinationMailboxName: row.destination_mailbox_name }
      : {}),
    status: row.status,
    ...(row.error ? { error: row.error } : {}),
    audit: parseAudit(row.audit_json, row.archive_key !== null),
    ...(quarantine ? { quarantine } : {}),
    createdAt: row.created_at,
  };
}

export async function listRules(db: D1Database): Promise<StoredRule[]> {
  const result = await db
    .prepare(
      `SELECT id, name, description, priority, enabled, match_mode,
              conditions_json, action_json, created_at, updated_at
         FROM rules
        ORDER BY priority ASC, created_at ASC`,
    )
    .all<RuleRow>();
  return result.results.map(rowToRule);
}

export async function getRule(
  db: D1Database,
  id: string,
): Promise<StoredRule | null> {
  const row = await db
    .prepare(
      `SELECT id, name, description, priority, enabled, match_mode,
              conditions_json, action_json, created_at, updated_at
         FROM rules
        WHERE id = ?`,
    )
    .bind(id)
    .first<RuleRow>();
  return row ? rowToRule(row) : null;
}

export class RuleMailboxUnavailableError extends Error {
  override readonly name = "RuleMailboxUnavailableError";

  constructor() {
    super("The selected Gorelo mailbox is no longer enabled");
  }
}

function actionMailboxId(input: RuleInput): string | null {
  return "mailboxId" in input.action ? (input.action.mailboxId ?? null) : null;
}

export async function createRule(
  db: D1Database,
  input: RuleInput,
): Promise<StoredRule> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const mailboxId = actionMailboxId(input);
  const result = await db
    .prepare(
      `INSERT INTO rules
         (id, name, description, priority, enabled, match_mode,
          conditions_json, action_json, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE ? IS NULL OR EXISTS (
          SELECT 1 FROM gorelo_mailboxes
           WHERE id = ? AND enabled = 1
        )`,
    )
    .bind(
      id,
      input.name,
      input.description,
      input.priority,
      input.enabled ? 1 : 0,
      input.match,
      JSON.stringify(input.conditions),
      JSON.stringify(input.action),
      now,
      now,
      mailboxId,
      mailboxId,
    )
    .run();
  if (result.meta.changes !== 1) throw new RuleMailboxUnavailableError();
  return { id, ...input, createdAt: now, updatedAt: now };
}

export async function updateRule(
  db: D1Database,
  id: string,
  input: RuleInput,
): Promise<StoredRule | null> {
  const existing = await getRule(db, id);
  if (!existing) {
    return null;
  }
  const now = new Date().toISOString();
  const mailboxId = actionMailboxId(input);
  const result = await db
    .prepare(
      `UPDATE rules
          SET name = ?, description = ?, priority = ?, enabled = ?, match_mode = ?,
              conditions_json = ?, action_json = ?, updated_at = ?
        WHERE id = ?
          AND (? IS NULL OR EXISTS (
            SELECT 1 FROM gorelo_mailboxes
             WHERE id = ? AND enabled = 1
          ))`,
    )
    .bind(
      input.name,
      input.description,
      input.priority,
      input.enabled ? 1 : 0,
      input.match,
      JSON.stringify(input.conditions),
      JSON.stringify(input.action),
      now,
      id,
      mailboxId,
      mailboxId,
    )
    .run();
  if (result.meta.changes !== 1) {
    if (!(await getRule(db, id))) return null;
    throw new RuleMailboxUnavailableError();
  }
  return { id, ...input, createdAt: existing.createdAt, updatedAt: now };
}

export async function deleteRule(db: D1Database, id: string): Promise<boolean> {
  const existing = await getRule(db, id);
  if (!existing) {
    return false;
  }
  await db.prepare("DELETE FROM rules WHERE id = ?").bind(id).run();
  return true;
}

export interface RecordEventOptions {
  objectKey?: string;
  sha256?: string;
  actor?: string;
  parserCapture?: {
    id: string;
    input: FinalizeParserCaptureInput;
  };
}

export interface ListQuarantineOptions {
  limit?: number;
  state?: QuarantineState;
}

export interface EventPageCursor {
  createdAt: string;
  id: string;
}

export interface ListEventPageOptions {
  limit?: number;
  cursor?: EventPageCursor;
  query?: string;
  status?: ProcessingEvent["status"];
}

export interface ListQuarantinePageOptions extends ListEventPageOptions {
  state?: QuarantineState;
}

export interface ProcessingEventPage {
  items: ProcessingEvent[];
  nextCursor?: EventPageCursor;
}

export interface EventStorage {
  objectKey: string;
  sha256?: string;
}

export interface QuarantineStorage {
  eventId: string;
  objectKey?: string;
  sha256?: string;
  state: QuarantineState;
  version: number;
  expiresAt: string;
  releaseDestination?: string;
}

export interface ExpiredArchiveKey {
  eventId: string;
  objectKey: string;
}

export type QuarantineMutationResult =
  | { status: "updated"; review: QuarantineReview }
  | { status: "not_found" | "conflict" };

export type QuarantineReleaseUncertainReason =
  "dispatch_outcome_unknown" | "audit_completion_unknown";

const QUARANTINE_RELEASE_UNCERTAIN_ERRORS: Readonly<
  Record<QuarantineReleaseUncertainReason, string>
> = {
  dispatch_outcome_unknown:
    "Release dispatch outcome is uncertain; automatic retry is disabled",
  audit_completion_unknown:
    "Cloudflare accepted the release, but audit completion is uncertain; automatic retry is disabled",
};

function cleanActor(value: string | undefined): string {
  return (value?.trim() || "system").slice(0, 320);
}

function cleanNote(value: string | undefined): string | null {
  const note = value?.trim();
  return note ? note.slice(0, 2_000) : null;
}

function eventAudit(event: ProcessingEvent): MessageAudit {
  return (
    event.audit ?? {
      decisionReason: "",
      spamThreshold: 0,
      mimeParsed: false,
      bodyTruncated: false,
      headers: {},
      bodyPreview: "",
      attachments: [],
      trace: [],
    }
  );
}

export async function recordEvent(
  db: D1Database,
  event: ProcessingEvent,
  options: RecordEventOptions = {},
): Promise<void> {
  const eventStatement = eventInsertStatement(db, event, options);
  const captureStatement = options.parserCapture
    ? parserCaptureFinalizeStatement(
        db,
        options.parserCapture.id,
        options.parserCapture.input,
      )
    : undefined;

  if (!event.quarantine) {
    if (captureStatement) {
      const results = await db.batch([eventStatement, captureStatement]);
      assertCaptureEventBatch(results, 0, 1);
    } else {
      await eventStatement.run();
    }
    return;
  }

  const review = event.quarantine;
  const actor = cleanActor(options.actor ?? review.reviewer);
  const note = cleanNote(review.note);
  const updatedAt = review.reviewedAt ?? event.createdAt;
  const quarantineStatement = db
    .prepare(
      `INSERT INTO quarantine_items
         (event_id, object_key, sha256, state, expires_at, reviewed_at,
          reviewer, note, release_destination, release_message_id, last_error,
          version, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      event.id,
      options.objectKey ?? null,
      options.sha256 ?? null,
      review.state,
      review.expiresAt,
      review.reviewedAt ?? null,
      review.reviewer ?? null,
      note,
      review.releaseDestination ?? null,
      review.releaseMessageId ?? null,
      review.lastError ?? null,
      review.version,
      updatedAt,
    );
  const actionStatement = db
    .prepare(
      `INSERT INTO message_review_actions
         (id, event_id, action, actor, note, detail_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      event.id,
      "quarantined",
      actor,
      note,
      JSON.stringify({
        state: review.state,
        version: review.version,
        rawAvailable: Boolean(options.objectKey),
      }),
      event.createdAt,
    );

  const results = await db.batch([
    eventStatement,
    quarantineStatement,
    actionStatement,
    ...(captureStatement ? [captureStatement] : []),
  ]);
  if (captureStatement) assertCaptureEventBatch(results, 0, 3);
}

function statementChangedExactlyOnce(result: D1Result | undefined): boolean {
  const changes = result?.meta?.changes;
  return changes === undefined || changes === 1;
}

function assertCaptureEventBatch(
  results: D1Result[],
  eventIndex: number,
  captureIndex: number,
): void {
  if (
    !statementChangedExactlyOnce(results[eventIndex]) ||
    !statementChangedExactlyOnce(results[captureIndex])
  ) {
    throw new Error("Parser capture finalization did not commit atomically");
  }
}

function eventInsertStatement(
  db: D1Database,
  event: ProcessingEvent,
  options: RecordEventOptions,
): D1PreparedStatement {
  const capture = options.parserCapture;
  return db
    .prepare(
      `INSERT INTO processing_events
         (id, message_id, envelope_from, envelope_to, subject, raw_size,
          spam_score, spam_reasons_json, decision, matched_rule_id,
          matched_rule_name, destination, destination_mailbox_id,
          destination_mailbox_name, status, error, created_at, audit_json,
          archive_key, archive_sha256)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE ? IS NULL OR EXISTS (
          SELECT 1 FROM parser_captures
           WHERE id = ? AND version = ? AND state = 'claimed'
             AND claim_event_id = ?
        )`,
    )
    .bind(
      event.id,
      event.messageId,
      event.envelopeFrom,
      event.envelopeTo,
      event.subject,
      event.rawSize,
      event.spamScore,
      JSON.stringify(event.spamReasons),
      event.decision,
      event.matchedRuleId ?? null,
      event.matchedRuleName ?? null,
      event.destination ?? null,
      event.destinationMailboxId ?? null,
      event.destinationMailboxName ?? null,
      event.status,
      event.error ?? null,
      event.createdAt,
      JSON.stringify(eventAudit(event)),
      options.objectKey ?? null,
      options.sha256 ?? null,
      capture?.id ?? null,
      capture?.id ?? null,
      capture?.input.expectedVersion ?? null,
      capture?.input.claimEventId ?? null,
    );
}

export interface PendingStructuredDelivery {
  actionType: Extract<DeliveryActionType, "create_ticket" | "create_alert">;
  payloadSnapshot: Readonly<Record<string, unknown>>;
  ruleSnapshotId?: string;
}

export interface PendingWebhookDelivery {
  actionType: "send_webhook";
  payloadSnapshot: Readonly<Record<string, unknown>>;
  ruleSnapshotId?: string;
}

async function recordEventWithPendingDelivery(
  db: D1Database,
  event: ProcessingEvent,
  delivery: PendingStructuredDelivery | PendingWebhookDelivery,
  options: RecordEventOptions,
): Promise<string> {
  if (event.quarantine) {
    throw new Error("Outbound delivery events cannot be quarantine items");
  }
  const ruleSnapshotId = delivery.ruleSnapshotId?.trim();
  if (ruleSnapshotId && ruleSnapshotId.length > 320) {
    throw new Error("ruleSnapshotId must not exceed 320 characters");
  }
  const payloadJson = canonicalizeDeliveryPayload(delivery.payloadSnapshot);
  const payloadDigest = await digestDeliveryPayload(delivery.payloadSnapshot);
  const deliveryId = crypto.randomUUID();
  const deliveryStatement = db
    .prepare(
      `INSERT INTO outbound_deliveries
         (id, event_id, action_index, action_type, state, payload_json,
          payload_digest, parser_snapshot_id, rule_snapshot_id, attempts,
          created_at, updated_at, version)
       VALUES (?, ?, 0, ?, 'pending', ?, ?, NULL, ?, 0, ?, ?, 1)`,
    )
    .bind(
      deliveryId,
      event.id,
      delivery.actionType,
      payloadJson,
      payloadDigest,
      ruleSnapshotId ?? null,
      event.createdAt,
      event.createdAt,
    );
  const captureStatement = options.parserCapture
    ? parserCaptureFinalizeStatement(
        db,
        options.parserCapture.id,
        options.parserCapture.input,
      )
    : undefined;
  const results = await db.batch([
    eventInsertStatement(db, event, options),
    deliveryStatement,
    ...(captureStatement ? [captureStatement] : []),
  ]);
  if (captureStatement) assertCaptureEventBatch(results, 0, 2);
  return deliveryId;
}

/** Atomically persists an API-only message event and its never-claimed action. */
export async function recordEventWithPendingStructuredDelivery(
  db: D1Database,
  event: ProcessingEvent,
  delivery: PendingStructuredDelivery,
  options: RecordEventOptions = {},
): Promise<string> {
  return recordEventWithPendingDelivery(db, event, delivery, options);
}

/** Atomically persists a pre-forward audit event and its pending webhook. */
export async function recordEventWithPendingWebhookDelivery(
  db: D1Database,
  event: ProcessingEvent,
  delivery: PendingWebhookDelivery,
  options: RecordEventOptions = {},
): Promise<string> {
  return recordEventWithPendingDelivery(db, event, delivery, options);
}

/** Updates the top-level message outcome after a durable structured action. */
export async function updateEventProcessingOutcome(
  db: D1Database,
  eventId: string,
  input: {
    status: ProcessingEvent["status"];
    error?: string;
    audit: MessageAudit;
  },
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE processing_events
          SET status = ?, error = ?, audit_json = ?
        WHERE id = ?`,
    )
    .bind(
      input.status,
      input.error?.replace(/[\r\n]+/g, " ").slice(0, 500) ?? null,
      JSON.stringify(input.audit),
      eventId,
    )
    .run();
  return result.meta.changes === 1;
}

export async function listEvents(
  db: D1Database,
  limit: number,
): Promise<ProcessingEvent[]> {
  return (await listEventsPage(db, { limit })).items;
}

const EVENT_SEARCH_COLUMNS = [
  "p.message_id",
  "p.envelope_from",
  "p.envelope_to",
  "p.subject",
  "p.spam_reasons_json",
  "p.decision",
  "p.matched_rule_name",
  "p.destination",
  "p.destination_mailbox_name",
  "p.status",
  "p.error",
  "p.audit_json",
] as const;

async function queryEventPage(
  db: D1Database,
  options: ListQuarantinePageOptions,
  quarantineOnly: boolean,
): Promise<ProcessingEventPage> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  const clauses: string[] = [];
  const bindings: (number | string)[] = [];

  if (quarantineOnly) clauses.push("q.event_id IS NOT NULL");
  if (options.state) {
    clauses.push("q.state = ?");
    bindings.push(options.state);
  }
  if (options.status) {
    clauses.push("p.status = ?");
    bindings.push(options.status);
  }
  if (options.cursor) {
    clauses.push("(p.created_at < ? OR (p.created_at = ? AND p.id < ?))");
    bindings.push(
      options.cursor.createdAt,
      options.cursor.createdAt,
      options.cursor.id,
    );
  }
  const query = options.query?.trim().toLowerCase();
  if (query) {
    clauses.push(
      `(${EVENT_SEARCH_COLUMNS.map(
        (column) => `instr(lower(COALESCE(${column}, '')), ?) > 0`,
      ).join(" OR ")})`,
    );
    bindings.push(...EVENT_SEARCH_COLUMNS.map(() => query));
  }

  const result = await db
    .prepare(
      `${EVENT_SELECT}
       ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT ?`,
    )
    .bind(...bindings, limit + 1)
    .all<EventRow>();
  const hasMore = result.results.length > limit;
  const rows = result.results.slice(0, limit);
  const last = rows.at(-1);
  return {
    items: rows.map((row) => rowToEvent(row)),
    ...(hasMore && last
      ? { nextCursor: { createdAt: last.created_at, id: last.id } }
      : {}),
  };
}

/** Lists retained processing events with stable, descending keyset pagination. */
export async function listEventsPage(
  db: D1Database,
  options: ListEventPageOptions = {},
): Promise<ProcessingEventPage> {
  return queryEventPage(db, options, false);
}

export async function getEvent(
  db: D1Database,
  id: string,
): Promise<ProcessingEvent | null> {
  const row = await db
    .prepare(`${EVENT_SELECT} WHERE p.id = ?`)
    .bind(id)
    .first<EventRow>();
  if (!row) return null;
  const timeline = row.quarantine_state
    ? await listReviewActions(db, id)
    : undefined;
  return rowToEvent(row, timeline);
}

export async function listQuarantine(
  db: D1Database,
  options: ListQuarantineOptions = {},
): Promise<ProcessingEvent[]> {
  return (await listQuarantinePage(db, options)).items;
}

/** Lists quarantined processing events with stable, descending keyset pagination. */
export async function listQuarantinePage(
  db: D1Database,
  options: ListQuarantinePageOptions = {},
): Promise<ProcessingEventPage> {
  return queryEventPage(db, options, true);
}

export async function listReviewActions(
  db: D1Database,
  eventId: string,
): Promise<ReviewTimelineEntry[]> {
  const result = await db
    .prepare(
      `SELECT id, action, actor, note, detail_json, created_at
         FROM message_review_actions
        WHERE event_id = ?
        ORDER BY created_at ASC, rowid ASC`,
    )
    .bind(eventId)
    .all<ReviewActionRow>();
  return result.results.map(timelineEntry);
}

export async function appendReviewAction(
  db: D1Database,
  eventId: string,
  action: string,
  actor?: string,
  note?: string,
  detail: Readonly<Record<string, unknown>> = {},
): Promise<ReviewTimelineEntry> {
  const entry: ReviewTimelineEntry = {
    id: crypto.randomUUID(),
    action: action.trim().slice(0, 120),
    at: new Date().toISOString(),
    actor: cleanActor(actor),
    ...(cleanNote(note) ? { note: cleanNote(note)! } : {}),
    ...(Object.keys(detail).length > 0 ? { detail } : {}),
  };
  await db
    .prepare(
      `INSERT INTO message_review_actions
         (id, event_id, action, actor, note, detail_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entry.id,
      eventId,
      entry.action,
      entry.actor ?? "system",
      entry.note ?? null,
      JSON.stringify(detail),
      entry.at,
    )
    .run();
  return entry;
}

export async function getEventStorage(
  db: D1Database,
  eventId: string,
): Promise<EventStorage | null> {
  const row = await db
    .prepare(
      `SELECT archive_key, archive_sha256
         FROM processing_events
        WHERE id = ?`,
    )
    .bind(eventId)
    .first<{ archive_key: string | null; archive_sha256: string | null }>();
  if (!row?.archive_key) return null;
  return {
    objectKey: row.archive_key,
    ...(row.archive_sha256 ? { sha256: row.archive_sha256 } : {}),
  };
}

export async function getQuarantineStorage(
  db: D1Database,
  eventId: string,
): Promise<QuarantineStorage | null> {
  const row = await db
    .prepare(
      `SELECT COALESCE(q.object_key, p.archive_key) AS object_key,
              COALESCE(q.sha256, p.archive_sha256) AS sha256,
              q.state, q.version, q.expires_at, q.release_destination
         FROM quarantine_items q
         JOIN processing_events p ON p.id = q.event_id
        WHERE q.event_id = ?`,
    )
    .bind(eventId)
    .first<QuarantineStorageRow>();
  if (!row) return null;
  return {
    eventId,
    ...(row.object_key ? { objectKey: row.object_key } : {}),
    ...(row.sha256 ? { sha256: row.sha256 } : {}),
    state: row.state,
    version: row.version,
    expiresAt: row.expires_at,
    ...(row.release_destination
      ? { releaseDestination: row.release_destination }
      : {}),
  };
}

async function transitionFailure(
  db: D1Database,
  eventId: string,
): Promise<QuarantineMutationResult> {
  const existing = await db
    .prepare("SELECT event_id FROM quarantine_items WHERE event_id = ?")
    .bind(eventId)
    .first<{ event_id: string }>();
  return existing ? { status: "conflict" } : { status: "not_found" };
}

async function finishTransition(
  db: D1Database,
  eventId: string,
  expectedVersion: number,
  nextState: QuarantineState,
  update: D1PreparedStatement,
  action: string,
  actor: string,
  note: string | null,
  detail: Readonly<Record<string, unknown>>,
  now: string,
): Promise<QuarantineMutationResult> {
  const nextVersion = expectedVersion + 1;
  const actionStatement = db
    .prepare(
      `INSERT INTO message_review_actions
         (id, event_id, action, actor, note, detail_json, created_at)
       SELECT ?, event_id, ?, ?, ?, ?, ?
         FROM quarantine_items
        WHERE event_id = ? AND state = ? AND version = ? AND changes() = 1`,
    )
    .bind(
      crypto.randomUUID(),
      action,
      actor,
      note,
      JSON.stringify(detail),
      now,
      eventId,
      nextState,
      nextVersion,
    );
  const [updateResult] = await db.batch([update, actionStatement]);
  if (!updateResult || updateResult.meta.changes !== 1) {
    return transitionFailure(db, eventId);
  }
  const event = await getEvent(db, eventId);
  return event?.quarantine
    ? { status: "updated", review: event.quarantine }
    : { status: "not_found" };
}

export async function beginQuarantineRelease(
  db: D1Database,
  eventId: string,
  expectedVersion: number,
  destination: string,
  note: string | undefined,
  actor: string,
): Promise<QuarantineMutationResult> {
  const now = new Date().toISOString();
  const normalizedDestination = destination.trim().toLowerCase().slice(0, 320);
  if (!normalizedDestination) {
    throw new Error("A release destination is required");
  }
  const reviewer = cleanActor(actor);
  const normalizedNote = cleanNote(note);
  const update = db
    .prepare(
      `UPDATE quarantine_items
          SET state = 'releasing', reviewed_at = ?, reviewer = ?,
              note = COALESCE(?, note), release_destination = ?,
              release_message_id = NULL, last_error = NULL,
              version = version + 1, updated_at = ?
        WHERE event_id = ? AND version = ?
          AND state IN ('pending', 'release_failed')`,
    )
    .bind(
      now,
      reviewer,
      normalizedNote,
      normalizedDestination,
      now,
      eventId,
      expectedVersion,
    );
  return finishTransition(
    db,
    eventId,
    expectedVersion,
    "releasing",
    update,
    "release_started",
    reviewer,
    normalizedNote,
    { destination: normalizedDestination, expectedVersion },
    now,
  );
}

export async function completeQuarantineRelease(
  db: D1Database,
  eventId: string,
  expectedVersion: number,
  messageId: string,
  actor: string,
): Promise<QuarantineMutationResult> {
  const now = new Date().toISOString();
  const reviewer = cleanActor(actor);
  const normalizedMessageId = messageId.trim().slice(0, 998);
  const update = db
    .prepare(
      `UPDATE quarantine_items
          SET state = 'released', reviewed_at = ?, reviewer = ?,
              release_message_id = ?, last_error = NULL,
              version = version + 1, updated_at = ?
        WHERE event_id = ? AND version = ? AND state = 'releasing'`,
    )
    .bind(now, reviewer, normalizedMessageId, now, eventId, expectedVersion);
  return finishTransition(
    db,
    eventId,
    expectedVersion,
    "released",
    update,
    "released",
    reviewer,
    null,
    { messageId: normalizedMessageId, expectedVersion },
    now,
  );
}

/**
 * Records an ambiguous release outcome without making the item retryable.
 *
 * Once dispatch has begun, a rejection or a later audit-write failure cannot
 * prove that Cloudflare did not accept the message. The review therefore stays
 * in `releasing`, which deliberately remains outside every actionable state.
 */
export async function markQuarantineReleaseUncertain(
  db: D1Database,
  eventId: string,
  expectedVersion: number,
  reason: QuarantineReleaseUncertainReason,
  actor: string,
  messageId?: string,
): Promise<QuarantineMutationResult> {
  const now = new Date().toISOString();
  const reviewer = cleanActor(actor);
  const error = QUARANTINE_RELEASE_UNCERTAIN_ERRORS[reason];
  const normalizedMessageId = messageId?.trim().slice(0, 998) || null;
  const update = db
    .prepare(
      `UPDATE quarantine_items
          SET reviewed_at = ?, reviewer = ?,
              release_message_id = COALESCE(?, release_message_id),
              last_error = ?, version = version + 1, updated_at = ?
        WHERE event_id = ? AND version = ? AND state = 'releasing'`,
    )
    .bind(
      now,
      reviewer,
      normalizedMessageId,
      error,
      now,
      eventId,
      expectedVersion,
    );
  return finishTransition(
    db,
    eventId,
    expectedVersion,
    "releasing",
    update,
    "release_uncertain",
    reviewer,
    null,
    {
      reason,
      expectedVersion,
      ...(normalizedMessageId ? { messageId: normalizedMessageId } : {}),
    },
    now,
  );
}

export async function failQuarantineRelease(
  db: D1Database,
  eventId: string,
  expectedVersion: number,
  error: string,
  actor: string,
): Promise<QuarantineMutationResult> {
  const now = new Date().toISOString();
  const reviewer = cleanActor(actor);
  const normalizedError = error.replace(/[\r\n]+/g, " ").slice(0, 1_000);
  const update = db
    .prepare(
      `UPDATE quarantine_items
          SET state = 'release_failed', reviewed_at = ?, reviewer = ?,
              last_error = ?, version = version + 1, updated_at = ?
        WHERE event_id = ? AND version = ? AND state = 'releasing'`,
    )
    .bind(now, reviewer, normalizedError, now, eventId, expectedVersion);
  return finishTransition(
    db,
    eventId,
    expectedVersion,
    "release_failed",
    update,
    "release_failed",
    reviewer,
    null,
    { error: normalizedError, expectedVersion },
    now,
  );
}

export async function dismissQuarantine(
  db: D1Database,
  eventId: string,
  expectedVersion: number,
  note: string | undefined,
  actor: string,
): Promise<QuarantineMutationResult> {
  const now = new Date().toISOString();
  const reviewer = cleanActor(actor);
  const normalizedNote = cleanNote(note);
  const update = db
    .prepare(
      `UPDATE quarantine_items
          SET state = 'dismissed', reviewed_at = ?, reviewer = ?,
              note = COALESCE(?, note), last_error = NULL,
              version = version + 1, updated_at = ?
        WHERE event_id = ? AND version = ?
          AND state IN ('pending', 'release_failed')`,
    )
    .bind(now, reviewer, normalizedNote, now, eventId, expectedVersion);
  return finishTransition(
    db,
    eventId,
    expectedVersion,
    "dismissed",
    update,
    "dismissed",
    reviewer,
    normalizedNote,
    { expectedVersion },
    now,
  );
}

export async function listExpiredArchiveKeys(
  db: D1Database,
  cutoff: string,
  limit = 1_000,
): Promise<ExpiredArchiveKey[]> {
  const boundedLimit = Math.min(1_000, Math.max(1, limit));
  const result = await db
    .prepare(
      `SELECT id AS event_id, archive_key AS object_key
         FROM processing_events
        WHERE created_at < ? AND archive_key IS NOT NULL
        ORDER BY created_at ASC, id ASC
        LIMIT ?`,
    )
    .bind(cutoff, boundedLimit)
    .all<{ event_id: string; object_key: string }>();
  return result.results.map((row) => ({
    eventId: row.event_id,
    objectKey: row.object_key,
  }));
}

export async function deleteEventsBefore(
  db: D1Database,
  cutoff: string,
): Promise<number> {
  const result = await db
    .prepare("DELETE FROM processing_events WHERE created_at < ?")
    .bind(cutoff)
    .run();
  return result.meta.changes;
}
