export const DELIVERY_ACTION_TYPES = [
  "forward_email",
  "create_ticket",
  "create_alert",
  "send_webhook",
] as const;

export type DeliveryActionType = (typeof DELIVERY_ACTION_TYPES)[number];

export const DELIVERY_STATES = [
  "pending",
  "delivering",
  "succeeded",
  "failed",
  "uncertain",
] as const;

export type DeliveryState = (typeof DELIVERY_STATES)[number];

export type DeliveryAttemptOutcome = "succeeded" | "failed" | "uncertain";

export type DeliveryJsonPrimitive = string | number | boolean | null;

export type DeliveryJsonValue =
  DeliveryJsonPrimitive | readonly DeliveryJsonValue[] | DeliveryJsonObject;

export interface DeliveryJsonObject {
  readonly [key: string]: DeliveryJsonValue;
}

export interface DeliveryAttempt {
  id: string;
  deliveryId: string;
  attemptNumber: number;
  outcome: DeliveryAttemptOutcome;
  httpStatus?: number;
  safeError?: string;
  startedAt: string;
  endedAt: string;
}

export interface OutboundDeliverySummary {
  id: string;
  eventId: string;
  actionIndex: number;
  actionType: DeliveryActionType;
  state: DeliveryState;
  payloadDigest: string;
  parserSnapshotId?: string;
  ruleSnapshotId?: string;
  attemptCount: number;
  providerId?: string;
  safeError?: string;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt?: string;
  attemptStartedAt?: string;
  version: number;
}

export interface OutboundDelivery extends OutboundDeliverySummary {
  payloadSnapshot: DeliveryJsonObject;
}

export interface OutboundDeliveryDetail extends OutboundDelivery {
  attemptHistory: readonly DeliveryAttempt[];
}

export interface CreateDeliveryInput {
  eventId: string;
  actionIndex: number;
  actionType: DeliveryActionType;
  payloadSnapshot: Readonly<Record<string, unknown>>;
  parserSnapshotId?: string;
  ruleSnapshotId?: string;
  createdAt?: string;
}

export interface ListDeliveriesOptions {
  eventId?: string;
  state?: DeliveryState;
  limit?: number;
}

export interface DeliveryCompletionOptions {
  expectedVersion: number;
  completedAt?: string;
  httpStatus?: number;
  providerId?: string;
}

export interface DeliveryFailureOptions extends DeliveryCompletionOptions {
  safeError: string;
  nextAttemptAt?: string;
}

export interface DeliveryUncertainOptions extends DeliveryCompletionOptions {
  safeError: string;
}

export type CreateOrGetDeliveryResult = {
  status: "created" | "existing";
  delivery: OutboundDelivery;
};

export type DeliveryMutationResult =
  | { status: "updated"; delivery: OutboundDelivery }
  | { status: "not_found" | "conflict" | "not_due" };
