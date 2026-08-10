import {
  extractWebhookVariables,
  type WebhookExtractionField,
} from "./extraction";
import type { EmailFacts } from "./types";
import type { ExtractionInferenceInput } from "./validation";

export type TemplateInferenceConfidence = "high" | "medium" | "low";

export type TemplateInferenceErrorCode =
  | "empty_selection"
  | "selection_too_large"
  | "unsupported_context"
  | "verification_failed";

export class TemplateInferenceError extends Error {
  override readonly name = "TemplateInferenceError";

  constructor(readonly code: TemplateInferenceErrorCode) {
    super("Unable to infer a safe extraction template");
  }
}

export interface TemplateInferenceResult {
  field: WebhookExtractionField;
  value: string;
  confidence: TemplateInferenceConfidence;
  warnings: string[];
}

const MAX_MARKER_CODE_UNITS = 256;
const MAX_OCCURRENCE = 1_000;
const MAX_OUTPUT_CHARACTERS = 4_000;
const DEFAULT_OUTPUT_CHARACTERS = 1_000;
const UNSAFE_MARKER_CHARACTERS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function fail(code: TemplateInferenceErrorCode): never {
  throw new TemplateInferenceError(code);
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
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

function isSafeMarker(value: string): boolean {
  if (!value || UNSAFE_MARKER_CHARACTERS.test(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function normalizedOffset(sample: string, offset: number): number {
  return normalizeLineEndings(sample.slice(0, offset)).length;
}

function avoidSplitSurrogate(value: string, index: number): number {
  if (index <= 0 || index >= value.length) return index;
  const current = value.charCodeAt(index);
  const previous = value.charCodeAt(index - 1);
  return current >= 0xdc00 &&
    current <= 0xdfff &&
    previous >= 0xd800 &&
    previous <= 0xdbff
    ? index + 1
    : index;
}

function startMarkerFor(
  sample: string,
  selectionStart: number,
): {
  marker?: string;
  occurrence?: number;
  truncated: boolean;
  weak: boolean;
} {
  if (selectionStart === 0) return { truncated: false, weak: false };

  const previousLineBreak = sample.lastIndexOf("\n", selectionStart - 1);
  let markerStart = previousLineBreak + 1;
  if (markerStart === selectionStart && previousLineBreak >= 0) {
    markerStart = previousLineBreak;
  }
  const unboundedStart = markerStart;
  if (selectionStart - markerStart > MAX_MARKER_CODE_UNITS) {
    markerStart = avoidSplitSurrogate(
      sample,
      selectionStart - MAX_MARKER_CODE_UNITS,
    );
  }

  let marker = sample.slice(markerStart, selectionStart);
  if (!marker) {
    markerStart = avoidSplitSurrogate(sample, selectionStart - 1);
    marker = sample.slice(markerStart, selectionStart);
  }
  if (!isSafeMarker(marker)) {
    return fail("unsupported_context");
  }

  const haystack = asciiFold(sample);
  const needle = asciiFold(marker);
  let offset = 0;
  let occurrence = 0;
  let foundTarget = false;
  while (occurrence < MAX_OCCURRENCE) {
    const index = haystack.indexOf(needle, offset);
    if (index < 0 || index > markerStart) break;
    occurrence += 1;
    if (index === markerStart) {
      foundTarget = true;
      break;
    }
    offset = index + needle.length;
  }
  if (!foundTarget) return fail("unsupported_context");

  return {
    marker,
    ...(occurrence > 1 ? { occurrence } : {}),
    truncated: markerStart !== unboundedStart,
    weak: marker.trim().length < 2,
  };
}

function isExactEndMarker(
  foldedSelectionAndSuffix: string,
  selectedLength: number,
  marker: string,
): boolean {
  return foldedSelectionAndSuffix.indexOf(asciiFold(marker)) === selectedLength;
}

function rightMarkerPreferredLengths(suffix: string): number[] {
  const lengths = new Set<number>();
  const first = suffix[0];
  if (first === "\n" || first === "\t" || ";|,".includes(first ?? "")) {
    lengths.add(1);
  }

  const structuredPrefix = /^\s*[^\s\r\n]{1,48}[:=]\s*/.exec(suffix)?.[0];
  if (structuredPrefix) lengths.add(structuredPrefix.length);

  const tokenPrefix = /^\s*[^\s\r\n]{1,48}/.exec(suffix)?.[0];
  if (tokenPrefix) lengths.add(tokenPrefix.length);

  const newline = suffix.indexOf("\n");
  if (newline >= 0 && newline < MAX_MARKER_CODE_UNITS) {
    lengths.add(newline + 1);
  }
  return [...lengths].filter(
    (length) => length > 0 && length <= MAX_MARKER_CODE_UNITS,
  );
}

function endMarkerFor(
  sample: string,
  selectionStart: number,
  selectionEnd: number,
): { marker?: string; weak: boolean } {
  if (selectionEnd === sample.length) return { weak: false };
  const suffix = sample.slice(selectionEnd);
  const maximum = Math.min(MAX_MARKER_CODE_UNITS, suffix.length);
  const foldedSelectionAndSuffix = asciiFold(sample.slice(selectionStart));
  const selectedLength = selectionEnd - selectionStart;

  for (const length of rightMarkerPreferredLengths(suffix)) {
    const marker = suffix.slice(0, length);
    if (
      isSafeMarker(marker) &&
      isExactEndMarker(foldedSelectionAndSuffix, selectedLength, marker)
    ) {
      return {
        marker,
        weak:
          !["\n", "\t", ";", "|", ","].includes(marker) &&
          marker.trim().length < 2,
      };
    }
  }

  for (let length = 1; length <= maximum; length += 1) {
    const marker = suffix.slice(0, length);
    if (
      isSafeMarker(marker) &&
      isExactEndMarker(foldedSelectionAndSuffix, selectedLength, marker)
    ) {
      return { marker, weak: true };
    }
  }
  return fail("unsupported_context");
}

function factsFor(
  source: ExtractionInferenceInput["source"],
  sample: string,
): EmailFacts {
  return {
    envelopeFrom: source === "from" ? sample : "",
    fromDomain: "",
    envelopeTo: source === "to" ? sample : "",
    toLocalPart: "",
    subject: source === "subject" ? sample : "",
    bodyText: source === "body_text" ? sample : "",
    headers: {},
    attachments: [],
    hasAttachments: false,
    messageId: "",
    rawSize: new TextEncoder().encode(sample).byteLength,
    mimeParsed: true,
  };
}

function lowerConfidence(
  current: TemplateInferenceConfidence,
  next: TemplateInferenceConfidence,
): TemplateInferenceConfidence {
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return rank[next] > rank[current] ? next : current;
}

export function inferExtractionTemplate(
  input: ExtractionInferenceInput,
): TemplateInferenceResult {
  const sample = normalizeLineEndings(input.sample);
  let selectionStart = normalizedOffset(input.sample, input.selectionStart);
  let selectionEnd = normalizedOffset(input.sample, input.selectionEnd);
  const selected = sample.slice(selectionStart, selectionEnd);
  const leadingWhitespace = /^\s*/u.exec(selected)?.[0].length ?? 0;
  const trailingWhitespace = /\s*$/u.exec(selected)?.[0].length ?? 0;
  selectionStart += leadingWhitespace;
  selectionEnd -= trailingWhitespace;
  if (selectionStart >= selectionEnd) return fail("empty_selection");

  const value = sample.slice(selectionStart, selectionEnd);
  const valueCharacters = [...value].length;
  if (valueCharacters > MAX_OUTPUT_CHARACTERS) {
    return fail("selection_too_large");
  }

  const start = startMarkerFor(sample, selectionStart);
  const end = endMarkerFor(sample, selectionStart, selectionEnd);
  const field: WebhookExtractionField = {
    key: input.key,
    source: input.source,
    ...(start.marker ? { startAfter: start.marker } : {}),
    ...(end.marker ? { endBefore: end.marker } : {}),
    ...(start.occurrence ? { occurrence: start.occurrence } : {}),
    required: true,
    ...(valueCharacters > DEFAULT_OUTPUT_CHARACTERS
      ? { maxCharacters: valueCharacters }
      : {}),
  };

  let extracted: string;
  try {
    extracted = extractWebhookVariables(factsFor(input.source, sample), [
      field,
    ])[input.key]!;
  } catch {
    return fail("verification_failed");
  }
  if (extracted !== value) return fail("verification_failed");

  const warnings: string[] = [];
  let confidence: TemplateInferenceConfidence = "high";
  if (leadingWhitespace > 0 || trailingWhitespace > 0) {
    warnings.push("Leading or trailing selection whitespace was excluded.");
    confidence = lowerConfidence(confidence, "medium");
  }
  if (start.occurrence && start.occurrence > 1) {
    warnings.push(
      `The start marker repeats; occurrence ${start.occurrence} is pinned. Test another sample before enabling the rule.`,
    );
    confidence = lowerConfidence(confidence, "medium");
  }
  if (start.truncated) {
    warnings.push(
      "Only the nearest 256 characters could be used as the start marker.",
    );
    confidence = lowerConfidence(confidence, "low");
  }
  if (start.weak || end.weak) {
    warnings.push(
      "The surrounding boundary is weak. Test another representative sample before enabling the rule.",
    );
    confidence = lowerConfidence(confidence, "low");
  }

  return { field, value, confidence, warnings };
}
