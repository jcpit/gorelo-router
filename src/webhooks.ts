export const WEBHOOK_SIGNATURE_HEADER = "X-Mail-Parser-Signature";
export const WEBHOOK_TIMESTAMP_HEADER = "X-Mail-Parser-Timestamp";
export const WEBHOOK_EVENT_HEADER = "X-Mail-Parser-Event";
export const WEBHOOK_EVENT_ID_HEADER = "X-Mail-Parser-Event-Id";
export const WEBHOOK_DELIVERY_ID_HEADER = "X-Mail-Parser-Delivery-Id";
export const WEBHOOK_IDEMPOTENCY_HEADER = "Idempotency-Key";

export type WebhookFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type WebhookFailureClassification =
  "definitive" | "retryable" | "uncertain";

export type WebhookErrorCode =
  | "invalid_configuration"
  | "invalid_payload"
  | "http_error"
  | "network_error"
  | "timeout";

/**
 * A deliberately redacted error. It never includes a destination, query
 * string, signing secret, payload, or response body.
 */
export class WebhookDeliveryError extends Error {
  override readonly name = "WebhookDeliveryError";

  constructor(
    readonly code: WebhookErrorCode,
    readonly classification: WebhookFailureClassification,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface SendWebhookOptions {
  url: string;
  allowedHosts: ReadonlySet<string>;
  signingSecret: string;
  eventType: string;
  eventId: string;
  deliveryId?: string;
  payload: unknown;
  fetch?: WebhookFetch;
  timeoutMs?: number;
}

export interface WebhookSendResult {
  ok: true;
  status: number;
  eventId: string;
  deliveryId: string;
}

interface WebhookEnvelope {
  specVersion: "1.0";
  eventType: string;
  eventId: string;
  deliveryId: string;
  sentAt: string;
  data: JsonValue;
}

type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const DEFAULT_TIMEOUT_MS = 8_000;
const MIN_TIMEOUT_MS = 50;
const MAX_TIMEOUT_MS = 30_000;
const MAX_ALLOWLIST_BYTES = 16_384;
const MAX_ALLOWED_HOSTS = 256;
const MAX_URL_BYTES = 4_096;
const MAX_PATH_BYTES = 2_048;
const MAX_QUERY_BYTES = 1_024;
const MAX_QUERY_PARAMETERS = 32;
const MAX_QUERY_NAME_BYTES = 128;
const MAX_QUERY_VALUE_BYTES = 512;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_JSON_DEPTH = 20;
const MAX_JSON_NODES = 10_000;
const MAX_OBJECT_PROPERTIES = 1_000;
const MAX_ARRAY_ITEMS = 10_000;
const MAX_IDENTIFIER_LENGTH = 200;
const MAX_EVENT_TYPE_LENGTH = 128;
const MIN_SECRET_BYTES = 32;
const MAX_SECRET_BYTES = 4_096;

const textEncoder = new TextEncoder();
const dnsLabelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const eventTypePattern = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,127})$/;
const safeHeaderValuePattern = /^[\x21-\x7e]+$/;
const controlCharacterPattern = /[\u0000-\u001f\u007f]/;
const sensitiveQueryNames = new Set([
  "apikey",
  "auth",
  "authorization",
  "bearer",
  "clientsecret",
  "credential",
  "key",
  "password",
  "passwd",
  "secret",
  "sig",
  "signature",
  "token",
]);

function configurationError(): WebhookDeliveryError {
  return new WebhookDeliveryError(
    "invalid_configuration",
    "definitive",
    "Webhook configuration is invalid",
  );
}

function payloadError(): WebhookDeliveryError {
  return new WebhookDeliveryError(
    "invalid_payload",
    "definitive",
    "Webhook payload is invalid or exceeds its size limit",
  );
}

function utf8Length(value: string): number {
  return textEncoder.encode(value).byteLength;
}

function isBlockedHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  );
}

function isIpLiteral(hostname: string): boolean {
  return (
    hostname.includes(":") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
    /^\d+$/.test(hostname)
  );
}

function normalizeDnsHostname(input: string): string {
  const hostname = input.toLowerCase();
  if (
    hostname.length === 0 ||
    hostname.length > 253 ||
    hostname.endsWith(".") ||
    !hostname.includes(".") ||
    isIpLiteral(hostname) ||
    isBlockedHostname(hostname)
  ) {
    throw configurationError();
  }
  const labels = hostname.split(".");
  if (labels.some((label) => !dnsLabelPattern.test(label))) {
    throw configurationError();
  }
  return hostname;
}

/** Parse a comma-separated, exact DNS hostname allowlist. Wildcards are not supported. */
export function parseAllowedWebhookHosts(csv: string): ReadonlySet<string> {
  if (
    typeof csv !== "string" ||
    csv.length === 0 ||
    utf8Length(csv) > MAX_ALLOWLIST_BYTES ||
    controlCharacterPattern.test(csv)
  ) {
    throw configurationError();
  }

  const entries = csv.split(",");
  if (entries.length > MAX_ALLOWED_HOSTS) throw configurationError();

  const allowedHosts = new Set<string>();
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (trimmed.length === 0) throw configurationError();
    allowedHosts.add(normalizeDnsHostname(trimmed));
  }
  if (allowedHosts.size === 0) throw configurationError();
  return allowedHosts;
}

function isSensitiveQueryName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    sensitiveQueryNames.has(normalized) ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("password") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("signature") ||
    normalized.endsWith("token")
  );
}

/** Validate and normalize a webhook destination without making a network request. */
export function validateWebhookUrl(
  input: string,
  allowedHosts: ReadonlySet<string>,
): URL {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.trim() !== input ||
    utf8Length(input) > MAX_URL_BYTES ||
    controlCharacterPattern.test(input) ||
    !(allowedHosts instanceof Set) ||
    allowedHosts.size === 0 ||
    allowedHosts.size > MAX_ALLOWED_HOSTS
  ) {
    throw configurationError();
  }

  const normalizedAllowedHosts = new Set<string>();
  for (const host of allowedHosts) {
    if (typeof host !== "string" || host.trim() !== host) {
      throw configurationError();
    }
    normalizedAllowedHosts.add(normalizeDnsHostname(host));
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw configurationError();
  }

  if (
    url.protocol !== "https:" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== ""
  ) {
    throw configurationError();
  }

  const hostname = normalizeDnsHostname(url.hostname);
  if (!normalizedAllowedHosts.has(hostname)) throw configurationError();
  if (utf8Length(url.pathname) > MAX_PATH_BYTES) throw configurationError();
  if (utf8Length(url.search) > MAX_QUERY_BYTES) throw configurationError();

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    throw configurationError();
  }
  if (controlCharacterPattern.test(decodedPath)) throw configurationError();

  let queryParameterCount = 0;
  for (const [name, value] of url.searchParams) {
    queryParameterCount += 1;
    if (
      queryParameterCount > MAX_QUERY_PARAMETERS ||
      name.length === 0 ||
      utf8Length(name) > MAX_QUERY_NAME_BYTES ||
      utf8Length(value) > MAX_QUERY_VALUE_BYTES ||
      controlCharacterPattern.test(name) ||
      controlCharacterPattern.test(value) ||
      isSensitiveQueryName(name)
    ) {
      throw configurationError();
    }
  }

  return url;
}

function validateIdentifier(value: string, maximumLength: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    !safeHeaderValuePattern.test(value)
  ) {
    throw configurationError();
  }
  return value;
}

function validateEventType(value: string): string {
  if (
    typeof value !== "string" ||
    value.length > MAX_EVENT_TYPE_LENGTH ||
    !eventTypePattern.test(value)
  ) {
    throw configurationError();
  }
  return value;
}

function validateTimeout(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < MIN_TIMEOUT_MS ||
    value > MAX_TIMEOUT_MS
  ) {
    throw configurationError();
  }
  return value;
}

function validateSigningSecret(secret: string): Uint8Array {
  if (
    typeof secret !== "string" ||
    controlCharacterPattern.test(secret) ||
    secret.trim() !== secret
  ) {
    throw configurationError();
  }
  const bytes = textEncoder.encode(secret);
  if (
    bytes.byteLength < MIN_SECRET_BYTES ||
    bytes.byteLength > MAX_SECRET_BYTES
  ) {
    throw configurationError();
  }
  return bytes;
}

function validateTimestamp(timestamp: string): string {
  if (!/^\d{10}$/.test(timestamp)) throw configurationError();
  return timestamp;
}

/** Sign `timestamp + "." + body` using HMAC-SHA256 and return a v1 hex signature. */
export async function signWebhookPayload(
  signingSecret: string,
  timestamp: string,
  exactJsonBody: string | Uint8Array,
): Promise<string> {
  const secretBytes = validateSigningSecret(signingSecret);
  validateTimestamp(timestamp);
  const bodyBytes =
    typeof exactJsonBody === "string"
      ? textEncoder.encode(exactJsonBody)
      : exactJsonBody;
  if (
    !(bodyBytes instanceof Uint8Array) ||
    bodyBytes.byteLength > MAX_BODY_BYTES
  ) {
    throw payloadError();
  }

  const prefixBytes = textEncoder.encode(`${timestamp}.`);
  const signedBytes = new Uint8Array(
    prefixBytes.byteLength + bodyBytes.byteLength,
  );
  signedBytes.set(prefixBytes);
  signedBytes.set(bodyBytes, prefixBytes.byteLength);

  let signature: ArrayBuffer;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    signature = await crypto.subtle.sign("HMAC", key, signedBytes);
  } catch {
    throw configurationError();
  }
  const hex = Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `v1=${hex}`;
}

interface JsonBudget {
  nodes: number;
  estimatedBytes: number;
  seen: WeakSet<object>;
}

function addEstimatedBytes(budget: JsonBudget, value: string): void {
  budget.estimatedBytes += utf8Length(value);
  if (budget.estimatedBytes > MAX_BODY_BYTES) throw payloadError();
}

function normalizeJsonValue(
  value: unknown,
  budget: JsonBudget,
  depth: number,
): JsonValue {
  budget.nodes += 1;
  if (budget.nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) {
    throw payloadError();
  }

  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    addEstimatedBytes(budget, value);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw payloadError();
    return value;
  }
  if (typeof value !== "object") throw payloadError();
  if (budget.seen.has(value)) throw payloadError();
  budget.seen.add(value);

  let prototype: object | null;
  let descriptors: Record<string, PropertyDescriptor>;
  let symbols: symbol[];
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
    symbols = Object.getOwnPropertySymbols(value);
  } catch {
    throw payloadError();
  }
  if (symbols.length > 0) throw payloadError();

  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) throw payloadError();
    const lengthDescriptor = descriptors.length;
    const length = lengthDescriptor?.value;
    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > MAX_ARRAY_ITEMS
    ) {
      throw payloadError();
    }
    const output: JsonValue[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw payloadError();
      }
      output.push(normalizeJsonValue(descriptor.value, budget, depth + 1));
    }
    if (
      Object.keys(descriptors).some(
        (key) => key !== "length" && !/^0$|^[1-9]\d*$/.test(key),
      )
    ) {
      throw payloadError();
    }
    budget.seen.delete(value);
    return output;
  }

  if (prototype !== Object.prototype && prototype !== null) {
    throw payloadError();
  }

  const keys = Object.keys(descriptors);
  if (keys.length > MAX_OBJECT_PROPERTIES) throw payloadError();

  const output = Object.create(null) as Record<string, JsonValue>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable) continue;
    if (!("value" in descriptor)) throw payloadError();
    addEstimatedBytes(budget, key);
    output[key] = normalizeJsonValue(descriptor.value, budget, depth + 1);
  }
  budget.seen.delete(value);
  return output;
}

function createEnvelope(
  eventType: string,
  eventId: string,
  deliveryId: string,
  timestamp: string,
  payload: unknown,
): { body: string; bodyBytes: Uint8Array } {
  let data: JsonValue;
  try {
    data = normalizeJsonValue(
      payload,
      { nodes: 0, estimatedBytes: 0, seen: new WeakSet<object>() },
      0,
    );
  } catch (error) {
    if (error instanceof WebhookDeliveryError) throw error;
    throw payloadError();
  }
  const envelope: WebhookEnvelope = {
    specVersion: "1.0",
    eventType,
    eventId,
    deliveryId,
    sentAt: new Date(Number(timestamp) * 1_000).toISOString(),
    data,
  };
  let body: string;
  try {
    body = JSON.stringify(envelope);
  } catch {
    throw payloadError();
  }
  const bodyBytes = textEncoder.encode(body);
  if (bodyBytes.byteLength > MAX_BODY_BYTES) throw payloadError();
  return { body, bodyBytes };
}

function cancelResponseBody(response: Response): void {
  try {
    if (response.body) {
      void response.body.cancel().catch(() => undefined);
    }
  } catch {
    // The body is intentionally ignored, including cancellation failures.
  }
}

/** Send one signed webhook attempt. Delivery failures are returned as redacted errors. */
export async function sendWebhook(
  options: SendWebhookOptions,
): Promise<WebhookSendResult> {
  const destination = validateWebhookUrl(options.url, options.allowedHosts);
  const eventType = validateEventType(options.eventType);
  const eventId = validateIdentifier(options.eventId, MAX_IDENTIFIER_LENGTH);
  const deliveryId = validateIdentifier(
    options.deliveryId ?? crypto.randomUUID(),
    MAX_IDENTIFIER_LENGTH,
  );
  const timeoutMs = validateTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const timestamp = Math.floor(Date.now() / 1_000).toString();
  const { body, bodyBytes } = createEnvelope(
    eventType,
    eventId,
    deliveryId,
    timestamp,
    options.payload,
  );
  const signature = await signWebhookPayload(
    options.signingSecret,
    timestamp,
    bodyBytes,
  );

  const abortController = new AbortController();
  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      abortController.abort();
      reject(
        new WebhookDeliveryError(
          "timeout",
          "uncertain",
          "Webhook delivery timed out after it may have been accepted",
        ),
      );
    }, timeoutMs);
  });

  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== "function") {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    throw configurationError();
  }
  try {
    const operation = fetchImplementation.call(globalThis, destination, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        [WEBHOOK_TIMESTAMP_HEADER]: timestamp,
        [WEBHOOK_EVENT_HEADER]: eventType,
        [WEBHOOK_EVENT_ID_HEADER]: eventId,
        [WEBHOOK_DELIVERY_ID_HEADER]: deliveryId,
        [WEBHOOK_IDEMPOTENCY_HEADER]: deliveryId,
        [WEBHOOK_SIGNATURE_HEADER]: signature,
      },
      body,
      redirect: "error",
      signal: abortController.signal,
    });
    const response = await Promise.race([operation, timeout]);
    cancelResponseBody(response);

    if (response.status >= 200 && response.status < 300) {
      return { ok: true, status: response.status, eventId, deliveryId };
    }
    if (
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 429
    ) {
      throw new WebhookDeliveryError(
        "http_error",
        "definitive",
        `Webhook endpoint rejected the request with status ${response.status}`,
        response.status,
      );
    }
    throw new WebhookDeliveryError(
      "http_error",
      "retryable",
      `Webhook endpoint returned a retryable status ${response.status}`,
      response.status,
    );
  } catch (error) {
    if (error instanceof WebhookDeliveryError) throw error;
    if (timedOut || abortController.signal.aborted) {
      throw new WebhookDeliveryError(
        "timeout",
        "uncertain",
        "Webhook delivery timed out after it may have been accepted",
      );
    }
    throw new WebhookDeliveryError(
      "network_error",
      "uncertain",
      "Webhook delivery ended with an unknown network outcome",
    );
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}
