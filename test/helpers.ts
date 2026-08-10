import type { EvaluatedEmail, RuntimeConfig, StoredRule } from "../src/types";
import { ruleInputSchema, type RuleInputData } from "../src/validation";

export function config(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  const defaultAddress = "tickets@gorelo.example";
  const quarantineAddress = "quarantine@example.com";
  return {
    defaultGoreloAddress: defaultAddress,
    quarantineAddress,
    failureForwardAddress: quarantineAddress,
    quarantineMode: "mailbox",
    archiveMode: "quarantine",
    allowedForwardDestinations: new Set([defaultAddress, quarantineAddress]),
    allowedForwardDomains: new Set(["gorelo.example"]),
    spamThreshold: 5,
    spamAction: "quarantine",
    spamKeywords: [],
    trustedSenderDomains: new Set(),
    maxParseBytes: 10 * 1024 * 1024,
    maxBodyCharacters: 200_000,
    maxHtmlScanCharacters: 500_000,
    eventRetentionDays: 30,
    goreloApiBaseUrl: "https://api.aue.gorelo.io",
    goreloRegion: "aue",
    goreloApiConfigured: false,
    goreloCatalogCacheSeconds: 300,
    allowedWebhookHosts: new Set(),
    webhookSigningConfigured: false,
    webhookTimeoutMs: 8_000,
    ...overrides,
  };
}

export function email(overrides: Partial<EvaluatedEmail> = {}): EvaluatedEmail {
  return {
    envelopeFrom: "sender@example.com",
    fromDomain: "example.com",
    envelopeTo: "support@alerts.example.net",
    toLocalPart: "support",
    subject: "Printer is offline",
    bodyText: "Please investigate the reception printer.",
    headers: { "message-id": "<message@example.com>" },
    attachments: [],
    hasAttachments: false,
    messageId: "<message@example.com>",
    rawSize: 1024,
    mimeParsed: true,
    spam: { score: 0, reasons: [], isSpam: false },
    ...overrides,
  };
}

export function rule(
  input: RuleInputData,
  id = crypto.randomUUID(),
): StoredRule {
  const parsed = ruleInputSchema.parse(input);
  return {
    id,
    ...parsed,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
