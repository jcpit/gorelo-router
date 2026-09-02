import { z } from "zod";

export const ALLOWED_GORELO_BASE_URLS = [
  "https://api.aue.gorelo.io",
  "https://api.usw.gorelo.io",
] as const;

export type GoreloBaseUrl = (typeof ALLOWED_GORELO_BASE_URLS)[number];

export type GoreloFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface GoreloClientOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: GoreloFetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface GoreloPageRequest {
  cursor?: string;
  pageSize?: number;
}

export interface GoreloContactsRequest extends GoreloPageRequest {
  clientId?: number;
}

export interface GoreloPage<T> {
  data: T[];
  totalCount: number;
  nextCursor: string | null;
  previousCursor: string | null;
  hasMore: boolean;
  hasPrevious: boolean;
}

export interface GoreloConnectionResult {
  ok: true;
  baseUrl: GoreloBaseUrl;
}

export interface GoreloClientCatalogItem {
  id: number;
  name: string;
  billingName: string | null;
  alternateName: string | null;
  status: string | null;
  isDefault: boolean;
  domains: string[];
}

export interface GoreloLocationCatalogItem {
  id: number;
  name: string;
  clientId: number;
  isDefault: boolean;
}

export interface GoreloContactCatalogItem {
  id: number;
  name: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmail: string | null;
  alias: string | null;
  clientId: number | null;
  locationId: number | null;
  status: string | null;
}

export interface GoreloAgentAssetCatalogItem {
  id: string;
  name: string;
  displayName: string | null;
  /** Original Gorelo API Name, retained even when DisplayName is present. */
  deviceName: string | null;
  clientId: number | null;
  locationId: number | null;
  serialNumber: string | null;
  status: string | null;
}

export interface GoreloUserCatalogItem {
  id: number;
  name: string;
  email: string | null;
  status: string | null;
}

export interface GoreloGroupCatalogItem {
  id: number;
  name: string;
  alias: string | null;
}

export interface GoreloTicketStatusCatalogItem {
  id: number;
  name: string;
  baseStatusId: number;
  sortOrder: number;
}

export interface GoreloTicketTagCatalogItem {
  id: number;
  name: string;
}

export interface GoreloTicketTypeCatalogItem {
  id: number;
  name: string;
}

export interface GoreloCreateTicketRequest {
  Title: string;
  StatusId: number;
  GroupId: number;
  TypeId: number;
  CreatedByName?: string;
  ClientId?: number;
  LocationId?: number;
  ContactId?: number;
  CcContactIds?: number[];
  Description?: string;
  PriorityId?: 0 | 1 | 2 | 3 | 4;
  SourceId?: 1 | 2 | 3 | 4 | 5 | 6;
  LeadAssigneeId?: number;
  AssistingAssigneeIds?: number[];
  WatcherIds?: number[];
  TagIds?: number[];
  AgentAssetIds?: string[];
  CustomAssetIds?: string[];
  UptimeIds?: string[];
  SendTicketCreatedEmail?: boolean;
  IsUnread?: boolean;
}

export interface GoreloCreateTicketResult {
  id: string;
  traceId?: string;
}

export interface GoreloCreateAlertRequest {
  Name: string;
  ClientId: number;
  Resource: string;
  Severity?: 1 | 2 | 3 | 4;
  Description?: string;
}

export interface GoreloCreateAlertResult {
  created: true;
  traceId?: string;
}

export interface GoreloClient {
  readonly baseUrl: GoreloBaseUrl;
  verifyConnection(): Promise<GoreloConnectionResult>;
  listClients(
    request?: GoreloPageRequest,
  ): Promise<GoreloPage<GoreloClientCatalogItem>>;
  listLocations(clientId: number): Promise<GoreloLocationCatalogItem[]>;
  listContacts(
    request?: GoreloContactsRequest,
  ): Promise<GoreloPage<GoreloContactCatalogItem>>;
  listAgentAssets(
    request?: GoreloPageRequest,
  ): Promise<GoreloPage<GoreloAgentAssetCatalogItem>>;
  listUsers(
    request?: GoreloPageRequest,
  ): Promise<GoreloPage<GoreloUserCatalogItem>>;
  listGroups(): Promise<GoreloGroupCatalogItem[]>;
  listTicketStatuses(): Promise<GoreloTicketStatusCatalogItem[]>;
  listTicketTags(): Promise<GoreloTicketTagCatalogItem[]>;
  listTicketTypes(): Promise<GoreloTicketTypeCatalogItem[]>;
  createTicket(
    request: GoreloCreateTicketRequest,
  ): Promise<GoreloCreateTicketResult>;
  createAlert(
    request: GoreloCreateAlertRequest,
  ): Promise<GoreloCreateAlertResult>;
}

export type GoreloClientErrorCode =
  | "invalid_configuration"
  | "timeout"
  | "network_error"
  | "redirect_error"
  | "http_error"
  | "response_too_large"
  | "invalid_response";

export type GoreloRequestFailurePhase = "request" | "response";

export type GoreloNetworkFailureReason =
  | "redirect_rejected"
  | "connection_limit"
  | "dns_failure"
  | "tls_failure"
  | "connection_failure"
  | "invalid_header"
  | "response_stream_failure"
  | "fetch_failure";

export type GoreloResponseFailureReason =
  | "response_rejected"
  | "invalid_catalog_item"
  | "invalid_pagination"
  | "invalid_payload";

export type GoreloFailureReason =
  GoreloNetworkFailureReason | GoreloResponseFailureReason;

export interface GoreloClientDiagnostic {
  phase: GoreloRequestFailurePhase;
  reason?: GoreloFailureReason;
}

/** A deliberately redacted error: it never contains the API key or response body. */
export class GoreloClientError extends Error {
  override readonly name = "GoreloClientError";

  constructor(
    readonly code: GoreloClientErrorCode,
    message: string,
    readonly status?: number,
    readonly diagnostic?: GoreloClientDiagnostic,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

const DEFAULT_TIMEOUT_MS = 8_000;
const MIN_TIMEOUT_MS = 50;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const MIN_MAX_RESPONSE_BYTES = 128;
const MAX_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_PAGE_SIZE = 200;
const MAX_DIRECT_CATALOG_ITEMS = 5_000;
const MAX_CURSOR_LENGTH = 2_048;
const MAX_CAPTURED_RETRY_AFTER_MS = 60_000;

const safeIdSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const positiveIdSchema = safeIdSchema.refine((value) => value > 0);
const optionalNameSchema = z.string().max(512).nullable().optional();
const optionalStatusSchema = z
  .object({ name: z.string().max(256).nullable().optional() })
  .nullable()
  .optional();
// Gorelo exposes .NET Guid values. Their canonical text form is 8-4-4-4-12,
// but it does not necessarily carry RFC UUID version and variant bits (for
// example, 08dcd2f6-981a-3577-6045-bdc4ac190000). Keep the strict bounded
// shape without imposing RFC 4122 version/variant semantics.
const goreloGuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const clientSchema = z.object({
  id: positiveIdSchema,
  name: optionalNameSchema,
  billingName: optionalNameSchema,
  alternateName: optionalNameSchema,
  status: optionalStatusSchema,
  isDefault: z.boolean().nullable().optional(),
  domains: z
    .array(z.object({ name: z.string().max(253).nullable().optional() }))
    .max(1_000)
    .nullable()
    .optional(),
});

const locationSchema = z.object({
  id: positiveIdSchema,
  name: optionalNameSchema,
  clientId: positiveIdSchema,
  isDefault: z.boolean().nullable().optional(),
});

const contactSchema = z.object({
  id: positiveIdSchema,
  firstName: optionalNameSchema,
  lastName: optionalNameSchema,
  primaryEmail: z.string().max(320).nullable().optional(),
  alias: z.string().max(512).nullable().optional(),
  clientId: positiveIdSchema.nullable().optional(),
  clientLocationId: positiveIdSchema.nullable().optional(),
  status: optionalStatusSchema,
});

const agentAssetSchema = z.object({
  // Gorelo has returned both UUID and numeric asset identifiers across API
  // endpoints/regions. Normalize either safe form to a string below.
  id: z.union([goreloGuidSchema, safeIdSchema]),
  name: optionalNameSchema,
  displayName: optionalNameSchema,
  clientId: safeIdSchema.nullable().optional(),
  clientLocationId: safeIdSchema.nullable().optional(),
  serialNo: z.string().max(512).nullable().optional(),
  status: optionalStatusSchema,
});

const userSchema = z.object({
  id: positiveIdSchema,
  firstName: optionalNameSchema,
  lastName: optionalNameSchema,
  email: z.string().max(320).nullable().optional(),
  status: optionalStatusSchema,
});

const groupSchema = z.object({
  id: positiveIdSchema,
  name: optionalNameSchema,
  alias: z.string().max(320).nullable().optional(),
});

const ticketStatusSchema = z.object({
  id: positiveIdSchema,
  name: optionalNameSchema,
  baseStatusId: safeIdSchema,
  sortOrder: z.number().int().min(-100_000).max(100_000),
});

const ticketTagSchema = z.object({
  id: positiveIdSchema,
  name: optionalNameSchema,
});

const ticketTypeSchema = z.object({
  id: positiveIdSchema,
  name: optionalNameSchema,
});

const ticketResponseSchema = z.object({
  statusCode: z.number().int().min(100).max(599).optional(),
  isSuccess: z.boolean(),
  data: z.object({ id: goreloGuidSchema.nullable() }).nullable(),
  dataContext: z
    .object({ traceId: z.string().max(512).nullable().optional() })
    .passthrough()
    .nullable()
    .optional(),
});

const alertResponseSchema = z.object({
  statusCode: z.number().int().min(100).max(599).optional(),
  isSuccess: z.boolean(),
  data: z.boolean(),
  dataContext: z
    .object({ traceId: z.string().max(512).nullable().optional() })
    .passthrough()
    .nullable()
    .optional(),
});

const ticketRequestSchema = z
  .object({
    Title: z.string().trim().min(1).max(998),
    CreatedByName: z.string().trim().min(1).max(320).optional(),
    ClientId: positiveIdSchema.optional(),
    LocationId: positiveIdSchema.optional(),
    ContactId: positiveIdSchema.optional(),
    CcContactIds: z.array(positiveIdSchema).max(100).optional(),
    StatusId: positiveIdSchema,
    GroupId: positiveIdSchema,
    Description: z.string().max(16_000).optional(),
    PriorityId: z
      .union([
        z.literal(0),
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
      ])
      .optional(),
    SourceId: z
      .union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
        z.literal(6),
      ])
      .optional(),
    TypeId: positiveIdSchema,
    LeadAssigneeId: positiveIdSchema.optional(),
    AssistingAssigneeIds: z.array(positiveIdSchema).max(100).optional(),
    WatcherIds: z.array(positiveIdSchema).max(100).optional(),
    TagIds: z.array(positiveIdSchema).max(100).optional(),
    AgentAssetIds: z.array(goreloGuidSchema).max(100).optional(),
    CustomAssetIds: z.array(z.string().uuid()).max(100).optional(),
    UptimeIds: z.array(z.string().uuid()).max(100).optional(),
    SendTicketCreatedEmail: z.boolean().optional(),
    IsUnread: z.boolean().optional(),
  })
  .strict();

const alertRequestSchema = z
  .object({
    Name: z.string().trim().min(1).max(998),
    ClientId: positiveIdSchema,
    Resource: z.string().trim().min(1).max(998),
    Severity: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
      .optional(),
    Description: z.string().max(16_000).optional(),
  })
  .strict();

const pageMetadataSchema = {
  totalCount: safeIdSchema,
  nextCursor: z.string().max(MAX_CURSOR_LENGTH).nullable().optional(),
  previousCursor: z.string().max(MAX_CURSOR_LENGTH).nullable().optional(),
  hasMore: z.boolean(),
  hasPrevious: z.boolean(),
};

export function normalizeGoreloBaseUrl(baseUrl: string): GoreloBaseUrl {
  if (typeof baseUrl !== "string") {
    throw configurationError("Gorelo base URL is invalid");
  }
  for (const allowed of ALLOWED_GORELO_BASE_URLS) {
    if (baseUrl === allowed || baseUrl === `${allowed}/`) return allowed;
  }
  throw configurationError("Gorelo base URL is not an allowed regional API");
}

export function createGoreloClient(options: GoreloClientOptions): GoreloClient {
  return new SecureGoreloClient(options);
}

class SecureGoreloClient implements GoreloClient {
  readonly baseUrl: GoreloBaseUrl;

  readonly #apiKey: string;
  readonly #fetch: GoreloFetch;
  readonly #timeoutMs: number;
  readonly #maxResponseBytes: number;

  constructor(options: GoreloClientOptions) {
    this.baseUrl = normalizeGoreloBaseUrl(options.baseUrl);
    this.#apiKey = validateApiKey(options.apiKey);
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = boundedInteger(
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
      "Gorelo timeout",
    );
    this.#maxResponseBytes = boundedInteger(
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      MIN_MAX_RESPONSE_BYTES,
      MAX_MAX_RESPONSE_BYTES,
      "Gorelo response limit",
    );
  }

  async verifyConnection(): Promise<GoreloConnectionResult> {
    await this.listClients({ pageSize: 1 });
    return { ok: true, baseUrl: this.baseUrl };
  }

  async listClients(
    request: GoreloPageRequest = {},
  ): Promise<GoreloPage<GoreloClientCatalogItem>> {
    const payload = await this.#get("/v1/clients", pageQuery(request));
    return parsePage(payload, clientSchema, (item) => ({
      id: item.id,
      name: label(item.name, "Client", item.id),
      billingName: optionalCatalogText(item.billingName),
      alternateName: optionalCatalogText(item.alternateName),
      status: optionalCatalogText(item.status?.name),
      isDefault: item.isDefault ?? false,
      domains: (item.domains ?? []).flatMap((domain) => {
        const name = optionalCatalogText(domain.name);
        return name ? [name.toLowerCase()] : [];
      }),
    }));
  }

  async listLocations(clientId: number): Promise<GoreloLocationCatalogItem[]> {
    const safeClientId = validatePositiveId(clientId, "Gorelo client ID");
    const payload = await this.#get(
      `/v1/clients/${encodeURIComponent(String(safeClientId))}/locations`,
    );
    return parseArray(payload, locationSchema, (item) => ({
      id: item.id,
      name: label(item.name, "Location", item.id),
      clientId: item.clientId,
      isDefault: item.isDefault ?? false,
    }));
  }

  async listContacts(
    request: GoreloContactsRequest = {},
  ): Promise<GoreloPage<GoreloContactCatalogItem>> {
    const query = pageQuery(request);
    if (request.clientId !== undefined) {
      query.set(
        "clientId",
        String(validatePositiveId(request.clientId, "Gorelo client ID")),
      );
    }
    const payload = await this.#get("/v1/contacts", query);
    return parsePage(payload, contactSchema, (item) => {
      const fullName = [item.firstName, item.lastName]
        .filter((part): part is string => Boolean(part))
        .join(" ");
      return {
        id: item.id,
        name: fullName || item.primaryEmail || label(null, "Contact", item.id),
        firstName: item.firstName ?? null,
        lastName: item.lastName ?? null,
        primaryEmail: item.primaryEmail?.toLowerCase() ?? null,
        alias: optionalCatalogText(item.alias),
        clientId: item.clientId ?? null,
        locationId: item.clientLocationId ?? null,
        status: item.status?.name ?? null,
      };
    });
  }

  async listAgentAssets(
    request: GoreloPageRequest = {},
  ): Promise<GoreloPage<GoreloAgentAssetCatalogItem>> {
    const payload = await this.#get("/v1/assets/agents", pageQuery(request));
    return parsePage(payload, agentAssetSchema, (item) => ({
      id: String(item.id),
      name: label(item.displayName ?? item.name, "Agent asset", item.id),
      displayName: item.displayName ?? null,
      deviceName: optionalCatalogText(item.name),
      clientId: item.clientId || null,
      locationId: item.clientLocationId || null,
      serialNumber: item.serialNo ?? null,
      status: item.status?.name ?? null,
    }));
  }

  async listUsers(
    request: GoreloPageRequest = {},
  ): Promise<GoreloPage<GoreloUserCatalogItem>> {
    const payload = await this.#get(
      "/v1/organization/users",
      pageQuery(request),
    );
    return parsePage(payload, userSchema, (item) => {
      const fullName = [item.firstName, item.lastName]
        .filter((part): part is string => Boolean(part))
        .join(" ");
      return {
        id: item.id,
        name: fullName || item.email || label(null, "User", item.id),
        email: item.email?.toLowerCase() ?? null,
        status: item.status?.name ?? null,
      };
    });
  }

  async listGroups(): Promise<GoreloGroupCatalogItem[]> {
    const payload = await this.#get("/v1/organization/groups");
    return parseArray(payload, groupSchema, (item) => ({
      id: item.id,
      name: label(item.name, "Group", item.id),
      alias: item.alias ?? null,
    }));
  }

  async listTicketStatuses(): Promise<GoreloTicketStatusCatalogItem[]> {
    const payload = await this.#get("/v1/tickets/statuses");
    return parseArray(payload, ticketStatusSchema, (item) => ({
      id: item.id,
      name: label(item.name, "Ticket status", item.id),
      baseStatusId: item.baseStatusId,
      sortOrder: item.sortOrder,
    }));
  }

  async listTicketTags(): Promise<GoreloTicketTagCatalogItem[]> {
    const payload = await this.#get("/v1/tickets/tags");
    return parseArray(payload, ticketTagSchema, (item) => ({
      id: item.id,
      name: label(item.name, "Ticket tag", item.id),
    }));
  }

  async listTicketTypes(): Promise<GoreloTicketTypeCatalogItem[]> {
    const payload = await this.#get("/v1/tickets/types");
    return parseArray(payload, ticketTypeSchema, (item) => ({
      id: item.id,
      name: label(item.name, "Ticket type", item.id),
    }));
  }

  async createTicket(
    request: GoreloCreateTicketRequest,
  ): Promise<GoreloCreateTicketResult> {
    const validated = ticketRequestSchema.safeParse(request);
    if (!validated.success) {
      throw configurationError("Gorelo ticket request is invalid");
    }
    const payload = await this.#post(
      "/v1/tickets",
      validated.data as GoreloCreateTicketRequest,
    );
    const parsed = ticketResponseSchema.safeParse(
      normalizeResponseEnvelope(payload),
    );
    if (!parsed.success) throw invalidEnvelope("invalid_payload");
    if (!parsed.data.isSuccess || !parsed.data.data?.id) {
      throw new GoreloClientError(
        "invalid_response",
        "Gorelo did not confirm that the ticket was created",
      );
    }
    const traceId = parsed.data.dataContext?.traceId?.trim();
    return {
      id: parsed.data.data.id,
      ...(traceId ? { traceId: traceId.slice(0, 512) } : {}),
    };
  }

  async createAlert(
    request: GoreloCreateAlertRequest,
  ): Promise<GoreloCreateAlertResult> {
    const validated = alertRequestSchema.safeParse(request);
    if (!validated.success) {
      throw configurationError("Gorelo alert request is invalid");
    }
    const payload = await this.#post(
      "/v1/alerts/",
      validated.data as GoreloCreateAlertRequest,
    );
    const parsed = alertResponseSchema.safeParse(
      normalizeResponseEnvelope(payload),
    );
    if (!parsed.success) throw invalidEnvelope("invalid_payload");
    if (!parsed.data.isSuccess || parsed.data.data !== true) {
      throw new GoreloClientError(
        "invalid_response",
        "Gorelo did not confirm that the alert was created",
      );
    }
    const traceId = parsed.data.dataContext?.traceId?.trim();
    return {
      created: true,
      ...(traceId ? { traceId: traceId.slice(0, 512) } : {}),
    };
  }

  async #get(path: string, query?: URLSearchParams): Promise<unknown> {
    const url = new URL(path, `${this.baseUrl}/`);
    if (query) url.search = query.toString();

    const abortController = new AbortController();
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        abortController.abort();
        reject(
          new GoreloClientError("timeout", "Gorelo API request timed out"),
        );
      }, this.#timeoutMs);
    });

    const operation = this.#requestJson(url, abortController.signal);
    try {
      return await Promise.race([operation, timeout]);
    } catch (error) {
      if (timedOut || abortController.signal.aborted) {
        throw new GoreloClientError("timeout", "Gorelo API request timed out");
      }
      if (error instanceof GoreloClientError) throw error;
      throw new GoreloClientError(
        "network_error",
        "Gorelo API request could not be completed",
      );
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
  }

  async #post(
    path: string,
    body: GoreloCreateTicketRequest | GoreloCreateAlertRequest,
  ): Promise<unknown> {
    const url = new URL(path, `${this.baseUrl}/`);
    const abortController = new AbortController();
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        abortController.abort();
        reject(
          new GoreloClientError("timeout", "Gorelo API request timed out"),
        );
      }, this.#timeoutMs);
    });
    const operation = this.#requestJson(url, abortController.signal, {
      method: "POST",
      body: JSON.stringify(body),
    });
    try {
      return await Promise.race([operation, timeout]);
    } catch (error) {
      if (timedOut || abortController.signal.aborted) {
        throw new GoreloClientError("timeout", "Gorelo API request timed out");
      }
      if (error instanceof GoreloClientError) throw error;
      throw new GoreloClientError(
        "network_error",
        "Gorelo API request could not be completed",
      );
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
  }

  async #requestJson(
    url: URL,
    signal: AbortSignal,
    request: { method?: "GET" | "POST"; body?: string } = {},
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: request.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...(request.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
          "X-API-Key": this.#apiKey,
        },
        ...(request.body === undefined ? {} : { body: request.body }),
        redirect: "manual",
        signal,
      });
    } catch (error) {
      throw networkFailure(error, "request");
    }

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined);
      throw new GoreloClientError(
        "redirect_error",
        "Gorelo API returned a redirect that was blocked",
        response.status,
        { phase: "response", reason: "redirect_rejected" },
      );
    }

    if (!response.ok) {
      const retryAfterMs =
        response.status === 429
          ? parseRetryAfter(response.headers.get("retry-after"))
          : undefined;
      await response.body?.cancel().catch(() => undefined);
      throw new GoreloClientError(
        "http_error",
        `Gorelo API request failed with status ${response.status}`,
        response.status,
        { phase: "response" },
        retryAfterMs,
      );
    }

    try {
      return await readBoundedJson(response, this.#maxResponseBytes);
    } catch (error) {
      if (error instanceof GoreloClientError) throw error;
      throw networkFailure(error, "response");
    }
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) return undefined;
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds)) return MAX_CAPTURED_RETRY_AFTER_MS;
    return Math.min(seconds * 1_000, MAX_CAPTURED_RETRY_AFTER_MS);
  }
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.min(
    Math.max(0, timestamp - Date.now()),
    MAX_CAPTURED_RETRY_AFTER_MS,
  );
}

function diagnosticCauseCode(error: unknown): string | undefined {
  try {
    const candidates = [
      error,
      error instanceof Error ? error.cause : undefined,
    ];
    for (const candidate of candidates) {
      if (
        candidate &&
        typeof candidate === "object" &&
        "code" in candidate &&
        typeof candidate.code === "string" &&
        /^[A-Z0-9_]{1,64}$/i.test(candidate.code)
      ) {
        return candidate.code.toUpperCase();
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function networkFailure(
  error: unknown,
  phase: GoreloRequestFailurePhase,
): GoreloClientError {
  const causeCode = diagnosticCauseCode(error);
  let reason: GoreloNetworkFailureReason;
  if (phase === "response") reason = "response_stream_failure";
  else if (
    causeCode === "ERR_WORKER_CONNECTION_LIMIT" ||
    causeCode === "ERR_WORKER_SUBREQUEST_LIMIT"
  ) {
    reason = "connection_limit";
  } else if (causeCode === "ERR_INVALID_CHAR") {
    reason = "invalid_header";
  } else if (
    causeCode === "ENOTFOUND" ||
    causeCode === "EAI_AGAIN" ||
    causeCode?.startsWith("ERR_DNS_")
  ) {
    reason = "dns_failure";
  } else if (
    causeCode?.startsWith("ERR_TLS_") ||
    causeCode === "CERT_HAS_EXPIRED" ||
    causeCode === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    causeCode === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
  ) {
    reason = "tls_failure";
  } else if (
    causeCode === "ECONNREFUSED" ||
    causeCode === "ECONNRESET" ||
    causeCode === "ETIMEDOUT" ||
    causeCode === "EHOSTUNREACH" ||
    causeCode === "ENETUNREACH" ||
    causeCode === "EPIPE" ||
    causeCode === "UND_ERR_CONNECT_TIMEOUT" ||
    causeCode === "UND_ERR_SOCKET"
  ) {
    reason = "connection_failure";
  } else reason = "fetch_failure";

  return new GoreloClientError(
    "network_error",
    "Gorelo API request could not be completed",
    undefined,
    { phase, reason },
  );
}

function configurationError(message: string): GoreloClientError {
  return new GoreloClientError("invalid_configuration", message);
}

function validateApiKey(apiKey: string): string {
  if (
    typeof apiKey !== "string" ||
    apiKey.length === 0 ||
    apiKey.length > 4_096 ||
    !/^[\x21-\x7e]+$/.test(apiKey)
  ) {
    throw configurationError("Gorelo API key is invalid");
  }
  return apiKey;
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  labelText: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw configurationError(
      `${labelText} must be between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function validatePositiveId(value: number, labelText: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw configurationError(`${labelText} must be a positive safe integer`);
  }
  return value;
}

function pageQuery(request: GoreloPageRequest): URLSearchParams {
  const query = new URLSearchParams();
  if (request.cursor !== undefined) {
    if (
      request.cursor.length === 0 ||
      request.cursor.length > MAX_CURSOR_LENGTH ||
      /[\u0000-\u001f\u007f]/.test(request.cursor)
    ) {
      throw configurationError("Gorelo pagination cursor is invalid");
    }
    query.set("cursor", request.cursor);
  }
  if (request.pageSize !== undefined) {
    query.set(
      "pageSize",
      String(boundedInteger(request.pageSize, 1, MAX_PAGE_SIZE, "Page size")),
    );
  }
  return query;
}

async function readBoundedJson(
  response: Response,
  maximumBytes: number,
): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength > maximumBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new GoreloClientError(
        "response_too_large",
        "Gorelo API response exceeded the configured size limit",
      );
    }
  }

  if (!response.body) {
    throw new GoreloClientError(
      "invalid_response",
      "Gorelo API returned an invalid response",
    );
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw new GoreloClientError(
        "response_too_large",
        "Gorelo API response exceeded the configured size limit",
      );
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new GoreloClientError(
      "invalid_response",
      "Gorelo API returned an invalid response",
    );
  }
}

function parsePage<TInput, TOutput>(
  payload: unknown,
  itemSchema: z.ZodType<TInput>,
  mapItem: (item: TInput) => TOutput,
): GoreloPage<TOutput> {
  const envelope = normalizeResponseEnvelope(payload);
  if (envelope.isSuccess === false) {
    throw invalidEnvelope("response_rejected");
  }
  const context = isPlainRecord(envelope.dataContext)
    ? normalizeKnownKeys(envelope.dataContext)
    : undefined;
  const pagination = isPlainRecord(context?.pagination)
    ? normalizeKnownKeys(context.pagination)
    : undefined;
  const normalizedPayload = {
    data: Array.isArray(envelope.data)
      ? envelope.data.map(normalizeCatalogItem)
      : envelope.data,
    totalCount: pagination?.totalCount ?? envelope.totalCount,
    nextCursor: pagination?.nextCursor ?? envelope.nextCursor,
    previousCursor: pagination?.previousCursor ?? envelope.previousCursor,
    hasMore: pagination?.hasMore ?? envelope.hasMore,
    hasPrevious: pagination?.hasPrevious ?? envelope.hasPrevious,
  };
  const schema = z.object({
    data: z.array(itemSchema).max(MAX_PAGE_SIZE).nullable(),
    ...pageMetadataSchema,
  });
  const parsed = schema.safeParse(normalizedPayload);
  if (!parsed.success) {
    const containsInvalidItem = parsed.error.issues.some(
      (issue) => issue.path[0] === "data",
    );
    throw invalidEnvelope(
      containsInvalidItem ? "invalid_catalog_item" : "invalid_pagination",
    );
  }
  return {
    data: (parsed.data.data ?? []).map(mapItem),
    totalCount: parsed.data.totalCount,
    nextCursor: parsed.data.nextCursor ?? null,
    previousCursor: parsed.data.previousCursor ?? null,
    hasMore: parsed.data.hasMore,
    hasPrevious: parsed.data.hasPrevious,
  };
}

function parseArray<TInput, TOutput>(
  payload: unknown,
  itemSchema: z.ZodType<TInput>,
  mapItem: (item: TInput) => TOutput,
): TOutput[] {
  const envelope = normalizeResponseEnvelope(payload);
  if (envelope.isSuccess === false) {
    throw invalidEnvelope("response_rejected");
  }
  const items = Array.isArray(payload) ? payload : envelope.data;
  const parsed = z
    .array(itemSchema)
    .max(MAX_DIRECT_CATALOG_ITEMS)
    .safeParse(Array.isArray(items) ? items.map(normalizeCatalogItem) : items);
  if (!parsed.success) throw invalidEnvelope("invalid_catalog_item");
  return parsed.data.map(mapItem);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

const KNOWN_RESPONSE_KEYS = [
  "statusCode",
  "isSuccess",
  "data",
  "dataContext",
  "notifications",
  "pagination",
  "totalCount",
  "nextCursor",
  "previousCursor",
  "hasMore",
  "hasPrevious",
  "traceId",
  "id",
  "name",
  "billingName",
  "alternateName",
  "status",
  "isDefault",
  "domains",
  "clientId",
  "clientLocationId",
  "firstName",
  "lastName",
  "primaryEmail",
  "displayName",
  "serialNo",
  "email",
  "alias",
  "baseStatusId",
  "sortOrder",
] as const;

function pascalCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function normalizeKnownKeys(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...value };
  for (const key of KNOWN_RESPONSE_KEYS) {
    if (normalized[key] === undefined) {
      const official = value[pascalCase(key)];
      if (official !== undefined) normalized[key] = official;
    }
  }
  return normalized;
}

function normalizeCatalogItem(value: unknown): unknown {
  if (!isPlainRecord(value)) return value;
  const normalized = normalizeKnownKeys(value);
  if (isPlainRecord(normalized.status)) {
    normalized.status = normalizeKnownKeys(normalized.status);
  }
  if (Array.isArray(normalized.domains)) {
    normalized.domains = normalized.domains.map((domain) =>
      isPlainRecord(domain) ? normalizeKnownKeys(domain) : domain,
    );
  }
  return normalized;
}

function normalizeResponseEnvelope(payload: unknown): Record<string, unknown> {
  if (!isPlainRecord(payload)) return { data: payload };
  const normalized = normalizeKnownKeys(payload);
  if (isPlainRecord(normalized.data)) {
    normalized.data = normalizeKnownKeys(normalized.data);
  }
  if (isPlainRecord(normalized.dataContext)) {
    normalized.dataContext = normalizeKnownKeys(normalized.dataContext);
  }
  return normalized;
}

function invalidEnvelope(reason: GoreloFailureReason): GoreloClientError {
  return new GoreloClientError(
    "invalid_response",
    "Gorelo API returned an unexpected response envelope",
    undefined,
    { phase: "response", reason },
  );
}

function label(
  value: string | null | undefined,
  entity: string,
  id: string | number,
): string {
  return optionalCatalogText(value) ?? `${entity} ${id}`;
}

function optionalCatalogText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  return normalized || null;
}
