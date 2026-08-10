import { resolveClientIdentity } from "./client-directory";
import { canonicalizeDeliveryPayload } from "./delivery-repository";
import { extractWebhookVariables } from "./extraction";
import type {
  GoreloCreateAlertRequest,
  GoreloCreateTicketRequest,
} from "./gorelo";
import type { EmailFacts, GoreloRuleAction } from "./types";

export type GoreloActionPreflightError =
  "extraction_failed" | "client_resolution_failed" | "mapping_failed";

export interface PreparedGoreloAction {
  actionType: "create_ticket" | "create_alert";
  data: Readonly<Record<string, unknown>>;
  request?: GoreloCreateTicketRequest | GoreloCreateAlertRequest;
  preflightError?: GoreloActionPreflightError;
}

interface FixedClientRow {
  id: number;
  name: string;
  last_seen_at: string;
  last_synced_at: string | null;
}

interface ResolvedClientAudit {
  id: number;
  name: string;
  matchedBy: string;
}

const TEMPLATE_REFERENCE = /{{\s*([A-Za-z_][A-Za-z0-9_]{0,63})\s*}}/g;

function renderTemplate(
  template: string,
  variables: Readonly<Record<string, string>>,
  maximum: number,
  required: boolean,
): string | undefined {
  let invalid = false;
  const rendered = template.replace(
    TEMPLATE_REFERENCE,
    (_placeholder, key: string) => {
      if (!Object.prototype.hasOwnProperty.call(variables, key)) {
        invalid = true;
        return "";
      }
      return variables[key] ?? "";
    },
  );
  if (invalid || rendered.includes("{{") || rendered.includes("}}")) {
    throw new Error("Gorelo action template is invalid");
  }
  const value = required ? rendered.trim() : rendered;
  if (required && !value) throw new Error("A required Gorelo field is empty");
  if (value.length > maximum) {
    throw new Error("A mapped Gorelo field exceeds its size limit");
  }
  return value || undefined;
}

async function fixedClient(
  db: D1Database,
  clientId: number,
): Promise<ResolvedClientAudit | null> {
  const row = await db
    .prepare(
      `SELECT c.id, c.name, c.last_seen_at, s.last_synced_at
         FROM gorelo_clients c
         LEFT JOIN gorelo_client_sync s ON s.id = 1
        WHERE c.id = ?
        LIMIT 1`,
    )
    .bind(clientId)
    .first<FixedClientRow>();
  if (
    !row ||
    row.last_synced_at === null ||
    row.last_seen_at !== row.last_synced_at
  ) {
    return null;
  }
  return { id: row.id, name: row.name, matchedBy: "fixed_client" };
}

async function resolveClient(
  db: D1Database,
  action: GoreloRuleAction,
  variables: Readonly<Record<string, string>>,
): Promise<ResolvedClientAudit | null> {
  if (action.clientId !== undefined) return fixedClient(db, action.clientId);
  const field = action.clientIdentityField;
  if (!field) return null;
  const identity = variables[field]?.trim();
  if (!identity) return null;
  const resolution = await resolveClientIdentity(db, identity, {
    scope: action.clientAliasScope ?? "global",
  });
  if (resolution.status !== "resolved") return null;
  return {
    id: resolution.client.id,
    name: resolution.client.name,
    matchedBy: resolution.matchedBy,
  };
}

function ticketRequest(
  action: Extract<GoreloRuleAction, { type: "create_ticket" }>,
  variables: Readonly<Record<string, string>>,
  clientId: number,
): GoreloCreateTicketRequest {
  const title = renderTemplate(action.titleTemplate, variables, 998, true)!;
  const description = action.descriptionTemplate
    ? renderTemplate(action.descriptionTemplate, variables, 16_000, false)
    : undefined;
  const createdByName = action.createdByNameTemplate
    ? renderTemplate(
        action.createdByNameTemplate,
        variables,
        320,
        false,
      )?.trim()
    : undefined;
  return {
    Title: title,
    ClientId: clientId,
    StatusId: action.statusId,
    GroupId: action.groupId,
    TypeId: action.typeId,
    ...(createdByName ? { CreatedByName: createdByName } : {}),
    ...(description === undefined ? {} : { Description: description }),
    ...(action.priorityId === undefined
      ? {}
      : { PriorityId: action.priorityId as 0 | 1 | 2 | 3 | 4 }),
    ...(action.sourceId === undefined
      ? {}
      : { SourceId: action.sourceId as 1 | 2 | 3 | 4 | 5 | 6 }),
    ...(action.locationId === undefined
      ? {}
      : { LocationId: action.locationId }),
    ...(action.contactId === undefined ? {} : { ContactId: action.contactId }),
    ...(action.ccContactIds === undefined
      ? {}
      : { CcContactIds: [...action.ccContactIds] }),
    ...(action.leadAssigneeId === undefined
      ? {}
      : { LeadAssigneeId: action.leadAssigneeId }),
    ...(action.assistingAssigneeIds === undefined
      ? {}
      : { AssistingAssigneeIds: [...action.assistingAssigneeIds] }),
    ...(action.watcherIds === undefined
      ? {}
      : { WatcherIds: [...action.watcherIds] }),
    ...(action.tagIds === undefined ? {} : { TagIds: [...action.tagIds] }),
    ...(action.agentAssetIds === undefined
      ? {}
      : { AgentAssetIds: [...action.agentAssetIds] }),
    SendTicketCreatedEmail: action.sendTicketCreatedEmail,
    IsUnread: action.isUnread,
  };
}

function alertRequest(
  action: Extract<GoreloRuleAction, { type: "create_alert" }>,
  variables: Readonly<Record<string, string>>,
  clientId: number,
): GoreloCreateAlertRequest {
  const description = action.descriptionTemplate
    ? renderTemplate(action.descriptionTemplate, variables, 16_000, false)
    : undefined;
  return {
    Name: renderTemplate(action.nameTemplate, variables, 998, true)!,
    ClientId: clientId,
    Resource: renderTemplate(action.resourceTemplate, variables, 998, true)!,
    Severity: action.severity as 1 | 2 | 3 | 4,
    ...(description === undefined ? {} : { Description: description }),
  };
}

/** Builds a bounded, credential-free Gorelo request and its audit snapshot. */
export async function prepareGoreloAction(
  db: D1Database,
  facts: EmailFacts,
  action: GoreloRuleAction,
): Promise<PreparedGoreloAction> {
  let variables: Record<string, string>;
  try {
    variables = extractWebhookVariables(facts, action.fields);
  } catch {
    return {
      actionType: action.type,
      data: { variables: {} },
      preflightError: "extraction_failed",
    };
  }

  let client: ResolvedClientAudit | null;
  try {
    client = await resolveClient(db, action, variables);
  } catch {
    client = null;
  }
  if (!client) {
    return {
      actionType: action.type,
      data: { variables },
      preflightError: "client_resolution_failed",
    };
  }

  try {
    const request =
      action.type === "create_ticket"
        ? ticketRequest(action, variables, client.id)
        : alertRequest(action, variables, client.id);
    const data = { variables, goreloClient: client };
    canonicalizeDeliveryPayload({
      schemaVersion: 1,
      region: "aue",
      request,
      data,
    });
    return {
      actionType: action.type,
      data,
      request,
    };
  } catch {
    return {
      actionType: action.type,
      data: { variables, goreloClient: client },
      preflightError: "mapping_failed",
    };
  }
}
