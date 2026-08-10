import {
  archiveRawMessage,
  deleteArchivedMessage,
  type ArchivedMessage,
} from "./archive";
import { buildMessageAudit } from "./audit";
import { loadConfig } from "./config";
import { resolveClientIdentity } from "./client-directory";
import { extractWebhookVariables, WebhookExtractionError } from "./extraction";
import { prepareGoreloAction } from "./gorelo-action";
import {
  executeGoreloDelivery,
  GORELO_DELIVERY_SCHEMA_VERSION,
  type ExecuteGoreloDeliveryInput,
  type GoreloDeliveryExecutionResult,
} from "./gorelo-delivery";
import {
  extractBasicEmailFacts,
  extractEmailFacts,
  readRawMessage,
} from "./mime";
import {
  listRules,
  recordEvent,
  recordEventWithPendingStructuredDelivery,
  recordEventWithPendingWebhookDelivery,
  updateEventProcessingOutcome,
  type RecordEventOptions,
} from "./repository";
import { loadGoreloMailboxDirectory } from "./mailbox-repository";
import {
  claimMatchingParserCapture,
  failParserCapture,
  PARSER_CAPTURE_SAMPLE_RETENTION_MS,
  type ParserCapture,
} from "./parser-capture-repository";
import { deleteParserSample, storeParserSample } from "./parser-sample";
import { decide, decideWithoutMime } from "./rules";
import { assessSpam } from "./spam";
import type {
  AuditTraceStep,
  Decision,
  EmailFacts,
  Env,
  ProcessingEvent,
  ProcessingStatus,
  QuarantineReview,
  RuntimeConfig,
} from "./types";
import {
  executeWebhookDelivery,
  prepareWebhookDeliveryPayload,
  type ExecuteWebhookDeliveryInput,
} from "./webhook-delivery";

function cleanSmtpReason(reason: string): string {
  const cleaned = reason
    .replace(/[\r\n]+/g, " ")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, 200);
  return cleaned || "Message rejected by policy";
}

function cleanHeaderValue(value: string, maximumLength: number): string {
  return value
    .replace(/[\r\n\0]+/g, " ")
    .replace(/[^\x20-\x7E]/g, "?")
    .trim()
    .slice(0, maximumLength);
}

function safeError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Unknown processing error";
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}

function logSafeError(error: unknown): string {
  return safeError(error).replace(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    "[email]",
  );
}

function cloudflareCanForward(message: ForwardableEmailMessage): boolean {
  return (
    (
      message as ForwardableEmailMessage & {
        readonly canBeForwarded?: boolean;
      }
    ).canBeForwarded === true
  );
}

interface PreparedParserCapture {
  readonly objectKey: string;
  readonly record: NonNullable<RecordEventOptions["parserCapture"]>;
}

function eventRecordOptions(
  archived: ArchivedMessage | undefined,
  capture: PreparedParserCapture | undefined,
): RecordEventOptions {
  return {
    ...(archived ?? {}),
    ...(capture ? { parserCapture: capture.record } : {}),
  };
}

async function failClaimedParserCapture(
  db: D1Database,
  capture: ParserCapture,
  eventId: string,
  safeErrorCode: string,
): Promise<void> {
  await failParserCapture(db, capture.id, {
    expectedVersion: capture.version,
    claimEventId: eventId,
    safeErrorCode,
  }).catch(() => undefined);
}

function forwardingHeaders(
  decision: Decision,
  originalRecipient: string,
): Headers {
  const headers = new Headers();
  headers.set("X-Mail-Parser-Decision", decision.type);
  headers.set("X-Mail-Parser-Spam-Score", String(decision.spam.score));
  headers.set(
    "X-Mail-Parser-Original-Recipient",
    cleanHeaderValue(originalRecipient, 320),
  );
  if (decision.matchedRuleId) {
    headers.set(
      "X-Mail-Parser-Rule-Id",
      cleanHeaderValue(decision.matchedRuleId, 128),
    );
  }
  if (decision.spam.reasons.length > 0) {
    headers.set(
      "X-Mail-Parser-Spam-Reasons",
      cleanHeaderValue(decision.spam.reasons.join("; "), 1000),
    );
  }
  return headers;
}

function eventFor(
  facts: EmailFacts,
  decision: Decision,
  status: ProcessingStatus,
  options: {
    id?: string;
    createdAt?: string;
    config?: RuntimeConfig;
    trace?: readonly AuditTraceStep[];
    quarantine?: QuarantineReview;
    error?: string;
  } = {},
): ProcessingEvent {
  const createdAt = options.createdAt ?? new Date().toISOString();
  return {
    id: options.id ?? crypto.randomUUID(),
    messageId: facts.messageId.slice(0, 998),
    envelopeFrom: facts.envelopeFrom.slice(0, 320),
    envelopeTo: facts.envelopeTo.slice(0, 320),
    subject: facts.subject.slice(0, 998),
    rawSize: facts.rawSize,
    spamScore: decision.spam.score,
    spamReasons: decision.spam.reasons
      .slice(0, 20)
      .map((reason) => reason.slice(0, 200)),
    decision: decision.type,
    ...(decision.matchedRuleId
      ? { matchedRuleId: decision.matchedRuleId }
      : {}),
    ...(decision.matchedRuleName
      ? { matchedRuleName: decision.matchedRuleName.slice(0, 120) }
      : {}),
    ...(decision.destination
      ? { destination: decision.destination.slice(0, 320) }
      : {}),
    ...(decision.destinationMailboxId
      ? { destinationMailboxId: decision.destinationMailboxId }
      : {}),
    ...(decision.destinationMailboxName
      ? {
          destinationMailboxName: decision.destinationMailboxName.slice(0, 120),
        }
      : {}),
    status,
    ...(options.error ? { error: options.error } : {}),
    ...(options.config
      ? {
          audit: buildMessageAudit(
            facts,
            decision,
            options.config,
            options.trace ?? [],
          ),
        }
      : {}),
    ...(options.quarantine ? { quarantine: options.quarantine } : {}),
    createdAt,
  };
}

async function prepareWebhookData(
  env: Env,
  facts: EmailFacts,
  decision: Decision,
): Promise<{
  data: Readonly<Record<string, unknown>>;
  preflightError?: "extraction_failed" | "client_resolution_failed";
}> {
  if (!decision.webhook) return { data: {} };
  let variables: Record<string, string>;
  try {
    variables = extractWebhookVariables(facts, decision.webhook.fields);
  } catch (error) {
    if (error instanceof WebhookExtractionError) {
      return { data: { variables: {} }, preflightError: "extraction_failed" };
    }
    return { data: { variables: {} }, preflightError: "extraction_failed" };
  }

  if (!decision.webhook.clientIdentityField) {
    return { data: { variables } };
  }
  const identity = variables[decision.webhook.clientIdentityField] ?? "";
  if (!identity.trim()) {
    return {
      data: { variables },
      preflightError: "client_resolution_failed",
    };
  }
  try {
    const resolution = await resolveClientIdentity(env.DB, identity, {
      scope: decision.webhook.clientAliasScope ?? "global",
    });
    if (resolution.status !== "resolved") {
      return {
        data: { variables },
        preflightError: "client_resolution_failed",
      };
    }
    return {
      data: {
        variables,
        goreloClient: {
          id: resolution.client.id,
          name: resolution.client.name,
          matchedBy: resolution.matchedBy,
        },
      },
    };
  } catch {
    return {
      data: { variables },
      preflightError: "client_resolution_failed",
    };
  }
}

function deliverWebhookInBackground(
  context: ExecutionContext,
  env: Env,
  config: RuntimeConfig,
  input: ExecuteWebhookDeliveryInput,
): void {
  context.waitUntil(
    (async () => {
      try {
        const result = await executeWebhookDelivery(env, config, input);
        console.log("Webhook delivery recorded", {
          eventId: input.eventId,
          deliveryId: result.delivery.id,
          state: result.delivery.state,
        });
      } catch {
        console.error("Webhook delivery orchestration failed", {
          eventId: input.eventId,
        });
      }
    })(),
  );
}

async function forward(
  message: ForwardableEmailMessage,
  decision: Decision,
): Promise<void> {
  if (!decision.destination) {
    throw new Error(`${decision.type} decision has no destination`);
  }
  const forwardingCapability = message as ForwardableEmailMessage & {
    readonly canBeForwarded?: boolean;
  };
  if (forwardingCapability.canBeForwarded === false) {
    throw new Error("Cloudflare marked this message as not forwardable");
  }
  await message.forward(
    decision.destination,
    forwardingHeaders(decision, message.to),
  );
}

function directDeliverySucceeded(
  result: GoreloDeliveryExecutionResult,
): boolean {
  return (
    result.status === "succeeded" ||
    (result.status === "skipped" && result.reason === "already_succeeded")
  );
}

function directDeliveryDefinitivelyFailed(
  result: GoreloDeliveryExecutionResult,
): boolean {
  return (
    result.status === "failed" ||
    (result.status === "skipped" && result.reason === "terminal_failure")
  );
}

async function updateRecordedEvent(
  env: Env,
  facts: EmailFacts,
  decision: Decision,
  config: RuntimeConfig,
  eventId: string,
  trace: readonly AuditTraceStep[],
  status: ProcessingStatus,
  error?: string,
): Promise<boolean> {
  const updated = await updateEventProcessingOutcome(env.DB, eventId, {
    status,
    ...(error ? { error } : {}),
    audit: buildMessageAudit(facts, decision, config, trace),
  });
  if (!updated) {
    console.error("Unable to update processing event", { eventId });
  }
  return updated;
}

async function handleDirectGoreloAction(
  message: ForwardableEmailMessage,
  env: Env,
  config: RuntimeConfig,
  facts: EmailFacts,
  decision: Decision,
  eventId: string,
  receivedAt: string,
  trace: AuditTraceStep[],
  archived: ArchivedMessage,
  parserCapture?: PreparedParserCapture,
): Promise<void> {
  const goreloAction = decision.gorelo?.action;
  if (!goreloAction) throw new Error("Gorelo action decision is incomplete");

  const prepared = await prepareGoreloAction(env.DB, facts, goreloAction);
  trace.push({
    stage: "Gorelo mapping",
    outcome: prepared.preflightError ? "error" : "success",
    detail: prepared.preflightError
      ? "Structured field extraction or exact client resolution failed"
      : `Prepared an API-only Gorelo ${prepared.actionType === "create_ticket" ? "ticket" : "alert"} request`,
    at: new Date().toISOString(),
  });

  const pendingEvent = eventFor(facts, decision, "failed", {
    id: eventId,
    createdAt: receivedAt,
    config,
    trace,
    error: "Structured Gorelo delivery is pending",
  });
  const deliveryInput = {
    eventId,
    actionIndex: 0,
    actionType: prepared.actionType,
    data: prepared.data,
    ...(decision.matchedRuleSnapshotId
      ? { ruleSnapshotId: decision.matchedRuleSnapshotId }
      : {}),
    ...(prepared.preflightError
      ? { preflightError: prepared.preflightError }
      : { request: prepared.request! }),
  } as ExecuteGoreloDeliveryInput;
  try {
    await recordEventWithPendingStructuredDelivery(
      env.DB,
      pendingEvent,
      {
        actionType: prepared.actionType,
        payloadSnapshot: {
          schemaVersion: GORELO_DELIVERY_SCHEMA_VERSION,
          region: config.goreloRegion,
          request: prepared.request ?? null,
          data: prepared.data,
        },
        ...(decision.matchedRuleSnapshotId
          ? { ruleSnapshotId: decision.matchedRuleSnapshotId }
          : {}),
      },
      eventRecordOptions(archived, parserCapture),
    );
  } catch (error) {
    await deleteArchivedMessage(env.MESSAGE_ARCHIVE, archived.objectKey).catch(
      () => undefined,
    );
    throw error;
  }

  let result: GoreloDeliveryExecutionResult;
  try {
    result = await executeGoreloDelivery(env, config, deliveryInput);
  } catch {
    const error =
      "Gorelo delivery orchestration ended with an uncertain outcome";
    trace.push({
      stage: "Gorelo API",
      outcome: "warning",
      detail: `${error}; no fallback or automatic replay was attempted`,
      at: new Date().toISOString(),
    });
    await updateRecordedEvent(
      env,
      facts,
      decision,
      config,
      eventId,
      trace,
      "failed",
      error,
    ).catch(() => undefined);
    return;
  }

  if (directDeliverySucceeded(result)) {
    trace.push({
      stage: "Gorelo API",
      outcome: "success",
      detail:
        prepared.actionType === "create_ticket"
          ? "Gorelo confirmed ticket creation"
          : "Gorelo confirmed alert creation",
      at: new Date().toISOString(),
    });
    await updateRecordedEvent(
      env,
      facts,
      decision,
      config,
      eventId,
      trace,
      "forwarded",
    ).catch(() => undefined);
    return;
  }

  const safeDeliveryError =
    result.delivery.safeError ??
    (directDeliveryDefinitivelyFailed(result)
      ? "Gorelo rejected the structured action"
      : "Gorelo action requires manual review");
  if (!directDeliveryDefinitivelyFailed(result)) {
    trace.push({
      stage: "Gorelo API",
      outcome: "warning",
      detail:
        "The create outcome is uncertain; the message was accepted and held without fallback or automatic replay",
      at: new Date().toISOString(),
    });
    await updateRecordedEvent(
      env,
      facts,
      decision,
      config,
      eventId,
      trace,
      "failed",
      safeDeliveryError,
    ).catch(() => undefined);
    return;
  }

  trace.push({
    stage: "Gorelo API",
    outcome: "error",
    detail: safeDeliveryError,
    at: new Date().toISOString(),
  });
  const failureDestination = config.failureForwardAddress;
  if (failureDestination) {
    const fallbackDecision: Decision = {
      type:
        config.quarantineAddress === failureDestination
          ? "quarantine"
          : "forward",
      destination: failureDestination,
      reason: "definitive Gorelo API failure fallback",
      spam: decision.spam,
      ...(decision.matchedRuleId
        ? { matchedRuleId: decision.matchedRuleId }
        : {}),
      ...(decision.matchedRuleName
        ? { matchedRuleName: decision.matchedRuleName }
        : {}),
    };
    try {
      await forward(message, fallbackDecision);
      trace.push({
        stage: "failure route",
        outcome: "success",
        detail: `Cloudflare accepted the fallback forward to ${failureDestination}`,
        at: new Date().toISOString(),
      });
    } catch (error) {
      message.setReject("Mail processing failed");
      trace.push({
        stage: "failure route",
        outcome: "error",
        detail: `Fallback failed: ${safeError(error)}`,
        at: new Date().toISOString(),
      });
    }
  } else {
    message.setReject("Mail processing failed");
  }
  await updateRecordedEvent(
    env,
    facts,
    decision,
    config,
    eventId,
    trace,
    "failed",
    safeDeliveryError,
  ).catch(() => undefined);
}

async function handleProcessingFailure(
  message: ForwardableEmailMessage,
  env: Env,
  config: RuntimeConfig | undefined,
  facts: EmailFacts | undefined,
  attemptedDecision: Decision | undefined,
  eventId: string,
  receivedAt: string,
  trace: AuditTraceStep[],
  archived: ArchivedMessage | undefined,
  parserCapture: PreparedParserCapture | undefined,
  eventRecorded: boolean,
  error: unknown,
): Promise<void> {
  const errorMessage = safeError(error);
  trace.push({
    stage: "processing",
    outcome: "error",
    detail: errorMessage,
    at: new Date().toISOString(),
  });
  console.error("Email processing failed", {
    rawSize: message.rawSize,
    error: logSafeError(error),
  });

  let failureEventRecorded = eventRecorded;
  const persistFailure = async (
    outcomeDecision: Decision,
    storedError: string,
  ): Promise<boolean> => {
    if (!facts) return false;
    if (failureEventRecorded && config) {
      try {
        return await updateRecordedEvent(
          env,
          facts,
          attemptedDecision ?? outcomeDecision,
          config,
          eventId,
          trace,
          "failed",
          storedError,
        );
      } catch (updateError) {
        console.error("Unable to update failed processing event", {
          eventId,
          error: logSafeError(updateError),
        });
        return false;
      }
    }
    const event = eventFor(facts, outcomeDecision, "failed", {
      id: eventId,
      createdAt: receivedAt,
      ...(config ? { config } : {}),
      trace,
      error: storedError,
    });
    try {
      await recordEvent(
        env.DB,
        event,
        eventRecordOptions(archived, parserCapture),
      );
      failureEventRecorded = true;
      return true;
    } catch (recordError) {
      await deleteArchivedMessage(
        env.MESSAGE_ARCHIVE,
        archived?.objectKey,
      ).catch(() => undefined);
      await deleteParserSample(
        env.MESSAGE_ARCHIVE,
        parserCapture?.objectKey,
      ).catch(() => undefined);
      console.error("Unable to record failed processing event", {
        eventId,
        error: logSafeError(recordError),
      });
      return false;
    }
  };

  if (!config?.failureForwardAddress) {
    message.setReject("Mail processing failed");
    if (facts) {
      const failureDecision: Decision = {
        type: "reject",
        reason: "processing failure",
        spam: attemptedDecision?.spam ?? {
          score: 0,
          reasons: ["processing failure"],
          isSpam: false,
        },
        ...(attemptedDecision?.matchedRuleId
          ? { matchedRuleId: attemptedDecision.matchedRuleId }
          : {}),
        ...(attemptedDecision?.matchedRuleName
          ? { matchedRuleName: attemptedDecision.matchedRuleName }
          : {}),
      };
      await persistFailure(failureDecision, errorMessage);
    }
    return;
  }

  const fallbackDecision: Decision = {
    type:
      config.quarantineAddress === config.failureForwardAddress
        ? "quarantine"
        : "forward",
    destination: config.failureForwardAddress,
    reason: "processing failure fallback",
    spam: attemptedDecision?.spam ?? {
      score: 0,
      reasons: ["processing failure"],
      isSpam: false,
    },
    ...(attemptedDecision?.matchedRuleId
      ? { matchedRuleId: attemptedDecision.matchedRuleId }
      : {}),
    ...(attemptedDecision?.matchedRuleName
      ? { matchedRuleName: attemptedDecision.matchedRuleName }
      : {}),
  };

  if (!(await persistFailure(fallbackDecision, errorMessage))) {
    message.setReject("Mail processing failed");
    return;
  }

  try {
    trace.push({
      stage: "failure route",
      outcome: "info",
      detail: `Attempting the configured failure destination ${fallbackDecision.destination}`,
      at: new Date().toISOString(),
    });
    await forward(message, fallbackDecision);
    trace.push({
      stage: "failure route",
      outcome: "success",
      detail: "Cloudflare accepted the fallback forward",
      at: new Date().toISOString(),
    });
    await persistFailure(fallbackDecision, errorMessage);
  } catch (fallbackError) {
    message.setReject("Mail processing failed");
    trace.push({
      stage: "failure route",
      outcome: "error",
      detail: `Fallback failed: ${safeError(fallbackError)}`,
      at: new Date().toISOString(),
    });
    await persistFailure(
      fallbackDecision,
      `${errorMessage}; fallback: ${safeError(fallbackError)}`,
    );
  }
}

export async function handleEmail(
  message: ForwardableEmailMessage,
  env: Env,
  context: ExecutionContext,
): Promise<void> {
  const eventId = crypto.randomUUID();
  const receivedAt = new Date().toISOString();
  const trace: AuditTraceStep[] = [
    {
      stage: "received",
      outcome: "info",
      detail: `Cloudflare accepted ${message.rawSize} bytes for processing`,
      at: receivedAt,
    },
  ];
  let config: RuntimeConfig | undefined;
  let facts: EmailFacts | undefined;
  let decision: Decision | undefined;
  let raw: ArrayBuffer | undefined;
  let archived: ArchivedMessage | undefined;
  let claimedParserCapture: ParserCapture | undefined;
  let preparedParserCapture: PreparedParserCapture | undefined;
  let eventRecorded = false;

  try {
    facts = extractBasicEmailFacts(message);
    config = loadConfig(env);
    if (config.quarantineMode === "internal" && !env.MESSAGE_ARCHIVE) {
      throw new Error(
        "Internal quarantine requires the MESSAGE_ARCHIVE R2 binding",
      );
    }
    const [rules, mailboxDirectory] = await Promise.all([
      listRules(env.DB),
      loadGoreloMailboxDirectory(env.DB, {
        allowedAddresses: config.allowedForwardDestinations,
        bootstrapAddress: config.defaultGoreloAddress,
      }),
    ]);
    let spam = assessSpam(facts, config);
    decision = decideWithoutMime(
      { ...facts, spam },
      rules,
      config,
      mailboxDirectory,
    );
    if (!decision) {
      if (message.rawSize > config.maxParseBytes) {
        throw new Error(
          `Message requires MIME inspection but exceeds MAX_PARSE_BYTES (${message.rawSize} bytes)`,
        );
      }
      raw = await readRawMessage(message);
      facts = await extractEmailFacts(message, rules, config, raw);
      spam = assessSpam(facts, config);
      decision = decide({ ...facts, spam }, rules, config, mailboxDirectory);
    }

    // A one-time teaching request is observational, but it must not be
    // consumed by mail the policy has classified as spam or unsafe to route.
    // Matching still uses envelope facts, so the dashboard defaults to the
    // narrowest practical sender mode and operators should keep the window
    // short.
    if (
      env.MESSAGE_ARCHIVE &&
      cloudflareCanForward(message) &&
      !spam.isSpam &&
      decision.type === "forward" &&
      message.rawSize <= config.maxParseBytes
    ) {
      try {
        const claim = await claimMatchingParserCapture(
          env.DB,
          {
            eventId,
            envelopeFrom: facts.envelopeFrom,
            envelopeTo: facts.envelopeTo,
            subject: facts.subject,
          },
          receivedAt,
        );
        if (claim.status === "claimed") {
          claimedParserCapture = claim.capture;
          trace.push({
            stage: "parser sample",
            outcome: "info",
            detail:
              "A Cloudflare-forwardable, non-spam message matched an active one-time parser teaching capture",
            at: new Date().toISOString(),
          });
        }
      } catch {
        trace.push({
          stage: "parser sample",
          outcome: "warning",
          detail:
            "Parser sample matching was unavailable; normal routing continued",
          at: new Date().toISOString(),
        });
      }
    }

    let parserSampleFacts: EmailFacts | undefined;
    if (claimedParserCapture) {
      if (facts.mimeParsed) {
        parserSampleFacts = facts;
      } else {
        try {
          raw ??= await readRawMessage(message);
          parserSampleFacts = await extractEmailFacts(
            message,
            rules,
            config,
            raw,
            true,
          );
        } catch {
          await failClaimedParserCapture(
            env.DB,
            claimedParserCapture,
            eventId,
            "mime_parse_failed",
          );
          claimedParserCapture = undefined;
          trace.push({
            stage: "parser sample",
            outcome: "warning",
            detail:
              "The teaching sample could not be parsed; normal routing continued",
            at: new Date().toISOString(),
          });
        }
      }
    }

    if (claimedParserCapture && parserSampleFacts && env.MESSAGE_ARCHIVE) {
      try {
        const capturedAt = new Date().toISOString();
        const stored = await storeParserSample(
          env.MESSAGE_ARCHIVE,
          eventId,
          parserSampleFacts,
          capturedAt,
          parserSampleFacts.bodyText.length >= config.maxBodyCharacters,
        );
        preparedParserCapture = {
          objectKey: stored.objectKey,
          record: {
            id: claimedParserCapture.id,
            input: {
              expectedVersion: claimedParserCapture.version,
              claimEventId: eventId,
              capturedEventId: eventId,
              objectKey: stored.objectKey,
              sha256: stored.sha256,
              size: stored.size,
              capturedAt,
              sampleExpiresAt: new Date(
                Date.parse(capturedAt) + PARSER_CAPTURE_SAMPLE_RETENTION_MS,
              ).toISOString(),
            },
          },
        };
        trace.push({
          stage: "parser sample",
          outcome: "success",
          detail:
            "A normalized plain-text teaching sample was retained temporarily",
          at: capturedAt,
        });
      } catch {
        await failClaimedParserCapture(
          env.DB,
          claimedParserCapture,
          eventId,
          "sample_storage_failed",
        );
        claimedParserCapture = undefined;
        trace.push({
          stage: "parser sample",
          outcome: "warning",
          detail:
            "The teaching sample could not be retained; normal routing continued",
          at: new Date().toISOString(),
        });
      }
    }

    trace.push({
      stage: "inspection",
      outcome: "info",
      detail: facts.mimeParsed
        ? `MIME parsed; ${facts.attachments.length} attachment${facts.attachments.length === 1 ? "" : "s"} observed`
        : "Envelope and headers were sufficient; MIME parsing was not needed",
      at: new Date().toISOString(),
    });
    trace.push({
      stage: "spam policy",
      outcome: spam.isSpam ? "warning" : "success",
      detail: `Score ${spam.score} against threshold ${config.spamThreshold}${spam.reasons.length ? `: ${spam.reasons.join("; ")}` : ""}`,
      at: new Date().toISOString(),
    });
    trace.push({
      stage: "rule decision",
      outcome:
        decision.type === "drop" || decision.type === "reject"
          ? "warning"
          : "info",
      detail: `${decision.reason}${decision.matchedRuleName ? `; matched ${decision.matchedRuleName}` : ""}`,
      at: new Date().toISOString(),
    });

    if (decision.gorelo && !env.MESSAGE_ARCHIVE) {
      throw new Error(
        "API-only Gorelo actions require the private MESSAGE_ARCHIVE binding",
      );
    }

    const shouldArchive =
      config.archiveMode === "all" ||
      decision.gorelo !== undefined ||
      (decision.type === "quarantine" && config.archiveMode !== "none") ||
      (decision.type === "quarantine" && config.quarantineMode === "internal");
    if (shouldArchive) {
      if (!env.MESSAGE_ARCHIVE) {
        trace.push({
          stage: "archive",
          outcome: "warning",
          detail: "Raw archive storage is not configured",
          at: new Date().toISOString(),
        });
      } else {
        try {
          raw ??= await readRawMessage(message);
          archived = await archiveRawMessage(
            env.MESSAGE_ARCHIVE,
            eventId,
            raw,
            receivedAt,
          );
          trace.push({
            stage: "archive",
            outcome: "success",
            detail:
              "Original RFC 5322 message stored with a retention-bound opaque key",
            at: new Date().toISOString(),
          });
        } catch (archiveError) {
          trace.push({
            stage: "archive",
            outcome: "error",
            detail: safeError(archiveError),
            at: new Date().toISOString(),
          });
          if (
            (decision.type === "quarantine" &&
              config.quarantineMode === "internal") ||
            decision.gorelo !== undefined
          ) {
            throw archiveError;
          }
        }
      }
    }

    const quarantine: QuarantineReview | undefined =
      decision.type === "quarantine" && config.quarantineMode === "internal"
        ? {
            state: "pending",
            version: 1,
            expiresAt: new Date(
              Date.parse(receivedAt) +
                config.eventRetentionDays * 24 * 60 * 60 * 1_000,
            ).toISOString(),
            rawAvailable: Boolean(archived),
          }
        : undefined;

    if (
      decision.type === "quarantine" &&
      config.quarantineMode === "internal"
    ) {
      if (!archived) {
        throw new Error("Internal quarantine could not retain the raw message");
      }
      trace.push({
        stage: "quarantine",
        outcome: "success",
        detail: "Held internally; no destination forward was attempted",
        at: new Date().toISOString(),
      });
      const event = eventFor(facts, decision, "quarantined", {
        id: eventId,
        createdAt: receivedAt,
        config,
        trace,
        quarantine: quarantine!,
      });
      try {
        await recordEvent(
          env.DB,
          event,
          eventRecordOptions(archived, preparedParserCapture),
        );
        eventRecorded = true;
      } catch (recordError) {
        await deleteArchivedMessage(
          env.MESSAGE_ARCHIVE,
          archived.objectKey,
        ).catch(() => undefined);
        await deleteParserSample(
          env.MESSAGE_ARCHIVE,
          preparedParserCapture?.objectKey,
        ).catch(() => undefined);
        preparedParserCapture = undefined;
        archived = undefined;
        throw recordError;
      }
      return;
    }

    if (decision.gorelo) {
      if (!archived) {
        throw new Error(
          "API-only Gorelo action could not retain the original message",
        );
      }
      await handleDirectGoreloAction(
        message,
        env,
        config,
        facts,
        decision,
        eventId,
        receivedAt,
        trace,
        archived,
        preparedParserCapture,
      );
      eventRecorded = true;
      return;
    }

    switch (decision.type) {
      case "forward":
      case "quarantine": {
        let webhookInput: ExecuteWebhookDeliveryInput | undefined;
        let webhookPayload: Readonly<Record<string, unknown>> | undefined;
        if (decision.webhook) {
          const prepared = await prepareWebhookData(env, facts, decision);
          webhookInput = {
            eventId,
            actionIndex: 0,
            destinationId: decision.webhook.destinationId,
            eventType: decision.webhook.eventType,
            data: prepared.data,
            ...(decision.matchedRuleSnapshotId
              ? { ruleSnapshotId: decision.matchedRuleSnapshotId }
              : {}),
            ...(prepared.preflightError
              ? { preflightError: prepared.preflightError }
              : {}),
          };
          webhookPayload = await prepareWebhookDeliveryPayload(
            env.DB,
            webhookInput,
          );
          trace.push({
            stage: "webhook",
            outcome: "info",
            detail:
              "A signed webhook action was durably queued before the primary forward",
            at: new Date().toISOString(),
          });
        }
        trace.push({
          stage: decision.type === "quarantine" ? "review mailbox" : "forward",
          outcome: "info",
          detail: `Requesting Cloudflare forward to ${decision.destination}`,
          at: new Date().toISOString(),
        });
        const pendingEvent = eventFor(facts, decision, "failed", {
          id: eventId,
          createdAt: receivedAt,
          config,
          trace,
          error: "Primary email forward has not been confirmed",
        });
        if (decision.webhook && webhookInput && webhookPayload) {
          await recordEventWithPendingWebhookDelivery(
            env.DB,
            pendingEvent,
            {
              actionType: "send_webhook",
              payloadSnapshot: webhookPayload,
              ...(decision.matchedRuleSnapshotId
                ? { ruleSnapshotId: decision.matchedRuleSnapshotId }
                : {}),
            },
            eventRecordOptions(archived, preparedParserCapture),
          );
        } else {
          await recordEvent(
            env.DB,
            pendingEvent,
            eventRecordOptions(archived, preparedParserCapture),
          );
        }
        eventRecorded = true;
        try {
          await forward(message, decision);
        } catch (forwardError) {
          if (webhookInput) {
            await executeWebhookDelivery(env, config, {
              ...webhookInput,
              preflightError: "primary_forward_failed",
            }).catch(() => undefined);
          }
          throw forwardError;
        }
        trace.push({
          stage: decision.type === "quarantine" ? "review mailbox" : "forward",
          outcome: "success",
          detail:
            "Cloudflare accepted the forward request; downstream delivery is not asserted",
          at: new Date().toISOString(),
        });
        await updateRecordedEvent(
          env,
          facts,
          decision,
          config,
          eventId,
          trace,
          decision.type === "quarantine" ? "quarantined" : "forwarded",
        ).catch((updateError) => {
          console.error("Unable to confirm forwarded processing event", {
            eventId,
            error: logSafeError(updateError),
          });
        });
        if (webhookInput) {
          deliverWebhookInBackground(context, env, config, webhookInput);
        }
        return;
      }
      case "drop": {
        trace.push({
          stage: "drop",
          outcome: "warning",
          detail: "Message accepted without forwarding by explicit policy",
          at: new Date().toISOString(),
        });
        await recordEvent(
          env.DB,
          eventFor(facts, decision, "dropped", {
            id: eventId,
            createdAt: receivedAt,
            config,
            trace,
          }),
          eventRecordOptions(archived, preparedParserCapture),
        );
        eventRecorded = true;
        return;
      }
      case "reject": {
        trace.push({
          stage: "reject",
          outcome: "warning",
          detail: "Permanent SMTP rejection set by policy",
          at: new Date().toISOString(),
        });
        await recordEvent(
          env.DB,
          eventFor(facts, decision, "rejected", {
            id: eventId,
            createdAt: receivedAt,
            config,
            trace,
          }),
          eventRecordOptions(archived, preparedParserCapture),
        );
        eventRecorded = true;
        message.setReject(cleanSmtpReason(decision.reason));
        return;
      }
    }
  } catch (error) {
    if (!eventRecorded && preparedParserCapture) {
      await deleteParserSample(
        env.MESSAGE_ARCHIVE,
        preparedParserCapture.objectKey,
      ).catch(() => undefined);
      if (claimedParserCapture) {
        await failClaimedParserCapture(
          env.DB,
          claimedParserCapture,
          eventId,
          "event_commit_failed",
        );
      }
      preparedParserCapture = undefined;
    } else if (!eventRecorded && claimedParserCapture) {
      await failClaimedParserCapture(
        env.DB,
        claimedParserCapture,
        eventId,
        "processing_failed",
      );
    }
    await handleProcessingFailure(
      message,
      env,
      config,
      facts,
      decision,
      eventId,
      receivedAt,
      trace,
      archived,
      preparedParserCapture,
      eventRecorded,
      error,
    );
  }
}
