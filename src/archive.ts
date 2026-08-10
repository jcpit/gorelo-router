import { EmailMessage } from "cloudflare:email";

export interface ArchivedMessage {
  objectKey: string;
  sha256: string;
}

export const MAX_VERIFIED_ARCHIVE_BYTES = 25 * 1024 * 1024;

export class ArchivedMessageIntegrityError extends Error {
  override readonly name = "ArchivedMessageIntegrityError";

  constructor(message = "Archived message integrity verification failed") {
    super(message);
  }
}

function hex(bytes: Uint8Array): string {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function archiveRawMessage(
  bucket: R2Bucket,
  eventId: string,
  raw: ArrayBuffer,
  receivedAt: string,
): Promise<ArchivedMessage> {
  const datePath = receivedAt.slice(0, 10).replaceAll("-", "/");
  const objectKey = `messages/${datePath}/${eventId}.eml`;
  const sha256 = hex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", raw)),
  );
  await bucket.put(objectKey, raw, {
    httpMetadata: { contentType: "message/rfc822" },
    customMetadata: { sha256 },
  });
  return { objectKey, sha256 };
}

export async function readArchivedMessage(
  bucket: R2Bucket,
  objectKey: string,
): Promise<R2ObjectBody | null> {
  return bucket.get(objectKey);
}

/** Reads a bounded retained message and verifies its D1-pinned SHA-256. */
export async function verifiedArchivedArrayBuffer(
  archived: R2ObjectBody,
  expectedSha256?: string,
): Promise<ArrayBuffer> {
  if (
    !Number.isSafeInteger(archived.size) ||
    archived.size < 0 ||
    archived.size > MAX_VERIFIED_ARCHIVE_BYTES
  ) {
    throw new ArchivedMessageIntegrityError(
      "Archived message exceeds the verification size limit",
    );
  }
  if (expectedSha256 !== undefined && !/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new ArchivedMessageIntegrityError();
  }
  const body = await archived.arrayBuffer();
  if (body.byteLength !== archived.size) {
    throw new ArchivedMessageIntegrityError();
  }
  if (expectedSha256 !== undefined) {
    const actual = hex(
      new Uint8Array(await crypto.subtle.digest("SHA-256", body)),
    );
    if (actual !== expectedSha256) {
      throw new ArchivedMessageIntegrityError();
    }
  }
  return body;
}

export async function deleteArchivedMessage(
  bucket: R2Bucket | undefined,
  objectKey: string | undefined,
): Promise<void> {
  if (bucket && objectKey) {
    await bucket.delete(objectKey);
  }
}

interface ReleaseEnvelope {
  from: string;
  to: string;
  originalEnvelopeFrom: string;
  originalEnvelopeTo: string;
  releaseId: string;
}

const REGENERATED_DELIVERY_HEADERS = new Set([
  "return-path",
  "received",
  "dkim-signature",
  "arc-authentication-results",
  "arc-message-signature",
  "arc-seal",
  "feedback-id",
  "cfbl-address",
  "cfbl-feedback-id",
]);

function cleanHeaderValue(value: string, maximum = 998): string {
  return value
    .replace(/[\0\r\n]+/g, " ")
    .trim()
    .slice(0, maximum);
}

function splitRawMessage(raw: Uint8Array): {
  headers: Uint8Array;
  body: Uint8Array;
} {
  for (let index = 0; index < raw.length - 3; index += 1) {
    if (
      raw[index] === 13 &&
      raw[index + 1] === 10 &&
      raw[index + 2] === 13 &&
      raw[index + 3] === 10
    ) {
      return {
        headers: raw.subarray(0, index),
        body: raw.subarray(index + 4),
      };
    }
  }
  for (let index = 0; index < raw.length - 1; index += 1) {
    if (raw[index] === 10 && raw[index + 1] === 10) {
      return {
        headers: raw.subarray(0, index),
        body: raw.subarray(index + 2),
      };
    }
  }
  throw new Error("Archived message has no RFC 5322 header boundary");
}

function headerGroups(headerText: string): string[] {
  const groups: string[] = [];
  for (const line of headerText.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && groups.length > 0) {
      groups[groups.length - 1] += `\r\n${line}`;
    } else if (line) {
      groups.push(line);
    }
  }
  return groups;
}

function headerName(group: string): string {
  const colon = group.indexOf(":");
  return colon < 0 ? "" : group.slice(0, colon).trim().toLowerCase();
}

function renamedHeader(group: string, name: string): string {
  const colon = group.indexOf(":");
  return colon < 0 ? group : `${name}${group.slice(colon)}`;
}

export function prepareReleasedMessage(
  raw: ArrayBuffer,
  envelope: ReleaseEnvelope,
): ReadableStream<Uint8Array> {
  const split = splitRawMessage(new Uint8Array(raw));
  const groups = headerGroups(new TextDecoder().decode(split.headers));
  const hasReplyTo = groups.some((group) => headerName(group) === "reply-to");
  const preserved: string[] = [];
  for (const group of groups) {
    const name = headerName(group);
    if (REGENERATED_DELIVERY_HEADERS.has(name)) continue;
    if (name === "from") {
      preserved.push(renamedHeader(group, "X-Mail-Parser-Original-From"));
      continue;
    }
    if (name === "to") {
      preserved.push(renamedHeader(group, "X-Mail-Parser-Original-To"));
      continue;
    }
    preserved.push(group);
  }

  const generated = [
    `From: Gorelo Router <${cleanHeaderValue(envelope.from, 320)}>`,
    `To: ${cleanHeaderValue(envelope.to, 320)}`,
    ...(hasReplyTo
      ? []
      : [`Reply-To: ${cleanHeaderValue(envelope.originalEnvelopeFrom, 320)}`]),
    `X-Mail-Parser-Original-Envelope-From: ${cleanHeaderValue(envelope.originalEnvelopeFrom, 320)}`,
    `X-Mail-Parser-Original-Recipient: ${cleanHeaderValue(envelope.originalEnvelopeTo, 320)}`,
    `X-Mail-Parser-Release-Id: ${cleanHeaderValue(envelope.releaseId, 128)}`,
  ];
  const rewrittenHeaders = new TextEncoder().encode(
    `${[...generated, ...preserved].join("\r\n")}\r\n\r\n`,
  );
  const message = new Uint8Array(rewrittenHeaders.length + split.body.length);
  message.set(rewrittenHeaders);
  message.set(split.body, rewrittenHeaders.length);
  return new Blob([message]).stream();
}

export async function releaseArchivedMessage(
  binding: SendEmail,
  from: string,
  to: string,
  raw: ReadableStream<Uint8Array> | string,
): Promise<EmailSendResult> {
  return binding.send(createReleasedEmailMessage(from, to, raw));
}

export function createReleasedEmailMessage(
  from: string,
  to: string,
  raw: ReadableStream<Uint8Array> | string,
): EmailMessage {
  return new EmailMessage(from, to, raw);
}
