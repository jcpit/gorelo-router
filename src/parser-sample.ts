import type { EmailFacts } from "./types";

export const MAX_PARSER_SAMPLE_BODY_CHARACTERS = 50_000;
export const MAX_PARSER_SAMPLE_DOCUMENT_BYTES = 256 * 1_024;

export interface ParserSampleDocument {
  version: 1;
  eventId: string;
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyTruncated: boolean;
  capturedAt: string;
}

export interface StoredParserSample {
  objectKey: string;
  sha256: string;
  size: number;
}

export class ParserSampleIntegrityError extends Error {
  override readonly name = "ParserSampleIntegrityError";
}

function hex(bytes: Uint8Array): string {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value: ArrayBuffer): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", value)));
}

function safeTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("capturedAt is invalid");
  return new Date(parsed).toISOString();
}

function safeEventId(value: string): string {
  const normalized = value.trim();
  if (!/^[a-z0-9:_-]{1,320}$/i.test(normalized)) {
    throw new Error("eventId is invalid");
  }
  return normalized;
}

function parserSampleDocument(
  eventId: string,
  facts: EmailFacts,
  capturedAt: string,
  sourceTruncated: boolean,
): ParserSampleDocument {
  const bodyText = facts.bodyText.slice(0, MAX_PARSER_SAMPLE_BODY_CHARACTERS);
  return {
    version: 1,
    eventId: safeEventId(eventId),
    from: facts.envelopeFrom.slice(0, 320),
    to: facts.envelopeTo.slice(0, 320),
    subject: facts.subject.slice(0, 998),
    bodyText,
    bodyTruncated: sourceTruncated || facts.bodyText.length > bodyText.length,
    capturedAt: safeTimestamp(capturedAt),
  };
}

export async function storeParserSample(
  bucket: R2Bucket,
  eventId: string,
  facts: EmailFacts,
  capturedAt: string,
  sourceTruncated = false,
): Promise<StoredParserSample> {
  const document = parserSampleDocument(
    eventId,
    facts,
    capturedAt,
    sourceTruncated,
  );
  const encoded = new TextEncoder().encode(JSON.stringify(document));
  if (
    encoded.byteLength < 1 ||
    encoded.byteLength > MAX_PARSER_SAMPLE_DOCUMENT_BYTES
  ) {
    throw new Error("Parser sample exceeds its storage limit");
  }
  const datePath = document.capturedAt.slice(0, 10).replaceAll("-", "/");
  const objectKey = `parser-samples/${datePath}/${crypto.randomUUID()}.json`;
  const body = new Uint8Array(encoded).buffer;
  const digest = await sha256(body);
  await bucket.put(objectKey, body, {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { sha256: digest },
  });
  return { objectKey, sha256: digest, size: encoded.byteLength };
}

function isParserSampleDocument(value: unknown): value is ParserSampleDocument {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    item.version === 1 &&
    typeof item.eventId === "string" &&
    /^[a-z0-9:_-]{1,320}$/i.test(item.eventId) &&
    typeof item.from === "string" &&
    item.from.length <= 320 &&
    typeof item.to === "string" &&
    item.to.length <= 320 &&
    typeof item.subject === "string" &&
    item.subject.length <= 998 &&
    typeof item.bodyText === "string" &&
    item.bodyText.length <= MAX_PARSER_SAMPLE_BODY_CHARACTERS &&
    typeof item.bodyTruncated === "boolean" &&
    typeof item.capturedAt === "string" &&
    Number.isFinite(Date.parse(item.capturedAt))
  );
}

export async function readParserSample(
  bucket: R2Bucket,
  storage: { objectKey: string; sha256: string; size: number },
): Promise<ParserSampleDocument | null> {
  if (
    !/^parser-samples\/[A-Za-z0-9][A-Za-z0-9/_-]*\.json$/.test(
      storage.objectKey,
    ) ||
    !/^[a-f0-9]{64}$/.test(storage.sha256) ||
    !Number.isInteger(storage.size) ||
    storage.size < 1 ||
    storage.size > MAX_PARSER_SAMPLE_DOCUMENT_BYTES
  ) {
    throw new ParserSampleIntegrityError();
  }
  const object = await bucket.get(storage.objectKey);
  if (!object) return null;
  if (object.size !== storage.size) throw new ParserSampleIntegrityError();
  const body = await object.arrayBuffer();
  if (body.byteLength !== storage.size) throw new ParserSampleIntegrityError();
  if ((await sha256(body)) !== storage.sha256) {
    throw new ParserSampleIntegrityError();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    throw new ParserSampleIntegrityError();
  }
  if (!isParserSampleDocument(parsed)) {
    throw new ParserSampleIntegrityError();
  }
  return parsed;
}

export async function deleteParserSample(
  bucket: R2Bucket | undefined,
  objectKey: string | undefined,
): Promise<void> {
  if (bucket && objectKey) await bucket.delete(objectKey);
}
