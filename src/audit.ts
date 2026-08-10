import type {
  AuditTraceStep,
  Decision,
  EmailFacts,
  MessageAudit,
  RuntimeConfig,
} from "./types";

const MAX_AUDIT_HEADERS = 50;
const MAX_HEADER_NAME_CHARACTERS = 128;
const MAX_HEADER_VALUE_CHARACTERS = 2_048;
const MAX_TOTAL_HEADER_CHARACTERS = 32_000;
const MAX_BODY_PREVIEW_CHARACTERS = 8_000;
const MAX_AUDIT_ATTACHMENTS = 100;

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
  "x-api-key",
]);

function boundedHeaders(
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  const result = Object.create(null) as Record<string, string>;
  let totalCharacters = 0;
  for (const [rawName, rawValue] of Object.entries(headers).slice(
    0,
    MAX_AUDIT_HEADERS,
  )) {
    const name = rawName
      .replace(/[^a-z0-9-]/gi, "")
      .toLowerCase()
      .slice(0, MAX_HEADER_NAME_CHARACTERS);
    if (!name) continue;
    const value = SENSITIVE_HEADER_NAMES.has(name)
      ? "[redacted]"
      : rawValue
          .replace(/[\0\r\n]+/g, " ")
          .trim()
          .slice(0, MAX_HEADER_VALUE_CHARACTERS);
    if (
      totalCharacters + name.length + value.length >
      MAX_TOTAL_HEADER_CHARACTERS
    ) {
      break;
    }
    result[name] = value;
    totalCharacters += name.length + value.length;
  }
  return result;
}

export function buildMessageAudit(
  facts: EmailFacts,
  decision: Decision,
  config: RuntimeConfig,
  trace: readonly AuditTraceStep[],
): MessageAudit {
  const bodyPreview = facts.mimeParsed
    ? facts.bodyText.slice(0, MAX_BODY_PREVIEW_CHARACTERS)
    : "";
  return {
    decisionReason: decision.reason.slice(0, 1_000),
    spamThreshold: config.spamThreshold,
    mimeParsed: facts.mimeParsed,
    bodyTruncated:
      facts.mimeParsed &&
      (facts.bodyText.length > bodyPreview.length ||
        facts.bodyText.length >= config.maxBodyCharacters),
    headers: boundedHeaders(facts.headers),
    bodyPreview,
    attachments: facts.attachments
      .slice(0, MAX_AUDIT_ATTACHMENTS)
      .map((item) => ({
        filename: item.filename.slice(0, 512),
        mimeType: item.mimeType.slice(0, 255),
        size: item.size,
      })),
    trace: trace.slice(0, 50).map((step) => ({
      stage: step.stage.slice(0, 80),
      outcome: step.outcome,
      detail: step.detail.slice(0, 1_000),
      at: step.at,
    })),
  };
}
