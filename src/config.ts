import type {
  ArchiveMode,
  Env,
  GoreloRegion,
  QuarantineMode,
  RuntimeConfig,
  SpamAction,
} from "./types";
import { parseAllowedWebhookHosts, WebhookDeliveryError } from "./webhooks";

const LOCAL_PART_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i;
const DOMAIN_LABEL_PATTERN = /^[A-Z0-9-]+$/i;
const MAX_CLOUDFLARE_MESSAGE_BYTES = 25 * 1024 * 1024;
const GORELO_API_ENDPOINTS = new Map<string, GoreloRegion>([
  ["https://api.aue.gorelo.io", "aue"],
  ["https://api.usw.gorelo.io", "usw"],
]);

export class ConfigurationError extends Error {
  override readonly name = "ConfigurationError";
}

function isValidEmailAddress(value: string): boolean {
  if (value.length > 254) return false;
  const at = value.lastIndexOf("@");
  if (at <= 0 || value.indexOf("@") !== at) return false;

  const localPart = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (
    localPart.length > 64 ||
    !LOCAL_PART_PATTERN.test(localPart) ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..")
  ) {
    return false;
  }

  const labels = domain.split(".");
  return (
    domain.length <= 253 &&
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

function isValidEmailDomain(value: string): boolean {
  const labels = value.split(".");
  return (
    value.length <= 253 &&
    labels.length >= 2 &&
    /[a-z]/i.test(labels.at(-1) ?? "") &&
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

function emailDomain(address: string): string {
  return address.slice(address.lastIndexOf("@") + 1);
}

function normalizedEmail(
  value: string | undefined,
  name: string,
): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (!isValidEmailAddress(normalized)) {
    throw new ConfigurationError(`${name} must be a valid email address`);
  }
  return normalized;
}

function integerSetting(
  value: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ConfigurationError(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return parsed;
}

function csv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function booleanSetting(value: string | undefined, fallback: boolean, label: string): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new ConfigurationError(`${label} must be true or false`);
}

function enumSetting<const T extends string>(
  value: string | undefined,
  fallback: T,
  name: string,
  allowed: readonly T[],
): T {
  const normalized = (value ?? fallback).trim().toLowerCase();
  if (!allowed.some((candidate) => candidate === normalized)) {
    throw new ConfigurationError(
      `${name} must be one of: ${allowed.join(", ")}`,
    );
  }
  return normalized as T;
}

function goreloEndpoint(value: string | undefined): {
  baseUrl: string;
  region: GoreloRegion;
} {
  const configured = value?.trim() || "https://api.aue.gorelo.io";
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new ConfigurationError(
      "GORELO_API_BASE_URL must be an approved Gorelo API endpoint",
    );
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new ConfigurationError(
      "GORELO_API_BASE_URL must not contain credentials, a path, query, or fragment",
    );
  }
  const baseUrl = parsed.origin.toLowerCase();
  const region = GORELO_API_ENDPOINTS.get(baseUrl);
  if (!region) {
    throw new ConfigurationError(
      "GORELO_API_BASE_URL must be https://api.aue.gorelo.io or https://api.usw.gorelo.io",
    );
  }
  return { baseUrl, region };
}

function webhookHosts(value: string | undefined): ReadonlySet<string> {
  if (!value?.trim()) return new Set<string>();
  try {
    return parseAllowedWebhookHosts(value);
  } catch (error) {
    if (error instanceof WebhookDeliveryError) {
      throw new ConfigurationError(
        "ALLOWED_WEBHOOK_HOSTS must contain exact public DNS hostnames separated by commas",
      );
    }
    throw error;
  }
}

function webhookSigningConfigured(value: string | undefined): boolean {
  if (value === undefined || value.length === 0) return false;
  const byteLength = new TextEncoder().encode(value).byteLength;
  if (
    byteLength < 32 ||
    byteLength > 4_096 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new ConfigurationError(
      "WEBHOOK_SIGNING_SECRET must be between 32 and 4096 bytes without whitespace padding or control characters",
    );
  }
  return true;
}

export function loadConfig(env: Env): RuntimeConfig {
  const gorelo = goreloEndpoint(env.GORELO_API_BASE_URL);
  const allowedWebhookHosts = webhookHosts(env.ALLOWED_WEBHOOK_HOSTS);
  const defaultGoreloAddress = normalizedEmail(
    env.DEFAULT_GORELO_ADDRESS,
    "DEFAULT_GORELO_ADDRESS",
  );
  if (!defaultGoreloAddress) {
    throw new ConfigurationError("DEFAULT_GORELO_ADDRESS is required");
  }

  const inboundEmailDomains = new Set(csv(env.INBOUND_EMAIL_DOMAINS));
  for (const domain of inboundEmailDomains) {
    if (!isValidEmailDomain(domain)) {
      throw new ConfigurationError(
        `INBOUND_EMAIL_DOMAINS contains an invalid domain: ${domain}`,
      );
    }
  }

  const quarantineAddress = normalizedEmail(
    env.QUARANTINE_ADDRESS,
    "QUARANTINE_ADDRESS",
  );
  const configuredFailureAddress = normalizedEmail(
    env.FAILURE_FORWARD_ADDRESS,
    "FAILURE_FORWARD_ADDRESS",
  );
  const releaseFromAddress = normalizedEmail(
    env.RELEASE_FROM_ADDRESS,
    "RELEASE_FROM_ADDRESS",
  );
  const failureForwardAddress = configuredFailureAddress ?? quarantineAddress;
  const quarantineMode = enumSetting<QuarantineMode>(
    env.QUARANTINE_MODE,
    "mailbox",
    "QUARANTINE_MODE",
    ["internal", "mailbox"],
  );
  const archiveMode = enumSetting<ArchiveMode>(
    env.ARCHIVE_MODE,
    "quarantine",
    "ARCHIVE_MODE",
    ["none", "quarantine", "all"],
  );

  const spamActionValue = (env.SPAM_ACTION ?? "forward").trim().toLowerCase();
  if (!["forward", "quarantine", "drop", "reject"].includes(spamActionValue)) {
    throw new ConfigurationError(
      "SPAM_ACTION must be forward, quarantine, drop, or reject",
    );
  }
  const spamAction = spamActionValue as SpamAction;
  const defaultActionValue = (env.DEFAULT_ACTION ?? "forward").trim().toLowerCase();
  if (!["forward", "quarantine", "drop", "reject"].includes(defaultActionValue)) {
    throw new ConfigurationError(
      "DEFAULT_ACTION must be forward, quarantine, drop, or reject",
    );
  }
  const defaultAction = defaultActionValue as SpamAction;
  if (
    spamAction === "quarantine" &&
    quarantineMode === "mailbox" &&
    !quarantineAddress
  ) {
    throw new ConfigurationError(
      "QUARANTINE_ADDRESS is required when SPAM_ACTION is quarantine",
    );
  }
  if (
    defaultAction === "quarantine" &&
    quarantineMode === "mailbox" &&
    !quarantineAddress
  ) {
    throw new ConfigurationError(
      "QUARANTINE_ADDRESS is required when DEFAULT_ACTION is quarantine in mailbox mode",
    );
  }

  const allowedForwardDestinations = new Set(
    csv(env.ALLOWED_FORWARD_DESTINATIONS),
  );
  const allowedForwardDomains = new Set(csv(env.ALLOWED_FORWARD_DOMAINS));
  allowedForwardDomains.add(emailDomain(defaultGoreloAddress));
  allowedForwardDestinations.add(defaultGoreloAddress);
  if (failureForwardAddress) {
    allowedForwardDestinations.add(failureForwardAddress);
  }
  if (quarantineAddress) {
    allowedForwardDestinations.add(quarantineAddress);
  }

  for (const destination of allowedForwardDestinations) {
    if (!isValidEmailAddress(destination)) {
      throw new ConfigurationError(
        `ALLOWED_FORWARD_DESTINATIONS contains an invalid address: ${destination}`,
      );
    }
  }

  for (const domain of allowedForwardDomains) {
    if (!isValidEmailDomain(domain)) {
      throw new ConfigurationError(
        `ALLOWED_FORWARD_DOMAINS contains an invalid domain: ${domain}`,
      );
    }
  }

  return {
    defaultGoreloAddress,
    inboundEmailDomains,
    ...(quarantineAddress ? { quarantineAddress } : {}),
    ...(failureForwardAddress ? { failureForwardAddress } : {}),
    ...(releaseFromAddress ? { releaseFromAddress } : {}),
    quarantineMode,
    archiveMode,
    allowedForwardDomains,
    allowedForwardDestinations,
    spamThreshold: integerSetting(
      env.SPAM_THRESHOLD,
      5,
      "SPAM_THRESHOLD",
      0,
      8,
    ),
    spamAction,
    defaultAction,
    spamKeywords: csv(env.SPAM_KEYWORDS),
    trustedSenderDomains: new Set(csv(env.TRUSTED_SENDER_DOMAINS)),
    maxParseBytes: integerSetting(
      env.MAX_PARSE_BYTES,
      10 * 1024 * 1024,
      "MAX_PARSE_BYTES",
      0,
      MAX_CLOUDFLARE_MESSAGE_BYTES,
    ),
    maxBodyCharacters: integerSetting(
      env.MAX_BODY_CHARACTERS,
      200_000,
      "MAX_BODY_CHARACTERS",
      0,
      1_000_000,
    ),
    maxHtmlScanCharacters: integerSetting(
      env.MAX_HTML_SCAN_CHARACTERS,
      500_000,
      "MAX_HTML_SCAN_CHARACTERS",
      8_192,
      2_000_000,
    ),
    eventRetentionDays: integerSetting(
      env.EVENT_RETENTION_DAYS,
      30,
      "EVENT_RETENTION_DAYS",
      1,
      365,
    ),
    goreloApiBaseUrl: gorelo.baseUrl,
    goreloRegion: gorelo.region,
    goreloApiConfigured: Boolean(env.GORELO_API_KEY?.trim()),
    goreloCatalogCacheSeconds: integerSetting(
      env.GORELO_CATALOG_CACHE_SECONDS,
      300,
      "GORELO_CATALOG_CACHE_SECONDS",
      60,
      3_600,
    ),
    allowedWebhookHosts,
    webhookSigningConfigured: webhookSigningConfigured(
      env.WEBHOOK_SIGNING_SECRET,
    ),
    webhookTimeoutMs: integerSetting(
      env.WEBHOOK_TIMEOUT_MS,
      8_000,
      "WEBHOOK_TIMEOUT_MS",
      50,
      30_000,
    ),
    postmarkSpamcheckEnabled: booleanSetting(
      env.POSTMARK_SPAMCHECK_ENABLED,
      false,
      "POSTMARK_SPAMCHECK_ENABLED",
    ),
    postmarkSpamcheckUnknownSendersOnly: booleanSetting(
      env.POSTMARK_SPAMCHECK_UNKNOWN_SENDERS_ONLY,
      true,
      "POSTMARK_SPAMCHECK_UNKNOWN_SENDERS_ONLY",
    ),
    postmarkSpamcheckTimeoutMs: integerSetting(
      env.POSTMARK_SPAMCHECK_TIMEOUT_MS,
      3_000,
      "POSTMARK_SPAMCHECK_TIMEOUT_MS",
      250,
      10_000,
    ),
  };
}

/** Named mailboxes may use an exact address override or any local part on an approved domain. */
export function isAllowedMailboxDestination(
  address: string,
  config: Pick<
    RuntimeConfig,
    "allowedForwardDestinations" | "allowedForwardDomains"
  >,
): boolean {
  const normalized = address.trim().toLowerCase();
  return (
    isValidEmailAddress(normalized) &&
    (config.allowedForwardDestinations.has(normalized) ||
      config.allowedForwardDomains.has(emailDomain(normalized)))
  );
}
