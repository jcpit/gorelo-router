import type { Env, RuntimeConfig } from "./types";
import { loadGoreloMailboxDirectory } from "./mailbox-repository";

export type SetupCheckStatus = "ready" | "optional" | "missing";

export interface SetupCheck {
  key: string;
  label: string;
  status: SetupCheckStatus;
  detail: string;
}

export interface SetupStatus {
  profile: "forward-only" | "structured-gorelo";
  ready: boolean;
  checks: SetupCheck[];
  emailIngress: {
    domains: string[];
    catchAllAddresses: string[];
  };
  gorelo: {
    configured: boolean;
    region: RuntimeConfig["goreloRegion"];
    baseUrl: string;
    secretName: "GORELO_API_KEY";
    setupCommand: "docker compose run --rm cloudflare secret put GORELO_API_KEY";
  };
  webhooks: {
    configured: boolean;
    allowedHosts: string[];
    signingConfigured: boolean;
    secretName: "WEBHOOK_SIGNING_SECRET";
    setupCommand: "docker compose run --rm cloudflare secret put WEBHOOK_SIGNING_SECRET";
  };
}

async function databaseCheck(db: D1Database): Promise<SetupCheck> {
  try {
    await db.prepare("SELECT id FROM rules LIMIT 0").all();
    await db.prepare("SELECT id FROM processing_events LIMIT 0").all();
    await db.prepare("SELECT event_id FROM quarantine_items LIMIT 0").all();
    await db
      .prepare("SELECT event_id FROM message_review_actions LIMIT 0")
      .all();
    await db.prepare("SELECT id FROM outbound_deliveries LIMIT 0").all();
    await db.prepare("SELECT delivery_id FROM delivery_attempts LIMIT 0").all();
    await db
      .prepare("SELECT cache_key FROM gorelo_catalog_cache LIMIT 0")
      .all();
    await db.prepare("SELECT id FROM gorelo_clients LIMIT 0").all();
    await db.prepare("SELECT id FROM gorelo_client_sync LIMIT 0").all();
    await db.prepare("SELECT id FROM client_aliases LIMIT 0").all();
    await db.prepare("SELECT id FROM webhook_destinations LIMIT 0").all();
    await db.prepare("SELECT id FROM gorelo_mailboxes LIMIT 0").all();
    await db
      .prepare("SELECT default_mailbox_id FROM gorelo_mailbox_settings LIMIT 0")
      .all();
    await db.prepare("SELECT id FROM parser_captures LIMIT 0").all();
    await db.prepare("SELECT id FROM inbound_webhook_sources LIMIT 0").all();
    await db
      .prepare("SELECT source_id FROM inbound_webhook_rate_limits LIMIT 0")
      .all();
    return {
      key: "database",
      label: "D1 schema",
      status: "ready",
      detail: "Rules, review, delivery, and catalog tables are available.",
    };
  } catch {
    return {
      key: "database",
      label: "D1 schema",
      status: "missing",
      detail: "Initialize the current D1 schema before enabling delivery.",
    };
  }
}

async function forwardingCheck(
  db: D1Database,
  config: RuntimeConfig,
): Promise<SetupCheck> {
  try {
    const directory = await loadGoreloMailboxDirectory(db, {
      allowedAddresses: config.allowedForwardDestinations,
      allowedDomains: config.allowedForwardDomains,
      bootstrapAddress: config.defaultGoreloAddress,
    });
    const defaultMailbox = directory.defaultMailbox;
    if (!defaultMailbox) {
      return {
        key: "forwarding",
        label: "Gorelo mailboxes",
        status: "missing",
        detail: "Choose one enabled Gorelo mailbox as the default route.",
      };
    }
    if (!defaultMailbox.routable) {
      return {
        key: "forwarding",
        label: "Gorelo mailboxes",
        status: "missing",
        detail:
          "The default Gorelo mailbox is disabled or outside the allowed domain and address policy.",
      };
    }

    const result = await db
      .prepare(
        `SELECT action_json
           FROM rules
          WHERE enabled = 1
            AND json_extract(action_json, '$.type')
                  IN ('forward', 'forward_webhook')`,
      )
      .all<{ action_json: string }>();
    let unavailable = 0;
    for (const row of result.results) {
      try {
        const action = JSON.parse(row.action_json) as {
          mailboxId?: unknown;
          destination?: unknown;
        };
        if (typeof action.mailboxId === "string") {
          if (!directory.byId.get(action.mailboxId)?.routable) unavailable += 1;
        } else if (
          typeof action.destination === "string" &&
          !config.allowedForwardDestinations.has(
            action.destination.trim().toLowerCase(),
          )
        ) {
          unavailable += 1;
        }
      } catch {
        unavailable += 1;
      }
    }
    if (unavailable > 0) {
      return {
        key: "forwarding",
        label: "Gorelo mailboxes",
        status: "missing",
        detail: `${String(unavailable)} enabled forwarding rule${unavailable === 1 ? " references" : "s reference"} an unavailable mailbox.`,
      };
    }
    return {
      key: "forwarding",
      label: "Gorelo mailboxes",
      status: "ready",
      detail: `${defaultMailbox.name} (${defaultMailbox.address}) is the default; ${String(directory.mailboxes.filter((mailbox) => mailbox.routable).length)} routable mailbox${directory.mailboxes.filter((mailbox) => mailbox.routable).length === 1 ? " is" : "es are"} available.`,
    };
  } catch {
    return {
      key: "forwarding",
      label: "Gorelo mailboxes",
      status: "missing",
      detail:
        "Initialize the mailbox registry and choose an allowed, enabled default before enabling delivery.",
    };
  }
}

interface EnabledIntegrationRuleCounts {
  directGorelo: number;
  webhooks: number;
  webhookClientResolution: number;
  unavailableWebhookDestinations: number;
  unavailableFixedClients: number;
}

async function enabledIntegrationRuleCounts(
  db: D1Database,
): Promise<EnabledIntegrationRuleCounts> {
  try {
    const row = await db
      .prepare(
        `SELECT
           SUM(CASE WHEN json_extract(action_json, '$.type')
                         IN ('create_ticket', 'create_alert')
                    THEN 1 ELSE 0 END) AS direct_gorelo,
           SUM(CASE WHEN json_extract(r.action_json, '$.type') = 'forward_webhook'
                    THEN 1 ELSE 0 END) AS webhooks,
           SUM(CASE
                 WHEN json_extract(r.action_json, '$.type') = 'forward_webhook'
                      AND NULLIF(
                            TRIM(COALESCE(
                              json_extract(r.action_json, '$.clientIdentityField'),
                              ''
                            )),
                            ''
                          ) IS NOT NULL
                 THEN 1 ELSE 0
               END) AS webhook_client_resolution,
           SUM(CASE
                 WHEN json_extract(r.action_json, '$.type') = 'forward_webhook'
                      AND (w.id IS NULL OR w.enabled <> 1)
                 THEN 1 ELSE 0
               END) AS unavailable_webhook_destinations,
           SUM(CASE
                 WHEN json_extract(r.action_json, '$.type')
                        IN ('create_ticket', 'create_alert')
                      AND json_extract(r.action_json, '$.clientId') IS NOT NULL
                      AND NOT EXISTS (
                        SELECT 1
                          FROM gorelo_clients c
                          JOIN gorelo_client_sync s
                            ON s.id = 1
                           AND c.last_seen_at = s.last_synced_at
                         WHERE c.id = json_extract(
                           r.action_json,
                           '$.clientId'
                         )
                      )
                 THEN 1 ELSE 0
               END) AS unavailable_fixed_clients
           FROM rules r
           LEFT JOIN webhook_destinations w
             ON w.id = json_extract(
                  r.action_json,
                  '$.webhookDestinationId'
                )
          WHERE r.enabled = 1`,
      )
      .first<{
        direct_gorelo: number | null;
        webhooks: number | null;
        webhook_client_resolution: number | null;
        unavailable_webhook_destinations: number | null;
        unavailable_fixed_clients: number | null;
      }>();
    return {
      directGorelo: Number(row?.direct_gorelo ?? 0),
      webhooks: Number(row?.webhooks ?? 0),
      webhookClientResolution: Number(row?.webhook_client_resolution ?? 0),
      unavailableWebhookDestinations: Number(
        row?.unavailable_webhook_destinations ?? 0,
      ),
      unavailableFixedClients: Number(row?.unavailable_fixed_clients ?? 0),
    };
  } catch {
    return {
      directGorelo: 0,
      webhooks: 0,
      webhookClientResolution: 0,
      unavailableWebhookDestinations: 0,
      unavailableFixedClients: 0,
    };
  }
}

async function enabledWebhookDestinationHosts(
  db: D1Database,
): Promise<string[]> {
  try {
    const result = await db
      .prepare(
        `SELECT LOWER(w.host) AS webhook_destination_host
           FROM rules r
           JOIN webhook_destinations w
             ON w.id = json_extract(
                  r.action_json,
                  '$.webhookDestinationId'
                )
            AND w.enabled = 1
          WHERE r.enabled = 1
            AND json_extract(r.action_json, '$.type') = 'forward_webhook'`,
      )
      .all<{ webhook_destination_host: string }>();
    return result.results
      .map((row) => row.webhook_destination_host)
      .filter((host): host is string => typeof host === "string");
  } catch {
    return [];
  }
}

async function currentGoreloClientCount(db: D1Database): Promise<number> {
  try {
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS count
           FROM gorelo_clients c
           JOIN gorelo_client_sync s
             ON s.id = 1 AND c.last_seen_at = s.last_synced_at`,
      )
      .first<{ count: number }>();
    return Number(row?.count ?? 0);
  } catch {
    return 0;
  }
}

export async function buildSetupStatus(
  env: Env,
  config: RuntimeConfig,
): Promise<SetupStatus> {
  const integrationRules = await enabledIntegrationRuleCounts(env.DB);
  const webhookDestinationHosts = await enabledWebhookDestinationHosts(env.DB);
  const disallowedWebhookDestinations = webhookDestinationHosts.filter(
    (host) => !config.allowedWebhookHosts.has(host),
  ).length;
  const directRules = integrationRules.directGorelo;
  const clientDirectoryRequired =
    directRules > 0 || integrationRules.webhookClientResolution > 0;
  const currentClients = await currentGoreloClientCount(env.DB);
  const checks: SetupCheck[] = [
    await databaseCheck(env.DB),
    await forwardingCheck(env.DB, config),
  ];
  const inboundDomains = [...config.inboundEmailDomains].sort();
  checks.push({
    key: "email_ingress",
    label: "Inbound email domains",
    status: inboundDomains.length > 0 ? "ready" : "missing",
    detail:
      inboundDomains.length > 0
        ? `${String(inboundDomains.length)} Cloudflare Email Routing domain${inboundDomains.length === 1 ? " is" : "s are"} declared: ${inboundDomains.join(", ")}. Verify each external catch-all after deployment.`
        : "Set INBOUND_EMAIL_DOMAINS and configure one *@domain Worker trigger for every inbound domain.",
  });

  const archiveRequired =
    config.quarantineMode === "internal" ||
    config.archiveMode !== "none" ||
    directRules > 0;
  checks.push({
    key: "message_archive",
    label: "Private message archive",
    status: env.MESSAGE_ARCHIVE
      ? "ready"
      : archiveRequired
        ? "missing"
        : "optional",
    detail: env.MESSAGE_ARCHIVE
      ? "The private R2 message binding is available."
      : directRules > 0
        ? "MESSAGE_ARCHIVE is required because API-only Gorelo actions do not preserve the original email."
        : archiveRequired
          ? "MESSAGE_ARCHIVE is required by the selected archive/quarantine mode."
          : "R2 is optional while raw retention and internal quarantine are disabled.",
  });

  const releaseConfigured = Boolean(
    env.RELEASE_EMAIL && config.releaseFromAddress,
  );
  const releasePartiallyConfigured = Boolean(
    env.RELEASE_EMAIL || config.releaseFromAddress,
  );
  checks.push({
    key: "release_email",
    label: "Quarantine release",
    status: releaseConfigured
      ? "ready"
      : releasePartiallyConfigured
        ? "missing"
        : "optional",
    detail: releaseConfigured
      ? "The restricted Email Sending binding and sender are configured."
      : releasePartiallyConfigured
        ? "Configure both RELEASE_EMAIL and RELEASE_FROM_ADDRESS."
        : "Automated release is optional; review and dismissal remain available.",
  });

  checks.push({
    key: "cloudflare_access",
    label: "Cloudflare Access",
    status: "optional",
    detail:
      "Protect the production admin hostname with Access; a Worker cannot verify the outer Access policy itself.",
  });

  checks.push({
    key: "gorelo_api",
    label: "Structured Gorelo API",
    status: config.goreloApiConfigured
      ? "ready"
      : directRules > 0
        ? "missing"
        : "optional",
    detail: config.goreloApiConfigured
      ? `A scoped API key is configured for the ${config.goreloRegion.toUpperCase()} region.`
      : directRules > 0
        ? "GORELO_API_KEY is required because an enabled rule creates tickets or alerts through the API."
        : "Optional while forwarding-only mode is in use.",
  });

  checks.push({
    key: "gorelo_clients",
    label: "Gorelo client directory",
    status:
      currentClients > 0 && integrationRules.unavailableFixedClients === 0
        ? "ready"
        : clientDirectoryRequired
          ? "missing"
          : "optional",
    detail:
      integrationRules.unavailableFixedClients > 0
        ? `${String(integrationRules.unavailableFixedClients)} enabled Gorelo rule${integrationRules.unavailableFixedClients === 1 ? " references" : "s reference"} a fixed client that is not in the current import.`
        : currentClients > 0
          ? `${String(currentClients)} current Gorelo client${currentClients === 1 ? " is" : "s are"} available for exact mapping.`
          : clientDirectoryRequired
            ? integrationRules.webhookClientResolution > 0
              ? directRules > 0
                ? "Import current Gorelo clients before enabling webhook client enrichment or API ticket and alert rules."
                : "Import current Gorelo clients before enabling webhook client enrichment."
              : "Import current Gorelo clients before enabling API ticket or alert rules."
            : "Import clients when aliases or structured Gorelo actions are needed.",
  });

  const webhookHostsConfigured = config.allowedWebhookHosts.size > 0;
  const webhookPartiallyConfigured =
    webhookHostsConfigured || config.webhookSigningConfigured;
  const webhooksRequired = integrationRules.webhooks > 0;
  checks.push({
    key: "webhooks",
    label: "Signed webhooks",
    status:
      webhookHostsConfigured && config.webhookSigningConfigured
        ? "ready"
        : webhookPartiallyConfigured || webhooksRequired
          ? "missing"
          : "optional",
    detail:
      webhookHostsConfigured && config.webhookSigningConfigured
        ? "Registered HTTPS destinations are restricted to the configured host allowlist and signed with HMAC-SHA256."
        : webhooksRequired
          ? "ALLOWED_WEBHOOK_HOSTS and WEBHOOK_SIGNING_SECRET are required because an enabled rule sends a signed webhook."
          : webhookPartiallyConfigured
            ? "Configure both ALLOWED_WEBHOOK_HOSTS and WEBHOOK_SIGNING_SECRET."
            : "Optional until a webhook destination is required.",
  });

  checks.push({
    key: "webhook_destinations",
    label: "Webhook rule destinations",
    status:
      integrationRules.unavailableWebhookDestinations > 0 ||
      disallowedWebhookDestinations > 0
        ? "missing"
        : integrationRules.webhooks > 0
          ? "ready"
          : "optional",
    detail:
      integrationRules.unavailableWebhookDestinations > 0 &&
      disallowedWebhookDestinations > 0
        ? `${String(integrationRules.unavailableWebhookDestinations)} enabled webhook rule${integrationRules.unavailableWebhookDestinations === 1 ? " references" : "s reference"} a missing or disabled destination; ${String(disallowedWebhookDestinations)} ${disallowedWebhookDestinations === 1 ? "references" : "reference"} a destination outside ALLOWED_WEBHOOK_HOSTS.`
        : integrationRules.unavailableWebhookDestinations > 0
          ? `${String(integrationRules.unavailableWebhookDestinations)} enabled webhook rule${integrationRules.unavailableWebhookDestinations === 1 ? " references" : "s reference"} a missing or disabled destination.`
          : disallowedWebhookDestinations > 0
            ? `${String(disallowedWebhookDestinations)} enabled webhook rule${disallowedWebhookDestinations === 1 ? " references" : "s reference"} a destination outside ALLOWED_WEBHOOK_HOSTS.`
            : integrationRules.webhooks > 0
              ? "Every enabled webhook rule references an enabled registered destination."
              : "No enabled rule currently requires a webhook destination.",
  });

  return {
    profile: config.goreloApiConfigured ? "structured-gorelo" : "forward-only",
    ready: checks.every((check) => check.status !== "missing"),
    checks,
    emailIngress: {
      domains: inboundDomains,
      catchAllAddresses: inboundDomains.map((domain) => `*@${domain}`),
    },
    gorelo: {
      configured: config.goreloApiConfigured,
      region: config.goreloRegion,
      baseUrl: config.goreloApiBaseUrl,
      secretName: "GORELO_API_KEY",
      setupCommand:
        "docker compose run --rm cloudflare secret put GORELO_API_KEY",
    },
    webhooks: {
      configured: webhookHostsConfigured && config.webhookSigningConfigured,
      allowedHosts: [...config.allowedWebhookHosts].sort(),
      signingConfigured: config.webhookSigningConfigured,
      secretName: "WEBHOOK_SIGNING_SECRET",
      setupCommand:
        "docker compose run --rm cloudflare secret put WEBHOOK_SIGNING_SECRET",
    },
  };
}
