import type { EmailFacts } from "./types";

export type WebhookExtractionSource =
  | "from"
  | "from_domain"
  | "to"
  | "to_local_part"
  | "subject"
  | "body_text"
  | "message_id"
  | "header"
  | "literal";

export interface WebhookExtractionField {
  key: string;
  source: WebhookExtractionSource;
  headerName?: string | undefined;
  value?: string | undefined;
  startAfter?: string | undefined;
  endBefore?: string | undefined;
  occurrence?: number | undefined;
  caseSensitive?: boolean | undefined;
  required?: boolean | undefined;
  defaultValue?: string | undefined;
  maxCharacters?: number | undefined;
}

export type WebhookExtractionErrorCode =
  | "invalid_email"
  | "too_many_fields"
  | "invalid_field"
  | "invalid_key"
  | "duplicate_key"
  | "invalid_source"
  | "invalid_option"
  | "invalid_header_name"
  | "invalid_literal"
  | "invalid_marker"
  | "invalid_occurrence"
  | "invalid_default"
  | "invalid_max_characters"
  | "source_too_large"
  | "required_value_missing"
  | "output_too_large";

/**
 * A deliberately redacted extraction error. Its public fields and message
 * contain only a safe field identifier and a stable error code.
 */
export class WebhookExtractionError extends Error {
  override readonly name = "WebhookExtractionError";

  constructor(
    readonly code: WebhookExtractionErrorCode,
    readonly fieldKey: string,
  ) {
    super(`Webhook extraction ${code} [${fieldKey}]`);
  }
}

const MAX_FIELDS = 50;
const MAX_KEY_CHARACTERS = 64;
const MAX_HEADER_NAME_CHARACTERS = 128;
const MAX_MARKER_CHARACTERS = 256;
const DEFAULT_OUTPUT_CHARACTERS = 1_000;
const MAX_OUTPUT_CHARACTERS = 4_000;
const MAX_SOURCE_CHARACTERS = 1_000_000;
const MAX_HEADERS = 1_000;
const MAX_HEADER_CHARACTERS = 1_000_000;
// Leave room for the delivery envelope and optional resolved-client metadata
// inside the 64 KiB durable payload snapshot.
const MAX_OUTPUT_JSON_BYTES = 60 * 1024;

const extractionSources = new Set<WebhookExtractionSource>([
  "from",
  "from_domain",
  "to",
  "to_local_part",
  "subject",
  "body_text",
  "message_id",
  "header",
  "literal",
]);

const allowedFieldProperties = new Set([
  "key",
  "source",
  "headerName",
  "value",
  "startAfter",
  "endBefore",
  "occurrence",
  "caseSensitive",
  "required",
  "defaultValue",
  "maxCharacters",
]);

const forbiddenObjectKeys = new Set(["__proto__", "constructor", "prototype"]);
const textEncoder = new TextEncoder();

function fail(code: WebhookExtractionErrorCode, fieldKey: string): never {
  throw new WebhookExtractionError(code, fieldKey);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAsciiLetter(character: string): boolean {
  const code = character.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isAsciiDigit(character: string): boolean {
  const code = character.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isSafeKey(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_KEY_CHARACTERS ||
    forbiddenObjectKeys.has(value.toLowerCase())
  ) {
    return false;
  }

  const first = value[0]!;
  if (first !== "_" && !isAsciiLetter(first)) {
    return false;
  }

  for (let index = 1; index < value.length; index += 1) {
    const character = value[index]!;
    if (
      character !== "_" &&
      !isAsciiLetter(character) &&
      !isAsciiDigit(character)
    ) {
      return false;
    }
  }
  return true;
}

function safeErrorKey(field: unknown): string {
  if (!isRecord(field)) {
    return "<invalid>";
  }
  try {
    return isSafeKey(field.key) ? field.key : "<invalid>";
  } catch {
    return "<invalid>";
  }
}

function isHeaderTokenCharacter(character: string): boolean {
  if (isAsciiLetter(character) || isAsciiDigit(character)) {
    return true;
  }
  return "!#$%&'*+-.^_`|~".includes(character);
}

function isValidHeaderName(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_HEADER_NAME_CHARACTERS
  ) {
    return false;
  }
  for (const character of value) {
    if (!isHeaderTokenCharacter(character)) {
      return false;
    }
  }
  return true;
}

function hasAtMostCharacters(value: string, maximum: number): boolean {
  if (value.length > maximum * 2) {
    return false;
  }
  let characters = 0;
  for (const _character of value) {
    characters += 1;
    if (characters > maximum) {
      return false;
    }
  }
  return true;
}

function validateBoundedString(
  value: unknown,
  maximum: number,
  allowEmpty: boolean,
): value is string {
  return (
    typeof value === "string" &&
    (allowEmpty || value.length > 0) &&
    hasAtMostCharacters(value, maximum)
  );
}

function asciiFold(value: string): string {
  let result = "";
  let unchangedStart = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 65 && code <= 90) {
      result += value.slice(unchangedStart, index);
      result += String.fromCharCode(code + 32);
      unchangedStart = index + 1;
    }
  }
  return result.length === 0 ? value : result + value.slice(unchangedStart);
}

function markerIndex(
  value: string,
  marker: string,
  caseSensitive: boolean,
  occurrence = 1,
): number {
  const haystack = caseSensitive ? value : asciiFold(value);
  const needle = caseSensitive ? marker : asciiFold(marker);
  let offset = 0;
  for (let current = 1; current <= occurrence; current += 1) {
    const index = haystack.indexOf(needle, offset);
    if (index < 0) return -1;
    if (current === occurrence) return index;
    offset = index + needle.length;
  }
  return -1;
}

function truncateCharacters(value: string, maximum: number): string {
  if (value.length <= maximum) {
    return value;
  }

  let codeUnits = 0;
  let characters = 0;
  while (codeUnits < value.length && characters < maximum) {
    const codePoint = value.codePointAt(codeUnits)!;
    codeUnits += codePoint > 0xffff ? 2 : 1;
    characters += 1;
  }
  return value.slice(0, codeUnits);
}

interface ValidatedField {
  key: string;
  source: WebhookExtractionSource;
  headerName?: string;
  value?: string;
  startAfter?: string;
  endBefore?: string;
  occurrence: number;
  caseSensitive: boolean;
  required: boolean;
  defaultValue?: string;
  maxCharacters: number;
}

function validateField(field: unknown, seenKeys: Set<string>): ValidatedField {
  const errorKey = safeErrorKey(field);
  if (!isRecord(field)) {
    return fail("invalid_field", errorKey);
  }
  for (const property of Object.keys(field)) {
    if (!allowedFieldProperties.has(property)) {
      return fail("invalid_option", errorKey);
    }
  }
  if (!isSafeKey(field.key)) {
    return fail("invalid_key", errorKey);
  }
  const key = field.key;
  if (seenKeys.has(key)) {
    return fail("duplicate_key", key);
  }
  seenKeys.add(key);

  if (
    typeof field.source !== "string" ||
    !extractionSources.has(field.source as WebhookExtractionSource)
  ) {
    return fail("invalid_source", key);
  }
  const source = field.source as WebhookExtractionSource;

  if (
    field.caseSensitive !== undefined &&
    typeof field.caseSensitive !== "boolean"
  ) {
    return fail("invalid_option", key);
  }
  if (field.required !== undefined && typeof field.required !== "boolean") {
    return fail("invalid_option", key);
  }

  if (
    field.startAfter !== undefined &&
    !validateBoundedString(field.startAfter, MAX_MARKER_CHARACTERS, false)
  ) {
    return fail("invalid_marker", key);
  }
  if (
    field.endBefore !== undefined &&
    !validateBoundedString(field.endBefore, MAX_MARKER_CHARACTERS, false)
  ) {
    return fail("invalid_marker", key);
  }
  let occurrence = 1;
  if (field.occurrence !== undefined) {
    if (
      typeof field.occurrence !== "number" ||
      !Number.isInteger(field.occurrence) ||
      field.occurrence < 1 ||
      field.occurrence > 1_000 ||
      field.startAfter === undefined
    ) {
      return fail("invalid_occurrence", key);
    }
    occurrence = field.occurrence;
  }
  if (
    field.defaultValue !== undefined &&
    !validateBoundedString(field.defaultValue, MAX_OUTPUT_CHARACTERS, true)
  ) {
    return fail("invalid_default", key);
  }

  let maxCharacters = DEFAULT_OUTPUT_CHARACTERS;
  if (field.maxCharacters !== undefined) {
    if (
      typeof field.maxCharacters !== "number" ||
      !Number.isInteger(field.maxCharacters) ||
      field.maxCharacters < 1 ||
      field.maxCharacters > MAX_OUTPUT_CHARACTERS
    ) {
      return fail("invalid_max_characters", key);
    }
    maxCharacters = field.maxCharacters;
  }

  if (source === "header") {
    if (!isValidHeaderName(field.headerName)) {
      return fail("invalid_header_name", key);
    }
    if (field.value !== undefined) {
      return fail("invalid_option", key);
    }
  } else if (source === "literal") {
    if (!validateBoundedString(field.value, MAX_OUTPUT_CHARACTERS, true)) {
      return fail("invalid_literal", key);
    }
    if (field.headerName !== undefined) {
      return fail("invalid_option", key);
    }
  } else if (field.headerName !== undefined || field.value !== undefined) {
    return fail("invalid_option", key);
  }

  return {
    key,
    source,
    ...(source === "header" ? { headerName: field.headerName as string } : {}),
    ...(source === "literal" ? { value: field.value as string } : {}),
    ...(field.startAfter === undefined
      ? {}
      : { startAfter: field.startAfter as string }),
    ...(field.endBefore === undefined
      ? {}
      : { endBefore: field.endBefore as string }),
    occurrence,
    caseSensitive: field.caseSensitive === true,
    required: field.required === true,
    ...(field.defaultValue === undefined
      ? {}
      : { defaultValue: field.defaultValue as string }),
    maxCharacters,
  };
}

function checkedSource(value: unknown, key: string): string {
  if (typeof value !== "string") {
    return fail("invalid_email", key);
  }
  if (value.length > MAX_SOURCE_CHARACTERS) {
    return fail("source_too_large", key);
  }
  return value;
}

function sourceValue(
  email: EmailFacts,
  field: ValidatedField,
  readHeader: (name: string, key: string) => string | undefined,
): string | undefined {
  switch (field.source) {
    case "from":
      return checkedSource(email.envelopeFrom, field.key);
    case "from_domain":
      return checkedSource(email.fromDomain, field.key);
    case "to":
      return checkedSource(email.envelopeTo, field.key);
    case "to_local_part":
      return checkedSource(email.toLocalPart, field.key);
    case "subject":
      return checkedSource(email.subject, field.key);
    case "body_text":
      return checkedSource(email.bodyText, field.key);
    case "message_id":
      return checkedSource(email.messageId, field.key);
    case "header":
      return readHeader(field.headerName!, field.key);
    case "literal":
      return field.value!;
  }
}

function applyMarkers(
  source: string,
  field: ValidatedField,
): string | undefined {
  let selected = source;
  if (field.startAfter !== undefined) {
    const start = markerIndex(
      selected,
      field.startAfter,
      field.caseSensitive,
      field.occurrence,
    );
    if (start < 0) {
      return undefined;
    }
    selected = selected.slice(start + field.startAfter.length);
  }
  if (field.endBefore !== undefined) {
    const end = markerIndex(selected, field.endBefore, field.caseSensitive);
    if (end < 0) {
      return undefined;
    }
    selected = selected.slice(0, end);
  }
  return selected.trim();
}

/**
 * Extracts a bounded JSON-safe variable map without evaluating templates or
 * caller-provided regular expressions.
 */
export function extractWebhookVariables(
  email: EmailFacts,
  fields: readonly WebhookExtractionField[],
): Record<string, string> {
  if (!isRecord(email)) {
    return fail("invalid_email", "<email>");
  }
  if (!Array.isArray(fields)) {
    return fail("invalid_field", "<fields>");
  }
  if (fields.length > MAX_FIELDS) {
    return fail("too_many_fields", "<fields>");
  }

  const seenKeys = new Set<string>();
  const validatedFields = fields.map((field) => validateField(field, seenKeys));
  const result: Record<string, string> = {};

  let normalizedHeaders: Map<string, string> | undefined;
  const readHeader = (name: string, key: string): string | undefined => {
    if (normalizedHeaders === undefined) {
      if (!isRecord(email.headers)) {
        return fail("invalid_email", key);
      }
      const entries = Object.entries(email.headers);
      if (entries.length > MAX_HEADERS) {
        return fail("source_too_large", key);
      }
      normalizedHeaders = new Map<string, string>();
      let headerCharacters = 0;
      for (const [headerName, headerValue] of entries) {
        if (typeof headerValue !== "string") {
          return fail("invalid_email", key);
        }
        headerCharacters += headerName.length + headerValue.length;
        if (
          headerValue.length > MAX_SOURCE_CHARACTERS ||
          headerCharacters > MAX_HEADER_CHARACTERS
        ) {
          return fail("source_too_large", key);
        }
        normalizedHeaders.set(asciiFold(headerName), headerValue);
      }
    }
    return normalizedHeaders.get(asciiFold(name));
  };

  for (const field of validatedFields) {
    try {
      const source = sourceValue(email, field, readHeader);
      let value =
        source === undefined ? undefined : applyMarkers(source, field);
      if (value === undefined || value.length === 0) {
        value = field.defaultValue?.trim();
      }
      if (value === undefined) {
        if (field.required) {
          return fail("required_value_missing", field.key);
        }
        value = "";
      }
      result[field.key] = truncateCharacters(value, field.maxCharacters);
      if (
        textEncoder.encode(JSON.stringify(result)).byteLength >
        MAX_OUTPUT_JSON_BYTES
      ) {
        return fail("output_too_large", field.key);
      }
    } catch (error) {
      if (error instanceof WebhookExtractionError) {
        throw error;
      }
      return fail("invalid_email", field.key);
    }
  }

  return result;
}
