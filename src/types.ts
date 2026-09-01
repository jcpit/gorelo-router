import type { RuleInput } from "./validation";
import type { WebhookExtractionField } from "./extraction";

export interface Env {
  DB: D1Database;
  MESSAGE_ARCHIVE?: R2Bucket;
  RELEASE_EMAIL?: SendEmail;
  ADMIN_API_TOKEN?: string;
  GORELO_API_KEY?: string;
  GORELO_API_BASE_URL?: string;
  GORELO_CATALOG_CACHE_SECONDS?: string;
  ALLOWED_WEBHOOK_HOSTS?: string;
  WEBHOOK_SIGNING_SECRET?: string;
  WEBHOOK_TIMEOUT_MS?: string;
  DEFAULT_GORELO_ADDRESS: string;
  INBOUND_EMAIL_DOMAINS?: string;
  ALLOWED_FORWARD_DOMAINS?: string;
  ALLOWED_FORWARD_DESTINATIONS?: string;
  QUARANTINE_ADDRESS?: string;
  FAILURE_FORWARD_ADDRESS?: string;
  RELEASE_FROM_ADDRESS?: string;
  QUARANTINE_MODE?: string;
  ARCHIVE_MODE?: string;
  SPAM_THRESHOLD?: string;
  SPAM_ACTION?: string;
  SPAM_KEYWORDS?: string;
  TRUSTED_SENDER_DOMAINS?: string;
  MAX_PARSE_BYTES?: string;
  MAX_BODY_CHARACTERS?: string;
  MAX_HTML_SCAN_CHARACTERS?: string;
  EVENT_RETENTION_DAYS?: string;
}

export type SpamAction = "forward" | "quarantine" | "drop" | "reject";
export type QuarantineMode = "internal" | "mailbox";
export type ArchiveMode = "none" | "quarantine" | "all";
export type GoreloRegion = "aue" | "usw";

export interface RuntimeConfig {
  defaultGoreloAddress: string;
  inboundEmailDomains: ReadonlySet<string>;
  quarantineAddress?: string | undefined;
  failureForwardAddress?: string | undefined;
  releaseFromAddress?: string | undefined;
  quarantineMode: QuarantineMode;
  archiveMode: ArchiveMode;
  allowedForwardDomains: ReadonlySet<string>;
  allowedForwardDestinations: ReadonlySet<string>;
  spamThreshold: number;
  spamAction: SpamAction;
  spamKeywords: readonly string[];
  trustedSenderDomains: ReadonlySet<string>;
  maxParseBytes: number;
  maxBodyCharacters: number;
  maxHtmlScanCharacters: number;
  eventRetentionDays: number;
  goreloApiBaseUrl: string;
  goreloRegion: GoreloRegion;
  goreloApiConfigured: boolean;
  goreloCatalogCacheSeconds: number;
  allowedWebhookHosts: ReadonlySet<string>;
  webhookSigningConfigured: boolean;
  webhookTimeoutMs: number;
}

export interface AttachmentFacts {
  filename: string;
  mimeType: string;
  size: number;
}

export interface EmailFacts {
  envelopeFrom: string;
  fromDomain: string;
  envelopeTo: string;
  toLocalPart: string;
  subject: string;
  bodyText: string;
  headers: Readonly<Record<string, string>>;
  attachments: readonly AttachmentFacts[];
  hasAttachments: boolean;
  messageId: string;
  rawSize: number;
  mimeParsed: boolean;
}

export interface SpamAssessment {
  score: number;
  reasons: readonly string[];
  isSpam: boolean;
}

export interface EvaluatedEmail extends EmailFacts {
  spam: SpamAssessment;
  /** Bounded webhook variables when evaluating a webhook-origin rule. */
  webhookVariables?: Readonly<Record<string, string>>;
}

export interface StoredRule extends RuleInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export type DecisionType = "forward" | "quarantine" | "drop" | "reject";

export interface DecisionWebhook {
  destinationId: string;
  eventType: string;
  fields: readonly WebhookExtractionField[];
  clientIdentityField?: string;
  clientAliasScope?: string;
}

export type GoreloRuleAction = Extract<
  RuleInput["action"],
  { type: "create_ticket" | "create_alert" }
>;

export interface DecisionGoreloAction {
  action: GoreloRuleAction;
}

export interface Decision {
  type: DecisionType;
  destination?: string;
  /** Stable named Gorelo mailbox selected for this routing decision. */
  destinationMailboxId?: string;
  /** Snapshot of the mailbox name at decision time for immutable audit context. */
  destinationMailboxName?: string;
  webhook?: DecisionWebhook;
  gorelo?: DecisionGoreloAction;
  reason: string;
  matchedRuleId?: string;
  matchedRuleName?: string;
  matchedRuleSnapshotId?: string;
  spam: SpamAssessment;
}

export type ProcessingStatus =
  "forwarded" | "quarantined" | "dropped" | "rejected" | "failed";

export type AuditTraceOutcome = "info" | "success" | "warning" | "error";

export interface AuditTraceStep {
  stage: string;
  outcome: AuditTraceOutcome;
  detail: string;
  at: string;
}

export interface MessageAudit {
  decisionReason: string;
  spamThreshold: number;
  mimeParsed: boolean;
  bodyTruncated: boolean;
  headers: Record<string, string>;
  bodyPreview: string;
  attachments: readonly AttachmentFacts[];
  trace: readonly AuditTraceStep[];
  /** Derived from private archive metadata; an object key is never exposed. */
  rawAvailable?: boolean;
}

export type QuarantineState =
  | "pending"
  | "releasing"
  | "released"
  | "dismissed"
  | "release_failed"
  | "expired";

export interface ReviewTimelineEntry {
  id: string;
  action: string;
  at: string;
  actor?: string;
  note?: string;
  detail?: Readonly<Record<string, unknown>>;
}

export interface QuarantineReview {
  state: QuarantineState;
  version: number;
  expiresAt: string;
  rawAvailable: boolean;
  reviewedAt?: string;
  reviewer?: string;
  note?: string;
  releaseDestination?: string;
  releaseMessageId?: string;
  lastError?: string;
  timeline?: readonly ReviewTimelineEntry[];
}

export interface ProcessingEvent {
  id: string;
  messageId: string;
  envelopeFrom: string;
  envelopeTo: string;
  subject: string;
  rawSize: number;
  spamScore: number;
  spamReasons: readonly string[];
  decision: DecisionType;
  matchedRuleId?: string;
  matchedRuleName?: string;
  destination?: string;
  destinationMailboxId?: string;
  destinationMailboxName?: string;
  status: ProcessingStatus;
  error?: string;
  ingress?: {
    type: "email" | "webhook";
    sourceId?: string;
    sourceName?: string;
    eventType?: string;
    payloadDigest?: string;
    idempotencyKey?: string;
    variables?: Readonly<Record<string, string>>;
  };
  /** Optional for compatibility with metadata rows written before audit capture. */
  audit?: MessageAudit;
  quarantine?: QuarantineReview;
  createdAt: string;
}
