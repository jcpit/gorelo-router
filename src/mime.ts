import PostalMime, { decodeWords } from "postal-mime";
import type {
  AttachmentFacts,
  EmailFacts,
  RuntimeConfig,
  StoredRule,
} from "./types";
import { rulesNeedMime } from "./rules";

type InboundMessage = ForwardableEmailMessage;

const BLOCK_HTML_ELEMENTS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "td",
  "th",
  "tr",
  "ul",
]);

function headerRecord(headers: Headers): Record<string, string> {
  const result = Object.create(null) as Record<string, string>;
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

function domainFromAddress(address: string): string {
  const at = address.lastIndexOf("@");
  return at >= 0
    ? address
        .slice(at + 1)
        .trim()
        .toLowerCase()
    : "";
}

function localPartFromAddress(address: string): string {
  const at = address.lastIndexOf("@");
  return (at >= 0 ? address.slice(0, at) : address).trim().toLowerCase();
}

export function extractBasicEmailFacts(message: InboundMessage): EmailFacts {
  const headers = headerRecord(message.headers);
  return {
    envelopeFrom: message.from.trim().toLowerCase(),
    fromDomain: domainFromAddress(message.from),
    envelopeTo: message.to.trim().toLowerCase(),
    toLocalPart: localPartFromAddress(message.to),
    subject: decodeWords(headers.subject ?? ""),
    bodyText: "",
    headers,
    attachments: [],
    hasAttachments: false,
    messageId: headers["message-id"] ?? "",
    rawSize: message.rawSize,
    mimeParsed: false,
  };
}

function htmlToSearchableText(
  html: string,
  maxOutputCharacters: number,
  maxScanCharacters: number,
): string {
  const scanLimit = Math.min(
    html.length,
    Math.max(8_192, maxOutputCharacters * 4),
    maxScanCharacters,
  );
  let output = "";
  let tag = "";
  let inTag = false;
  let skippedElement: "script" | "style" | undefined;
  let lastWasSpace = false;

  const appendSpace = (): void => {
    if (!lastWasSpace && output.length > 0) {
      output += " ";
      lastWasSpace = true;
    }
  };

  for (let index = 0; index < scanLimit; index += 1) {
    const character = html[index]!;
    if (inTag) {
      if (character === ">") {
        const normalizedTag = tag.trim().toLowerCase();
        const tagMatch = /^\/?\s*([a-z0-9]+)/.exec(normalizedTag);
        const tagName = tagMatch?.[1];
        const closing = normalizedTag.startsWith("/");
        if (!closing && (tagName === "script" || tagName === "style")) {
          appendSpace();
          skippedElement = tagName;
        } else if (skippedElement && closing && tagName === skippedElement) {
          skippedElement = undefined;
          appendSpace();
        } else if (
          !skippedElement &&
          tagName &&
          BLOCK_HTML_ELEMENTS.has(tagName)
        ) {
          appendSpace();
        }
        inTag = false;
        tag = "";
      } else if (tag.length < 1_024) {
        tag += character;
      }
      continue;
    }

    if (character === "<") {
      inTag = true;
      continue;
    }
    if (skippedElement) {
      continue;
    }

    const isSpace = /\s/.test(character);
    if (isSpace) {
      if (!lastWasSpace && output.length > 0) {
        output += " ";
      }
      lastWasSpace = true;
    } else {
      output += character;
      lastWasSpace = false;
    }
    if (output.length >= maxOutputCharacters) {
      break;
    }
  }

  return output
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .trim()
    .slice(0, maxOutputCharacters);
}

function combineBodyAlternatives(
  plainText: string,
  htmlText: string,
  maximumCharacters: number,
): string {
  if (maximumCharacters === 0) return "";
  const plain = plainText.trim();
  const html = htmlText.trim();
  if (!plain) return html.slice(0, maximumCharacters);
  if (!html || html === plain) return plain.slice(0, maximumCharacters);

  const available = maximumCharacters - 1;
  if (available <= 0) return plain.slice(0, maximumCharacters);
  const initialShare = Math.floor(available / 2);
  let plainLength = Math.min(plain.length, initialShare);
  let htmlLength = Math.min(html.length, initialShare);
  let remaining = available - plainLength - htmlLength;

  const extraPlain = Math.min(plain.length - plainLength, remaining);
  plainLength += extraPlain;
  remaining -= extraPlain;
  htmlLength += Math.min(html.length - htmlLength, remaining);

  return `${plain.slice(0, plainLength)}\n${html.slice(0, htmlLength)}`;
}

function contentSize(content: string | ArrayBuffer | Uint8Array): number {
  if (typeof content === "string") {
    return new TextEncoder().encode(content).byteLength;
  }
  return content.byteLength;
}

export async function extractEmailFacts(
  message: InboundMessage,
  rules: readonly StoredRule[],
  config: RuntimeConfig,
  suppliedRaw?: ArrayBuffer,
): Promise<EmailFacts> {
  const basic = extractBasicEmailFacts(message);
  if (!rulesNeedMime(rules)) {
    return basic;
  }
  if (message.rawSize > config.maxParseBytes) {
    throw new Error(
      `Message requires MIME inspection but exceeds MAX_PARSE_BYTES (${message.rawSize} bytes)`,
    );
  }

  const raw = suppliedRaw ?? (await readRawMessage(message));
  const parsed = await PostalMime.parse(raw);
  const htmlText =
    typeof parsed.html === "string"
      ? htmlToSearchableText(
          parsed.html,
          config.maxBodyCharacters,
          config.maxHtmlScanCharacters,
        )
      : "";
  const parsedText = combineBodyAlternatives(
    parsed.text ?? "",
    htmlText,
    config.maxBodyCharacters,
  );
  const attachments = parsed.attachments.map((attachment) => ({
    filename: attachment.filename ?? "",
    mimeType: attachment.mimeType,
    size: contentSize(attachment.content),
  }));

  return {
    ...basic,
    subject: parsed.subject ?? basic.subject,
    bodyText: parsedText,
    attachments,
    hasAttachments: attachments.length > 0,
    mimeParsed: true,
  };
}

export async function readRawMessage(
  message: InboundMessage,
): Promise<ArrayBuffer> {
  return new Response(message.raw).arrayBuffer();
}

export async function inspectArchivedContent(
  raw: ArrayBuffer,
  config: RuntimeConfig,
): Promise<{
  bodyText: string;
  bodyTruncated: boolean;
  attachments: AttachmentFacts[];
}> {
  const parsed = await PostalMime.parse(raw);
  const htmlText =
    typeof parsed.html === "string"
      ? htmlToSearchableText(
          parsed.html,
          config.maxBodyCharacters,
          config.maxHtmlScanCharacters,
        )
      : "";
  const bodyText = combineBodyAlternatives(
    parsed.text ?? "",
    htmlText,
    config.maxBodyCharacters,
  );
  return {
    bodyText,
    bodyTruncated:
      bodyText.length >= config.maxBodyCharacters &&
      ((parsed.text?.length ?? 0) > bodyText.length ||
        (typeof parsed.html === "string" &&
          parsed.html.length > htmlText.length)),
    attachments: parsed.attachments.map((attachment) => ({
      filename: attachment.filename ?? "",
      mimeType: attachment.mimeType,
      size: contentSize(attachment.content),
    })),
  };
}
