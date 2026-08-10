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
  createGoreloClient,
  GoreloClientError,
  type GoreloCreateAlertRequest,
  type GoreloCreateTicketRequest,
} from "./gorelo";
import type { Env, GoreloRegion, RuntimeConfig } from "./types";

export const GORELO_DELIVERY_SCHEMA_VERSION = 1;

/** Longer than the Gorelo client's maximum 30-second HTTP timeout. */
export const STALE_GORELO_CLAIM_AGE_MS = 10 * 60_000;

const SAFE_ERRORS = Object.freeze({
  extraction: "Gorelo field extraction failed",
  clientResolution: "Gorelo client identity resolution failed",
  mapping: "Gorelo request mapping failed",
  preflight: "Gorelo action preparation failed",
  notConfigured: "Gorelo API delivery is not configured",
  regionChanged: "Gorelo API region changed after delivery was created",
  invalidConfiguration: "Gorelo API delivery configuration is invalid",
  invalidSnapshot: "Stored Gorelo delivery payload is invalid",
  authorization: "Gorelo API authorization failed",
  rejected: "Gorelo rejected the create request",
  rateLimited:
    "Gorelo rate limited the create request; automatic replay is disabled",
  server: "Gorelo API returned an uncertain server response",
  redirect: "Gorelo API create outcome is uncertain after a blocked redirect",
  network: "Gorelo API create outcome is uncertain after a network failure",
  timeout: "Gorelo API create outcome is uncertain after timeout",
  invalidResponse: "Gorelo API create outcome is not confirmed",
  responseTooLarge: "Gorelo API create outcome is not confirmed",
  staleClaim: "Gorelo delivery claim expired with an uncertain outcome",
  unknown: "Gorelo API create outcome is uncertain",
});

interface GoreloDeliveryInputBase {
  eventId: string;
  actionIndex: number;
  data: Readonly<Record<string, unknown>>;
  ruleSnapshotId?: string;
}

type PreparedGoreloDeliveryInput = GoreloDeliveryInputBase &
  (
    | {
        actionType: "create_ticket";
        request: GoreloCreateTicketRequest;
        preflightError?: undefined;
      }
    | {
        actionType: "create_alert";
        request: GoreloCreateAlertRequest;
        preflightError?: undefined;
      }
  );

type FailedGoreloPreflightInput = GoreloDeliveryInputBase & {
  actionType: "create_ticket" | "create_alert";
  request?: undefined;
  preflightError: string;
};

export type ExecuteGoreloDeliveryInput =
  PreparedGoreloDeliveryInput | FailedGoreloPreflightInput;

export type GoreloDeliverySkipReason =
  | "already_succeeded"
  | "manual_review_required"
  | "in_progress"
  | "terminal_failure"
  | "claim_conflict"
  | "completion_conflict";

export type GoreloDeliveryExecutionResult =
  | {
      status: "succeeded" | "failed" | "uncertain";
      delivery: OutboundDelivery;
    }
  | {
      status: "skipped";
      reason: GoreloDeliverySkipReason;
      delivery: OutboundDelivery;
    };

export interface GoreloPendingBatchResult {
  reconciled: number;
  eventReconciled: number;
  scanned: number;
  attempted: number;
  succeeded: number;
  failed: number;
  uncertain: number;
  skipped: number;
  invalid: number;
}

interface TerminalEventStateRow {
  event_id: string;
  state: "succeeded" | "failed" | "uncertain";
  safe_error: string | null;
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

function isGoreloRegion(value: unknown): value is GoreloRegion {
  return value === "aue" || value === "usw";
}

function expectedBaseUrl(region: GoreloRegion): string {
  return region === "aue"
    ? "https://api.aue.gorelo.io"
    : "https://api.usw.gorelo.io";
}

function safePreflightError(value: string): string {
  switch (value) {
    case "extraction_failed":
      return SAFE_ERRORS.extraction;
    case "client_resolution_failed":
      return SAFE_ERRORS.clientResolution;
    case "mapping_failed":
      return SAFE_ERRORS.mapping;
    default:
      return SAFE_ERRORS.preflight;
  }
}

function safeHttpStatus(error: GoreloClientError): number | undefined {
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
): Promise<GoreloDeliveryExecutionResult> {
  if (result.status === "updated") return { status, delivery: result.delivery };
  return {
    status: "skipped",
    reason: "completion_conflict",
    delivery: await currentDelivery(db, fallback),
  };
}

async function terminalFailure(
  db: D1Database,
  delivery: OutboundDelivery,
  safeError: string,
  httpStatus?: number,
): Promise<GoreloDeliveryExecutionResult> {
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

async function uncertainFailure(
  db: D1Database,
  delivery: OutboundDelivery,
  safeError: string,
  httpStatus?: number,
): Promise<GoreloDeliveryExecutionResult> {
  return completedResult(
    db,
    await markDeliveryUncertain(db, delivery.id, {
      expectedVersion: delivery.version,
      safeError,
      ...(httpStatus === undefined ? {} : { httpStatus }),
    }),
    delivery,
    "uncertain",
  );
}

function existingDeliveryResult(
  delivery: OutboundDelivery,
): GoreloDeliveryExecutionResult | null {
  switch (delivery.state) {
    case "succeeded":
      return { status: "skipped", reason: "already_succeeded", delivery };
    case "uncertain":
      return {
        status: "skipped",
        reason: "manual_review_required",
        delivery,
      };
    case "delivering":
      return { status: "skipped", reason: "in_progress", delivery };
    case "failed":
      return { status: "skipped", reason: "terminal_failure", delivery };
    case "pending":
      return delivery.attemptCount === 0
        ? null
        : {
            status: "skipped",
            reason: "manual_review_required",
            delivery,
          };
  }
}

function errorDisposition(error: GoreloClientError): {
  outcome: "failed" | "uncertain";
  safeError: string;
  httpStatus?: number;
} {
  const httpStatus = safeHttpStatus(error);
  switch (error.code) {
    case "invalid_configuration":
      return {
        outcome: "failed",
        safeError: SAFE_ERRORS.invalidConfiguration,
      };
    case "timeout":
      return { outcome: "uncertain", safeError: SAFE_ERRORS.timeout };
    case "network_error":
      return { outcome: "uncertain", safeError: SAFE_ERRORS.network };
    case "redirect_error":
      return {
        outcome: "uncertain",
        safeError: SAFE_ERRORS.redirect,
        ...(httpStatus === undefined ? {} : { httpStatus }),
      };
    case "response_too_large":
      return {
        outcome: "uncertain",
        safeError: SAFE_ERRORS.responseTooLarge,
      };
    case "invalid_response":
      return {
        outcome: "uncertain",
        safeError: SAFE_ERRORS.invalidResponse,
      };
    case "http_error": {
      if (httpStatus === 401 || httpStatus === 403) {
        return {
          outcome: "failed",
          safeError: SAFE_ERRORS.authorization,
          httpStatus,
        };
      }
      if (httpStatus === 429) {
        return {
          outcome: "failed",
          safeError: SAFE_ERRORS.rateLimited,
          httpStatus,
        };
      }
      if (httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500) {
        return {
          outcome: "failed",
          safeError: SAFE_ERRORS.rejected,
          httpStatus,
        };
      }
      return {
        outcome: "uncertain",
        safeError: SAFE_ERRORS.server,
        ...(httpStatus === undefined ? {} : { httpStatus }),
      };
    }
  }
}

/**
 * Creates one Gorelo ticket or alert at most once locally. Gorelo does not
 * expose an idempotency key for these endpoints, so every ambiguous outcome is
 * held for manual review and is never automatically replayed.
 */
export async function executeGoreloDelivery(
  env: Env,
  config: RuntimeConfig,
  input: ExecuteGoreloDeliveryInput,
): Promise<GoreloDeliveryExecutionResult> {
  if (!isPlainRecord(input.data)) {
    throw new Error("Gorelo audit data must be a plain JSON record");
  }
  if (input.request !== undefined && !isPlainRecord(input.request)) {
    throw new Error("Gorelo request must be a plain JSON record");
  }

  const prior = await getDeliveryByEventAction(
    env.DB,
    input.eventId,
    input.actionIndex,
  );
  const priorRegion = prior?.payloadSnapshot.region;
  const snapshotRegion = prior ? priorRegion : config.goreloRegion;
  const created = await createOrGetDelivery(env.DB, {
    eventId: input.eventId,
    actionIndex: input.actionIndex,
    actionType: input.actionType,
    payloadSnapshot: {
      schemaVersion: GORELO_DELIVERY_SCHEMA_VERSION,
      region: snapshotRegion,
      request: input.request ?? null,
      data: input.data,
    },
    ...(input.ruleSnapshotId === undefined
      ? {}
      : { ruleSnapshotId: input.ruleSnapshotId }),
  });

  const existing = existingDeliveryResult(created.delivery);
  if (existing) return existing;

  let localFailure: string | undefined;
  if (input.preflightError !== undefined) {
    localFailure = safePreflightError(input.preflightError);
  } else if (
    !isGoreloRegion(priorRegion ?? config.goreloRegion) ||
    (prior !== null && priorRegion !== config.goreloRegion)
  ) {
    localFailure = SAFE_ERRORS.regionChanged;
  } else if (
    !config.goreloApiConfigured ||
    typeof env.GORELO_API_KEY !== "string" ||
    env.GORELO_API_KEY.length === 0
  ) {
    localFailure = SAFE_ERRORS.notConfigured;
  } else if (config.goreloApiBaseUrl !== expectedBaseUrl(config.goreloRegion)) {
    localFailure = SAFE_ERRORS.invalidConfiguration;
  }

  const claimedAt = new Date().toISOString();
  const claim = await claimDelivery(
    env.DB,
    created.delivery.id,
    created.delivery.version,
    claimedAt,
  );
  if (claim.status !== "updated") {
    return {
      status: "skipped",
      reason: "claim_conflict",
      delivery: await currentDelivery(env.DB, created.delivery),
    };
  }
  const delivery = claim.delivery;

  if (localFailure !== undefined) {
    return terminalFailure(env.DB, delivery, localFailure);
  }
  if (input.request === undefined) {
    return terminalFailure(env.DB, delivery, SAFE_ERRORS.invalidConfiguration);
  }

  try {
    const client = createGoreloClient({
      baseUrl: config.goreloApiBaseUrl,
      apiKey: env.GORELO_API_KEY!,
    });
    if (input.actionType === "create_ticket") {
      const result = await client.createTicket(input.request);
      return completedResult(
        env.DB,
        await markDeliverySucceeded(env.DB, delivery.id, {
          expectedVersion: delivery.version,
          providerId: result.id,
        }),
        delivery,
        "succeeded",
      );
    }
    await client.createAlert(input.request);
    return completedResult(
      env.DB,
      await markDeliverySucceeded(env.DB, delivery.id, {
        expectedVersion: delivery.version,
      }),
      delivery,
      "succeeded",
    );
  } catch (error) {
    if (!(error instanceof GoreloClientError)) {
      return uncertainFailure(env.DB, delivery, SAFE_ERRORS.unknown);
    }
    const disposition = errorDisposition(error);
    return disposition.outcome === "failed"
      ? terminalFailure(
          env.DB,
          delivery,
          disposition.safeError,
          disposition.httpStatus,
        )
      : uncertainFailure(
          env.DB,
          delivery,
          disposition.safeError,
          disposition.httpStatus,
        );
  }
}

function pendingInput(
  delivery: OutboundDelivery,
): ExecuteGoreloDeliveryInput | null {
  const snapshot = delivery.payloadSnapshot;
  if (
    snapshot.schemaVersion !== GORELO_DELIVERY_SCHEMA_VERSION ||
    !isGoreloRegion(snapshot.region) ||
    !isPlainRecord(snapshot.data)
  ) {
    return null;
  }
  const base = {
    eventId: delivery.eventId,
    actionIndex: delivery.actionIndex,
    data: snapshot.data,
    ...(delivery.ruleSnapshotId
      ? { ruleSnapshotId: delivery.ruleSnapshotId }
      : {}),
  };
  if (snapshot.request === null) {
    return {
      ...base,
      actionType: delivery.actionType as "create_ticket" | "create_alert",
      preflightError: "stored_preflight_failure",
    };
  }
  if (!isPlainRecord(snapshot.request)) return null;
  return delivery.actionType === "create_ticket"
    ? {
        ...base,
        actionType: "create_ticket",
        request: snapshot.request as unknown as GoreloCreateTicketRequest,
      }
    : {
        ...base,
        actionType: "create_alert",
        request: snapshot.request as unknown as GoreloCreateAlertRequest,
      };
}

async function reconcileStaleGoreloClaims(
  db: D1Database,
  now: Date,
): Promise<number> {
  const staleBefore = new Date(
    now.getTime() - STALE_GORELO_CLAIM_AGE_MS,
  ).toISOString();
  let reconciled = 0;
  for (const actionType of ["create_ticket", "create_alert"] as const) {
    const stale = await listStaleDeliveringDeliveries(
      db,
      staleBefore,
      actionType,
    );
    for (const delivery of stale) {
      const result = await markDeliveryUncertain(db, delivery.id, {
        expectedVersion: delivery.version,
        completedAt: now.toISOString(),
        safeError: SAFE_ERRORS.staleClaim,
      });
      if (result.status === "updated") {
        reconciled += 1;
        await updateProcessingEventDeliveryState(
          db,
          delivery.eventId,
          "failed",
          SAFE_ERRORS.staleClaim,
        );
      }
    }
  }
  return reconciled;
}

async function failInvalidPendingDelivery(
  db: D1Database,
  delivery: OutboundDelivery,
  now: Date,
): Promise<void> {
  const claim = await claimDelivery(
    db,
    delivery.id,
    delivery.version,
    now.toISOString(),
  );
  if (claim.status !== "updated") return;
  const failed = await markDeliveryFailed(db, delivery.id, {
    expectedVersion: claim.delivery.version,
    completedAt: now.toISOString(),
    safeError: SAFE_ERRORS.invalidSnapshot,
  });
  if (failed.status === "updated") {
    await updateProcessingEventDeliveryState(
      db,
      delivery.eventId,
      "failed",
      SAFE_ERRORS.invalidSnapshot,
    );
  }
}

async function updateProcessingEventDeliveryState(
  db: D1Database,
  eventId: string,
  status: "forwarded" | "failed",
  safeError?: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE processing_events
          SET status = ?, error = ?
        WHERE id = ?`,
    )
    .bind(status, safeError ?? null, eventId)
    .run();
}

/** Repairs a rare split-brain where delivery completion committed but its
 * top-level event summary did not. Detailed delivery evidence remains the
 * source of truth; this only makes the searchable summary agree with it. */
async function reconcileTerminalGoreloEventStates(
  db: D1Database,
  limit = 100,
): Promise<number> {
  const boundedLimit = Math.max(1, Math.min(100, limit));
  const result = await db
    .prepare(
      `SELECT d.event_id, d.state, d.safe_error
         FROM outbound_deliveries d
         JOIN processing_events p ON p.id = d.event_id
        WHERE d.action_type IN ('create_ticket', 'create_alert')
          AND d.state IN ('succeeded', 'failed', 'uncertain')
          AND (
            (d.state = 'succeeded'
             AND (p.status <> 'forwarded' OR p.error IS NOT NULL))
            OR
            (d.state IN ('failed', 'uncertain')
             AND (p.status <> 'failed'
                  OR COALESCE(p.error, '') <> COALESCE(d.safe_error, '')))
          )
        ORDER BY d.updated_at ASC, d.id ASC
        LIMIT ?`,
    )
    .bind(boundedLimit)
    .all<TerminalEventStateRow>();
  let reconciled = 0;
  for (const row of result.results) {
    await updateProcessingEventDeliveryState(
      db,
      row.event_id,
      row.state === "succeeded" ? "forwarded" : "failed",
      row.state === "succeeded"
        ? undefined
        : (row.safe_error ?? SAFE_ERRORS.unknown),
    );
    reconciled += 1;
  }
  return reconciled;
}

/**
 * Processes only never-claimed Gorelo pending rows. Failed and uncertain rows
 * are intentionally excluded because the upstream create API has no
 * idempotency key.
 */
export async function processPendingGoreloDeliveries(
  env: Env,
  config: RuntimeConfig,
  limit = 25,
): Promise<GoreloPendingBatchResult> {
  const boundedLimit = Math.max(1, Math.min(100, limit));
  const now = new Date();
  const reconciled = await reconcileStaleGoreloClaims(env.DB, now);
  const eventReconciled = await reconcileTerminalGoreloEventStates(env.DB);
  const claimable = await listClaimableDeliveries(
    env.DB,
    now.toISOString(),
    boundedLimit,
    1,
    ["create_ticket", "create_alert"],
  );
  const candidates = claimable
    .filter(
      (delivery) =>
        delivery.state === "pending" &&
        delivery.attemptCount === 0 &&
        (delivery.actionType === "create_ticket" ||
          delivery.actionType === "create_alert"),
    )
    .slice(0, boundedLimit);
  const result: GoreloPendingBatchResult = {
    reconciled,
    eventReconciled,
    scanned: candidates.length,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    uncertain: reconciled,
    skipped: 0,
    invalid: 0,
  };

  for (const candidate of candidates) {
    const delivery = await getDelivery(env.DB, candidate.id);
    const input = delivery ? pendingInput(delivery) : null;
    if (!delivery || !input) {
      result.invalid += 1;
      if (delivery) await failInvalidPendingDelivery(env.DB, delivery, now);
      continue;
    }
    result.attempted += 1;
    try {
      const execution = await executeGoreloDelivery(env, config, input);
      if (execution.status === "skipped") {
        result.skipped += 1;
        if (execution.reason === "already_succeeded") {
          await updateProcessingEventDeliveryState(
            env.DB,
            execution.delivery.eventId,
            "forwarded",
          );
        }
      } else {
        result[execution.status] += 1;
        await updateProcessingEventDeliveryState(
          env.DB,
          execution.delivery.eventId,
          execution.status === "succeeded" ? "forwarded" : "failed",
          execution.status === "succeeded"
            ? undefined
            : execution.delivery.safeError,
        );
      }
    } catch {
      result.invalid += 1;
    }
  }
  return result;
}
