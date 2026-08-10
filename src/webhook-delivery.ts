import {
  claimDelivery,
  createOrGetDelivery,
  getDelivery,
  getDeliveryByEventAction,
  listClaimableDeliveries,
  listStaleDeliveringDeliveries,
  markDeliveryFailed,
  markDeliverySucceeded,
  markDeliveryUncertain,
} from "./delivery-repository";
import type {
  DeliveryMutationResult,
  OutboundDelivery,
} from "./delivery-types";
import {
  getWebhookDestination,
  type WebhookDestination,
} from "./webhook-repository";
import type { Env, RuntimeConfig } from "./types";
import { sendWebhook, WebhookDeliveryError } from "./webhooks";

const RETRY_BASE_DELAY_MS = 30_000;
const RETRY_MAX_DELAY_MS = 15 * 60_000;

/** Initial attempt plus four automatic retries. */
export const MAX_AUTOMATIC_WEBHOOK_ATTEMPTS = 5;

/** Longer than the maximum 30-second request timeout plus completion writes. */
export const STALE_WEBHOOK_CLAIM_AGE_MS = 10 * 60_000;

const SAFE_ERRORS = Object.freeze({
  preflight: "Webhook field extraction failed",
  clientResolution: "Gorelo client identity resolution failed",
  destinationMissing: "Webhook destination is not available",
  destinationDisabled: "Webhook destination is disabled",
  destinationChanged: "Webhook destination changed after delivery was created",
  staleClaim: "Webhook delivery claim expired with an uncertain outcome",
  notConfigured: "Webhook delivery is not configured",
  invalidConfiguration: "Webhook delivery configuration is invalid",
  invalidPayload: "Webhook payload is invalid or exceeds its size limit",
  rejected: "Webhook endpoint rejected the request",
  retryableHttp: "Webhook endpoint returned a retryable response",
  network: "Webhook delivery could not be completed",
  timeout: "Webhook delivery outcome is uncertain after timeout",
  unknown: "Webhook delivery outcome is uncertain",
  primaryForward: "Primary email forwarding failed before webhook dispatch",
});

export interface ExecuteWebhookDeliveryInput {
  eventId: string;
  actionIndex: number;
  destinationId: string;
  eventType: string;
  data: Readonly<Record<string, unknown>>;
  ruleSnapshotId?: string;
  preflightError?: string;
}

export type WebhookDeliverySkipReason =
  | "already_succeeded"
  | "manual_review_required"
  | "in_progress"
  | "terminal_failure"
  | "not_due"
  | "claim_conflict"
  | "completion_conflict";

export type WebhookDeliveryExecutionResult =
  | {
      status: "succeeded" | "failed" | "uncertain";
      delivery: OutboundDelivery;
    }
  | {
      status: "skipped";
      reason: WebhookDeliverySkipReason;
      delivery: OutboundDelivery;
    };

export interface WebhookRetryBatchResult {
  reconciled: number;
  scanned: number;
  attempted: number;
  succeeded: number;
  failed: number;
  uncertain: number;
  skipped: number;
  invalid: number;
}

interface WebhookDestinationBinding {
  version: number;
  endpointDigest: string;
}

const ENDPOINT_DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const textEncoder = new TextEncoder();

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function destinationBinding(
  destination: WebhookDestination,
): Promise<WebhookDestinationBinding | null> {
  if (!Number.isSafeInteger(destination.version) || destination.version < 1) {
    return null;
  }
  let canonicalUrl: string;
  try {
    canonicalUrl = new URL(destination.url).toString();
  } catch {
    return null;
  }
  return {
    version: destination.version,
    endpointDigest: await sha256Hex(canonicalUrl),
  };
}

function storedDestinationBinding(
  payload: Readonly<Record<string, unknown>>,
): WebhookDestinationBinding | null {
  const version = payload.destinationVersion;
  const endpointDigest = payload.destinationEndpointDigest;
  if (
    !Number.isSafeInteger(version) ||
    (version as number) < 1 ||
    typeof endpointDigest !== "string" ||
    !ENDPOINT_DIGEST_PATTERN.test(endpointDigest)
  ) {
    return null;
  }
  return { version: version as number, endpointDigest };
}

function sameDestinationBinding(
  expected: WebhookDestinationBinding,
  current: WebhookDestinationBinding,
): boolean {
  return (
    expected.version === current.version &&
    expected.endpointDigest === current.endpointDigest
  );
}

function webhookPayloadSnapshot(
  input: Pick<
    ExecuteWebhookDeliveryInput,
    "destinationId" | "eventType" | "data"
  >,
  binding: WebhookDestinationBinding | null,
): Readonly<Record<string, unknown>> {
  return {
    destinationId: input.destinationId,
    eventType: input.eventType,
    data: input.data,
    ...(binding
      ? {
          destinationVersion: binding.version,
          destinationEndpointDigest: binding.endpointDigest,
        }
      : {}),
  };
}

/**
 * Builds the exact URL-free snapshot that can be committed atomically with the
 * processing event before the primary forward is attempted.
 */
export async function prepareWebhookDeliveryPayload(
  db: D1Database,
  input: Pick<
    ExecuteWebhookDeliveryInput,
    "destinationId" | "eventType" | "data"
  >,
): Promise<Readonly<Record<string, unknown>>> {
  if (!isPlainRecord(input.data)) {
    throw new Error("Webhook data must be a plain JSON record");
  }
  const destination = await getWebhookDestination(db, input.destinationId);
  const binding = destination ? await destinationBinding(destination) : null;
  return webhookPayloadSnapshot(input, binding);
}

function isPlainRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function retryAt(attemptCount: number, now: Date): string {
  const exponent = Math.max(0, Math.min(30, attemptCount - 1));
  const delay = Math.min(
    RETRY_MAX_DELAY_MS,
    RETRY_BASE_DELAY_MS * 2 ** exponent,
  );
  return new Date(now.getTime() + delay).toISOString();
}

function safeErrorFor(error: WebhookDeliveryError): string {
  switch (error.code) {
    case "invalid_configuration":
      return SAFE_ERRORS.invalidConfiguration;
    case "invalid_payload":
      return SAFE_ERRORS.invalidPayload;
    case "http_error":
      return error.classification === "definitive"
        ? SAFE_ERRORS.rejected
        : SAFE_ERRORS.retryableHttp;
    case "network_error":
      return SAFE_ERRORS.network;
    case "timeout":
      return SAFE_ERRORS.timeout;
  }
}

function safeHttpStatus(error: WebhookDeliveryError): number | undefined {
  return error.status !== undefined &&
    Number.isInteger(error.status) &&
    error.status >= 100 &&
    error.status <= 599
    ? error.status
    : undefined;
}

async function currentDelivery(
  db: D1Database,
  fallback: OutboundDelivery,
): Promise<OutboundDelivery> {
  return (await getDelivery(db, fallback.id)) ?? fallback;
}

async function completedResult(
  db: D1Database,
  result: DeliveryMutationResult,
  fallback: OutboundDelivery,
  status: "succeeded" | "failed" | "uncertain",
): Promise<WebhookDeliveryExecutionResult> {
  if (result.status === "updated") {
    return { status, delivery: result.delivery };
  }
  return {
    status: "skipped",
    reason: "completion_conflict",
    delivery: await currentDelivery(db, fallback),
  };
}

async function definitiveFailure(
  db: D1Database,
  delivery: OutboundDelivery,
  safeError: string,
  httpStatus?: number,
): Promise<WebhookDeliveryExecutionResult> {
  return completedResult(
    db,
    await markDeliveryFailed(db, delivery.id, {
      expectedVersion: delivery.version,
      safeError,
      ...(httpStatus === undefined ? {} : { httpStatus }),
    }),
    delivery,
    "failed",
  );
}

function existingDeliveryResult(
  delivery: OutboundDelivery,
  now: number,
): WebhookDeliveryExecutionResult | null {
  switch (delivery.state) {
    case "succeeded":
      return {
        status: "skipped",
        reason: "already_succeeded",
        delivery,
      };
    case "uncertain":
      return {
        status: "skipped",
        reason: "manual_review_required",
        delivery,
      };
    case "delivering":
      return { status: "skipped", reason: "in_progress", delivery };
    case "failed": {
      if (
        delivery.nextAttemptAt === undefined ||
        delivery.attemptCount >= MAX_AUTOMATIC_WEBHOOK_ATTEMPTS
      ) {
        return { status: "skipped", reason: "terminal_failure", delivery };
      }
      const nextAttemptAt = Date.parse(delivery.nextAttemptAt);
      if (!Number.isFinite(nextAttemptAt) || nextAttemptAt > now) {
        return { status: "skipped", reason: "not_due", delivery };
      }
      return null;
    }
    case "pending":
      return null;
  }
}

/**
 * Execute one idempotent webhook action against a registered destination.
 * The durable snapshot excludes the destination URL and authentication
 * material. A destination version and canonical-URL digest bind every
 * sendable delivery to the endpoint selected when it was created.
 */
export async function executeWebhookDelivery(
  env: Env,
  config: RuntimeConfig,
  input: ExecuteWebhookDeliveryInput,
): Promise<WebhookDeliveryExecutionResult> {
  if (!isPlainRecord(input.data)) {
    throw new Error("Webhook data must be a plain JSON record");
  }

  const prior = await getDeliveryByEventAction(
    env.DB,
    input.eventId,
    input.actionIndex,
  );
  let expectedBinding = prior
    ? storedDestinationBinding(prior.payloadSnapshot)
    : null;
  if (!prior && input.preflightError === undefined) {
    const initialDestination = await getWebhookDestination(
      env.DB,
      input.destinationId,
    );
    expectedBinding = initialDestination
      ? await destinationBinding(initialDestination)
      : null;
  }

  const created = await createOrGetDelivery(env.DB, {
    eventId: input.eventId,
    actionIndex: input.actionIndex,
    actionType: "send_webhook",
    payloadSnapshot: webhookPayloadSnapshot(input, expectedBinding),
    ...(input.ruleSnapshotId === undefined
      ? {}
      : { ruleSnapshotId: input.ruleSnapshotId }),
  });

  const now = new Date();
  const existing = existingDeliveryResult(created.delivery, now.getTime());
  if (existing) return existing;

  // Resolve configuration before claiming. A transient D1 failure therefore
  // leaves the delivery claimable instead of marooning it in `delivering`.
  const destination =
    input.preflightError === undefined
      ? await getWebhookDestination(env.DB, input.destinationId)
      : null;
  let preflightFailure: string | undefined;
  let preflightUncertain: string | undefined;
  if (input.preflightError !== undefined) {
    // The upstream error may contain message content or provider details. Its
    // presence is all this boundary needs; only a fixed audit-safe category is
    // persisted.
    preflightFailure =
      input.preflightError === "client_resolution_failed"
        ? SAFE_ERRORS.clientResolution
        : input.preflightError === "primary_forward_failed"
          ? SAFE_ERRORS.primaryForward
          : SAFE_ERRORS.preflight;
  } else if (prior && !expectedBinding) {
    // A legacy or malformed pending delivery has no immutable endpoint
    // identity. Treat it as uncertain instead of guessing where to send it.
    preflightUncertain = SAFE_ERRORS.destinationChanged;
  } else if (!destination) {
    preflightUncertain = expectedBinding
      ? SAFE_ERRORS.destinationChanged
      : undefined;
    preflightFailure = expectedBinding
      ? undefined
      : SAFE_ERRORS.destinationMissing;
  } else {
    const currentBinding = await destinationBinding(destination);
    if (
      expectedBinding &&
      (!currentBinding ||
        !sameDestinationBinding(expectedBinding, currentBinding))
    ) {
      preflightUncertain = SAFE_ERRORS.destinationChanged;
    } else if (!expectedBinding || !currentBinding) {
      preflightFailure = SAFE_ERRORS.invalidConfiguration;
    } else if (!destination.enabled) {
      preflightFailure = SAFE_ERRORS.destinationDisabled;
    } else if (
      !config.webhookSigningConfigured ||
      typeof env.WEBHOOK_SIGNING_SECRET !== "string" ||
      env.WEBHOOK_SIGNING_SECRET.length === 0 ||
      !(config.allowedWebhookHosts instanceof Set) ||
      config.allowedWebhookHosts.size === 0
    ) {
      preflightFailure = SAFE_ERRORS.notConfigured;
    }
  }

  const claim = await claimDelivery(
    env.DB,
    created.delivery.id,
    created.delivery.version,
    now.toISOString(),
  );
  if (claim.status !== "updated") {
    return {
      status: "skipped",
      reason: claim.status === "not_due" ? "not_due" : "claim_conflict",
      delivery: await currentDelivery(env.DB, created.delivery),
    };
  }
  const delivery = claim.delivery;

  if (preflightUncertain !== undefined) {
    return completedResult(
      env.DB,
      await markDeliveryUncertain(env.DB, delivery.id, {
        expectedVersion: delivery.version,
        safeError: preflightUncertain,
      }),
      delivery,
      "uncertain",
    );
  }
  if (preflightFailure !== undefined) {
    return definitiveFailure(env.DB, delivery, preflightFailure);
  }

  try {
    const sent = await sendWebhook({
      url: destination!.url,
      allowedHosts: config.allowedWebhookHosts,
      signingSecret: env.WEBHOOK_SIGNING_SECRET!,
      eventType: input.eventType,
      eventId: input.eventId,
      deliveryId: delivery.id,
      payload: input.data,
      timeoutMs: config.webhookTimeoutMs,
    });
    return completedResult(
      env.DB,
      await markDeliverySucceeded(env.DB, delivery.id, {
        expectedVersion: delivery.version,
        httpStatus: sent.status,
      }),
      delivery,
      "succeeded",
    );
  } catch (error) {
    if (!(error instanceof WebhookDeliveryError)) {
      return completedResult(
        env.DB,
        await markDeliveryUncertain(env.DB, delivery.id, {
          expectedVersion: delivery.version,
          safeError: SAFE_ERRORS.unknown,
        }),
        delivery,
        "uncertain",
      );
    }

    const status = safeHttpStatus(error);
    if (error.classification === "uncertain") {
      return completedResult(
        env.DB,
        await markDeliveryUncertain(env.DB, delivery.id, {
          expectedVersion: delivery.version,
          safeError: safeErrorFor(error),
          ...(status === undefined ? {} : { httpStatus: status }),
        }),
        delivery,
        "uncertain",
      );
    }
    if (error.classification === "retryable") {
      const failedAt = new Date();
      return completedResult(
        env.DB,
        await markDeliveryFailed(env.DB, delivery.id, {
          expectedVersion: delivery.version,
          safeError: safeErrorFor(error),
          ...(delivery.attemptCount < MAX_AUTOMATIC_WEBHOOK_ATTEMPTS
            ? { nextAttemptAt: retryAt(delivery.attemptCount, failedAt) }
            : {}),
          ...(status === undefined ? {} : { httpStatus: status }),
        }),
        delivery,
        "failed",
      );
    }
    return definitiveFailure(env.DB, delivery, safeErrorFor(error), status);
  }
}

function retryInput(
  delivery: OutboundDelivery,
): ExecuteWebhookDeliveryInput | null {
  const snapshot = delivery.payloadSnapshot;
  const destinationId = snapshot.destinationId;
  const eventType = snapshot.eventType;
  const data = snapshot.data;
  if (
    typeof destinationId !== "string" ||
    typeof eventType !== "string" ||
    !isPlainRecord(data)
  ) {
    return null;
  }
  return {
    eventId: delivery.eventId,
    actionIndex: delivery.actionIndex,
    destinationId,
    eventType,
    data,
    ...(delivery.ruleSnapshotId
      ? { ruleSnapshotId: delivery.ruleSnapshotId }
      : {}),
  };
}

async function reconcileStaleWebhookClaims(
  db: D1Database,
  now: Date,
): Promise<number> {
  const staleBefore = new Date(
    now.getTime() - STALE_WEBHOOK_CLAIM_AGE_MS,
  ).toISOString();
  const staleClaims = await listStaleDeliveringDeliveries(
    db,
    staleBefore,
    "send_webhook",
  );
  let reconciled = 0;
  for (const delivery of staleClaims) {
    const result = await markDeliveryUncertain(db, delivery.id, {
      expectedVersion: delivery.version,
      completedAt: now.toISOString(),
      safeError: SAFE_ERRORS.staleClaim,
    });
    if (result.status === "updated") reconciled += 1;
  }
  return reconciled;
}

/** Retry due webhook failures. CAS claims and idempotency keys make overlap safe. */
export async function retryClaimableWebhookDeliveries(
  env: Env,
  config: RuntimeConfig,
  limit = 25,
): Promise<WebhookRetryBatchResult> {
  const now = new Date();
  const reconciled = await reconcileStaleWebhookClaims(env.DB, now);
  const candidates = await listClaimableDeliveries(
    env.DB,
    now.toISOString(),
    Math.max(1, Math.min(100, limit)),
    MAX_AUTOMATIC_WEBHOOK_ATTEMPTS,
    ["send_webhook"],
    "forwarded",
  );
  const result: WebhookRetryBatchResult = {
    reconciled,
    scanned: candidates.length,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    uncertain: reconciled,
    skipped: 0,
    invalid: 0,
  };
  for (const candidate of candidates) {
    if (candidate.actionType !== "send_webhook") continue;
    const delivery = await getDelivery(env.DB, candidate.id);
    const input = delivery ? retryInput(delivery) : null;
    if (!input) {
      result.invalid += 1;
      continue;
    }
    result.attempted += 1;
    try {
      const execution = await executeWebhookDelivery(env, config, input);
      if (execution.status === "skipped") result.skipped += 1;
      else result[execution.status] += 1;
    } catch {
      result.invalid += 1;
    }
  }
  return result;
}
