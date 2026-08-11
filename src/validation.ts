import { z } from "zod";
import type { WebhookExtractionField } from "./extraction";

export const conditionFields = [
  "from",
  "from_domain",
  "to",
  "to_local_part",
  "subject",
  "body_text",
  "attachment_name",
  "header",
  "spam_score",
  "message_size",
  "has_attachments",
] as const;

export const conditionOperators = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "wildcard",
  "in",
  "gte",
  "lte",
  "exists",
] as const;

const conditionSchema = z
  .object({
    field: z.enum(conditionFields),
    operator: z.enum(conditionOperators),
    value: z
      .union([
        z.string().max(512),
        z.number().finite(),
        z.boolean(),
        z.array(z.string().max(320)).min(1).max(100),
      ])
      .optional(),
    headerName: z.string().trim().min(1).max(100).optional(),
    caseSensitive: z.boolean().default(false),
  })
  .strict()
  .superRefine((condition, context) => {
    if (condition.field === "header" && !condition.headerName) {
      context.addIssue({
        code: "custom",
        path: ["headerName"],
        message: "headerName is required when field is header",
      });
    }
    if (condition.field !== "header" && condition.headerName !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["headerName"],
        message: "headerName is only valid when field is header",
      });
    }

    if (condition.operator === "exists") {
      if (
        !["header", "body_text", "attachment_name", "has_attachments"].includes(
          condition.field,
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["operator"],
          message: `exists is not valid for ${condition.field}`,
        });
      }
      if (condition.value !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["value"],
          message: "exists does not accept a value",
        });
      }
      return;
    }

    if (condition.value === undefined) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "value is required for this operator",
      });
      return;
    }

    const numericField =
      condition.field === "spam_score" || condition.field === "message_size";
    if (numericField) {
      if (
        !["equals", "not_equals", "gte", "lte"].includes(condition.operator)
      ) {
        context.addIssue({
          code: "custom",
          path: ["operator"],
          message: `${condition.field} requires equals, not_equals, gte, or lte`,
        });
      }
      if (typeof condition.value !== "number") {
        context.addIssue({
          code: "custom",
          path: ["value"],
          message: `${condition.field} requires a numeric value`,
        });
      }
      return;
    }

    if (condition.field === "has_attachments") {
      if (
        condition.operator !== "equals" &&
        condition.operator !== "not_equals"
      ) {
        context.addIssue({
          code: "custom",
          path: ["operator"],
          message: "has_attachments requires equals, not_equals, or exists",
        });
      }
      if (typeof condition.value !== "boolean") {
        context.addIssue({
          code: "custom",
          path: ["value"],
          message: "has_attachments requires a boolean value",
        });
      }
      return;
    }

    if (condition.operator === "in") {
      if (!Array.isArray(condition.value)) {
        context.addIssue({
          code: "custom",
          path: ["value"],
          message: "in requires an array of strings",
        });
      }
      return;
    }

    if (condition.operator === "gte" || condition.operator === "lte") {
      context.addIssue({
        code: "custom",
        path: ["operator"],
        message: `${condition.operator} is only valid for numeric fields`,
      });
    }
    if (typeof condition.value !== "string") {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: `${condition.field} requires a string value`,
      });
    }
  });

const forwardActionSchema = z
  .object({
    type: z.literal("forward"),
    destination: z.string().trim().email().optional(),
    mailboxId: z.string().uuid().optional(),
    bypassSpam: z.boolean().default(false),
  })
  .strict()
  .superRefine((action, context) => {
    if (action.destination !== undefined && action.mailboxId !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["mailboxId"],
        message: "Choose a Gorelo mailbox or a legacy destination, not both",
      });
    }
  });

const safeIdentifier = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const safeDestinationId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const safeEventType = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const safeAliasScope = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const safeHeaderName = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const safeGoreloGuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const controlCharacters = /[\u0000-\u001f\u007f]/;
const unsafeMarkerCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const forbiddenFieldKeys = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "authorization",
  "proxy_authorization",
  "api_key",
  "apikey",
  "access_token",
  "refresh_token",
  "token",
  "password",
  "passwd",
  "secret",
  "client_secret",
  "private_key",
  "cookie",
  "set_cookie",
  "credential",
  "credentials",
]);
const forbiddenFieldKeySegments = new Set([
  "authorization",
  "apikey",
  "password",
  "passwd",
  "secret",
  "token",
  "cookie",
  "credential",
  "credentials",
]);
const sensitiveSourceHeaders = new Set([
  "authorization",
  "proxyauthorization",
  "apikey",
  "xapikey",
  "accesstoken",
  "refreshtoken",
  "xauthtoken",
  "cookie",
  "setcookie",
]);

function isForbiddenFieldKey(value: string): boolean {
  const lower = value.toLowerCase();
  if (forbiddenFieldKeys.has(lower)) return true;
  const compact = lower.replace(/[^a-z0-9]/g, "");
  return (
    lower
      .split("_")
      .some((segment) => forbiddenFieldKeySegments.has(segment)) ||
    [
      "authorization",
      "apikey",
      "password",
      "passwd",
      "secret",
      "token",
      "cookie",
      "credential",
      "credentials",
      "privatekey",
    ].some((suffix) => compact.endsWith(suffix))
  );
}

function isSensitiveSourceHeader(value: string): boolean {
  const compact = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    sensitiveSourceHeaders.has(compact) ||
    ["apikey", "authtoken", "accesstoken", "refreshtoken"].some((suffix) =>
      compact.endsWith(suffix),
    )
  );
}

export const extractionFieldKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(safeIdentifier)
  .refine((value) => !isForbiddenFieldKey(value), {
    message: "Reserved object keys are not allowed",
  });

function boundedText(maximum: number, allowEmpty = false) {
  let schema = z.string().max(maximum);
  if (!allowEmpty) schema = schema.min(1);
  return schema.refine((value) => !controlCharacters.test(value), {
    message: "Control characters are not allowed",
  });
}

function boundedMarker() {
  return z
    .string()
    .min(1)
    .max(256)
    .refine((value) => !unsafeMarkerCharacters.test(value), {
      message: "Markers may contain text, tabs, or line breaks only",
    });
}

export const webhookExtractionFieldSchema: z.ZodType<WebhookExtractionField> = z
  .object({
    key: extractionFieldKeySchema,
    source: z.enum([
      "from",
      "from_domain",
      "to",
      "to_local_part",
      "subject",
      "body_text",
      "message_id",
      "header",
      "literal",
    ]),
    headerName: z.string().min(1).max(128).regex(safeHeaderName).optional(),
    value: boundedText(4_000, true).optional(),
    startAfter: boundedMarker().optional(),
    endBefore: boundedMarker().optional(),
    occurrence: z.number().int().min(1).max(1_000).optional(),
    caseSensitive: z.boolean().optional(),
    required: z.boolean().optional(),
    defaultValue: z
      .string()
      .max(4_000)
      .refine((value) => !controlCharacters.test(value), {
        message: "Control characters are not allowed",
      })
      .optional(),
    maxCharacters: z.number().int().min(1).max(4_000).optional(),
  })
  .strict()
  .superRefine((field, context) => {
    if (field.source === "header" && field.headerName === undefined) {
      context.addIssue({
        code: "custom",
        path: ["headerName"],
        message: "headerName is required when source is header",
      });
    }
    if (field.source !== "header" && field.headerName !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["headerName"],
        message: "headerName is only valid when source is header",
      });
    }
    if (
      field.source === "header" &&
      field.headerName !== undefined &&
      isSensitiveSourceHeader(field.headerName)
    ) {
      context.addIssue({
        code: "custom",
        path: ["headerName"],
        message: "Authentication and credential headers cannot be extracted",
      });
    }
    if (field.source === "literal" && field.value === undefined) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "value is required when source is literal",
      });
    }
    if (field.source !== "literal" && field.value !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "value is only valid when source is literal",
      });
    }
    if (field.occurrence !== undefined && field.startAfter === undefined) {
      context.addIssue({
        code: "custom",
        path: ["occurrence"],
        message: "occurrence requires startAfter",
      });
    }
  });

export const extractionInferenceInputSchema = z
  .object({
    key: extractionFieldKeySchema,
    source: z.enum(["from", "to", "subject", "body_text"]),
    sample: z.string().min(1).max(200_000),
    selectionStart: z.number().int().min(0).max(200_000),
    selectionEnd: z.number().int().min(1).max(200_000),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.selectionStart >= input.selectionEnd ||
      input.selectionEnd > input.sample.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["selectionEnd"],
        message: "Selection must identify text within the sample",
      });
    }
    for (const boundary of [input.selectionStart, input.selectionEnd]) {
      if (
        boundary > 0 &&
        boundary < input.sample.length &&
        input.sample[boundary - 1] === "\r" &&
        input.sample[boundary] === "\n"
      ) {
        context.addIssue({
          code: "custom",
          path: ["selectionStart"],
          message: "Selection cannot split a CRLF line ending",
        });
        break;
      }
      if (
        boundary > 0 &&
        boundary < input.sample.length &&
        input.sample.charCodeAt(boundary - 1) >= 0xd800 &&
        input.sample.charCodeAt(boundary - 1) <= 0xdbff &&
        input.sample.charCodeAt(boundary) >= 0xdc00 &&
        input.sample.charCodeAt(boundary) <= 0xdfff
      ) {
        context.addIssue({
          code: "custom",
          path: ["selectionStart"],
          message: "Selection cannot split a Unicode character",
        });
        break;
      }
    }
  });

const positiveGoreloId = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
const uniquePositiveGoreloIds = z
  .array(positiveGoreloId)
  .max(100)
  .refine((values) => new Set(values).size === values.length, {
    message: "Gorelo IDs must be unique",
  });
const uniqueGoreloGuidList = z
  .array(z.string().regex(safeGoreloGuid))
  .max(100)
  .refine(
    (values) =>
      new Set(values.map((value) => value.toLowerCase())).size ===
      values.length,
    { message: "Gorelo asset IDs must be unique" },
  );

const contactResolverSchema = z
  .object({
    field: z.string().min(1).max(64).regex(safeIdentifier),
    matchBy: z.enum(["email", "alias", "name", "id"]),
  })
  .strict();

const leadAssigneeResolverSchema = z
  .object({
    field: z.string().min(1).max(64).regex(safeIdentifier),
    matchBy: z.enum(["email", "name", "id"]),
  })
  .strict();

const agentAssetResolverSchema = z
  .object({
    field: z.string().min(1).max(64).regex(safeIdentifier),
    matchBy: z.enum(["id", "serial_number", "name"]),
  })
  .strict();

function boundedTemplate(maximum: number, allowEmpty = false) {
  let schema = z.string().max(maximum);
  if (!allowEmpty) schema = schema.min(1);
  return schema.refine((value) => !unsafeMarkerCharacters.test(value), {
    message: "Templates may contain text, tabs, or line breaks only",
  });
}

const TEMPLATE_REFERENCE = /{{\s*([A-Za-z_][A-Za-z0-9_]{0,63})\s*}}/g;

function templateKeys(template: string): string[] | null {
  const keys: string[] = [];
  const remainder = template.replace(
    TEMPLATE_REFERENCE,
    (_match, key: string) => {
      keys.push(key);
      return "";
    },
  );
  return remainder.includes("{{") || remainder.includes("}}") ? null : keys;
}

function validateMappedExtractionAction(
  action: {
    fields: readonly WebhookExtractionField[];
    clientId?: number | undefined;
    clientIdentityField?: string | undefined;
    clientAliasScope?: string | undefined;
  },
  templates: readonly { path: string; value: string | undefined }[],
  context: z.RefinementCtx,
): void {
  const keys = new Set<string>();
  action.fields.forEach((field, index) => {
    if (keys.has(field.key)) {
      context.addIssue({
        code: "custom",
        path: ["fields", index, "key"],
        message: "Extraction field keys must be unique",
      });
    }
    keys.add(field.key);
  });

  if (
    (action.clientId === undefined) ===
    (action.clientIdentityField === undefined)
  ) {
    context.addIssue({
      code: "custom",
      path: ["clientIdentityField"],
      message: "Choose exactly one fixed client or extracted client identity",
    });
  }
  if (
    action.clientIdentityField !== undefined &&
    !keys.has(action.clientIdentityField)
  ) {
    context.addIssue({
      code: "custom",
      path: ["clientIdentityField"],
      message: "clientIdentityField must reference an extraction field key",
    });
  }
  if (
    action.clientIdentityField === undefined &&
    action.clientAliasScope !== undefined
  ) {
    context.addIssue({
      code: "custom",
      path: ["clientAliasScope"],
      message: "clientAliasScope requires clientIdentityField",
    });
  }

  for (const template of templates) {
    if (template.value === undefined) continue;
    const references = templateKeys(template.value);
    if (references === null) {
      context.addIssue({
        code: "custom",
        path: [template.path],
        message: "Template placeholders must use {{field_name}} syntax",
      });
      continue;
    }
    for (const reference of references) {
      if (!keys.has(reference)) {
        context.addIssue({
          code: "custom",
          path: [template.path],
          message: `Template references unknown extraction field ${reference}`,
        });
      }
    }
  }
}

const goreloActionFields = {
  bypassSpam: z.boolean().default(false),
  fields: z.array(webhookExtractionFieldSchema).min(1).max(50),
  clientId: positiveGoreloId.optional(),
  clientIdentityField: z
    .string()
    .min(1)
    .max(64)
    .regex(safeIdentifier)
    .optional(),
  clientAliasScope: z.string().min(1).max(128).regex(safeAliasScope).optional(),
};

const createTicketActionSchema = z
  .object({
    type: z.literal("create_ticket"),
    ...goreloActionFields,
    titleTemplate: boundedTemplate(998),
    descriptionTemplate: boundedTemplate(16_000, true).optional(),
    createdByNameTemplate: boundedTemplate(320, true).optional(),
    statusId: positiveGoreloId,
    groupId: positiveGoreloId,
    typeId: positiveGoreloId,
    priorityId: z.number().int().min(0).max(4).optional(),
    sourceId: z.number().int().min(1).max(6).optional(),
    locationId: positiveGoreloId.optional(),
    contactId: positiveGoreloId.optional(),
    contactResolver: contactResolverSchema.optional(),
    ccContactIds: uniquePositiveGoreloIds.optional(),
    leadAssigneeId: positiveGoreloId.optional(),
    leadAssigneeResolver: leadAssigneeResolverSchema.optional(),
    assistingAssigneeIds: uniquePositiveGoreloIds.optional(),
    watcherIds: uniquePositiveGoreloIds.optional(),
    tagIds: uniquePositiveGoreloIds.optional(),
    agentAssetIds: uniqueGoreloGuidList.optional(),
    agentAssetResolver: agentAssetResolverSchema.optional(),
    sendTicketCreatedEmail: z.boolean().default(false),
    isUnread: z.boolean().default(true),
  })
  .strict()
  .superRefine((action, context) => {
    validateMappedExtractionAction(
      action,
      [
        { path: "titleTemplate", value: action.titleTemplate },
        { path: "descriptionTemplate", value: action.descriptionTemplate },
        { path: "createdByNameTemplate", value: action.createdByNameTemplate },
      ],
      context,
    );
    const keys = new Set(action.fields.map((field) => field.key));
    for (const [path, resolver] of [
      ["contactResolver", action.contactResolver],
      ["leadAssigneeResolver", action.leadAssigneeResolver],
      ["agentAssetResolver", action.agentAssetResolver],
    ] as const) {
      if (resolver && !keys.has(resolver.field)) {
        context.addIssue({
          code: "custom",
          path: [path, "field"],
          message: `${path}.field must reference an extraction field key`,
        });
      }
    }
    for (const [fixedPath, fixedValue, resolverPath, resolver] of [
      [
        "contactId",
        action.contactId,
        "contactResolver",
        action.contactResolver,
      ],
      [
        "leadAssigneeId",
        action.leadAssigneeId,
        "leadAssigneeResolver",
        action.leadAssigneeResolver,
      ],
      [
        "agentAssetIds",
        action.agentAssetIds,
        "agentAssetResolver",
        action.agentAssetResolver,
      ],
    ] as const) {
      if (fixedValue !== undefined && resolver !== undefined) {
        context.addIssue({
          code: "custom",
          path: [resolverPath],
          message: `${resolverPath} cannot be combined with ${fixedPath}`,
        });
      }
    }
    if (
      action.clientIdentityField !== undefined &&
      (action.locationId !== undefined ||
        action.contactId !== undefined ||
        (action.ccContactIds?.length ?? 0) > 0 ||
        (action.agentAssetIds?.length ?? 0) > 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["clientIdentityField"],
        message:
          "Client-specific contacts, locations, and assets require a fixed client",
      });
    }
  })
  .transform((action) =>
    action.clientIdentityField !== undefined &&
    action.clientAliasScope === undefined
      ? { ...action, clientAliasScope: "global" }
      : action,
  );

const createAlertActionSchema = z
  .object({
    type: z.literal("create_alert"),
    ...goreloActionFields,
    nameTemplate: boundedTemplate(998),
    resourceTemplate: boundedTemplate(998),
    descriptionTemplate: boundedTemplate(16_000, true).optional(),
    severity: z.number().int().min(1).max(4).default(3),
  })
  .strict()
  .superRefine((action, context) => {
    validateMappedExtractionAction(
      action,
      [
        { path: "nameTemplate", value: action.nameTemplate },
        { path: "resourceTemplate", value: action.resourceTemplate },
        { path: "descriptionTemplate", value: action.descriptionTemplate },
      ],
      context,
    );
  })
  .transform((action) =>
    action.clientIdentityField !== undefined &&
    action.clientAliasScope === undefined
      ? { ...action, clientAliasScope: "global" }
      : action,
  );

const forwardWebhookActionSchema = z
  .object({
    type: z.literal("forward_webhook"),
    destination: z.string().trim().email().optional(),
    mailboxId: z.string().uuid().optional(),
    bypassSpam: z.boolean().default(false),
    webhookDestinationId: z.string().min(1).max(64).regex(safeDestinationId),
    eventType: z
      .string()
      .min(1)
      .max(128)
      .regex(safeEventType)
      .default("mail.parsed"),
    fields: z.array(webhookExtractionFieldSchema).min(1).max(50),
    clientIdentityField: z
      .string()
      .min(1)
      .max(64)
      .regex(safeIdentifier)
      .optional(),
    clientAliasScope: z
      .string()
      .min(1)
      .max(128)
      .regex(safeAliasScope)
      .optional(),
  })
  .strict()
  .superRefine((action, context) => {
    if (action.destination !== undefined && action.mailboxId !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["mailboxId"],
        message: "Choose a Gorelo mailbox or a legacy destination, not both",
      });
    }
    const keys = new Set<string>();
    action.fields.forEach((field, index) => {
      if (keys.has(field.key)) {
        context.addIssue({
          code: "custom",
          path: ["fields", index, "key"],
          message: "Webhook extraction field keys must be unique",
        });
      }
      keys.add(field.key);
    });
    if (
      action.clientIdentityField !== undefined &&
      !keys.has(action.clientIdentityField)
    ) {
      context.addIssue({
        code: "custom",
        path: ["clientIdentityField"],
        message: "clientIdentityField must reference an extraction field key",
      });
    }
    if (
      action.clientIdentityField === undefined &&
      action.clientAliasScope !== undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["clientAliasScope"],
        message: "clientAliasScope requires clientIdentityField",
      });
    }
  })
  .transform((action) => {
    if (
      action.clientIdentityField !== undefined &&
      action.clientAliasScope === undefined
    ) {
      return { ...action, clientAliasScope: "global" };
    }
    return action;
  });

const quarantineActionSchema = z
  .object({
    type: z.literal("quarantine"),
    destination: z.string().trim().email().optional(),
  })
  .strict();

const dropActionSchema = z.object({ type: z.literal("drop") }).strict();

const rejectActionSchema = z
  .object({
    type: z.literal("reject"),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .default("Message rejected by policy"),
  })
  .strict();

export const ruleInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).default(""),
    priority: z.number().int().min(0).max(100_000).default(100),
    enabled: z.boolean().default(true),
    match: z.enum(["all", "any"]).default("all"),
    conditions: z.array(conditionSchema).min(1).max(20),
    action: z.union([
      forwardActionSchema,
      forwardWebhookActionSchema,
      createTicketActionSchema,
      createAlertActionSchema,
      quarantineActionSchema,
      dropActionSchema,
      rejectActionSchema,
    ]),
  })
  .strict();

export const dryRunEmailSchema = z
  .object({
    from: z.string().trim().email(),
    to: z.string().trim().email(),
    subject: z.string().max(998).default(""),
    bodyText: z.string().max(1_000_000).default(""),
    headers: z.record(z.string(), z.string()).default({}),
    attachmentNames: z.array(z.string().max(255)).max(100).default([]),
    rawSize: z
      .number()
      .int()
      .min(0)
      .max(25 * 1024 * 1024)
      .default(0),
  })
  .strict();

export type RuleInput = z.infer<typeof ruleInputSchema>;
export type RuleInputData = z.input<typeof ruleInputSchema>;
export type RuleCondition = RuleInput["conditions"][number];
export type RuleAction = RuleInput["action"];
export type DryRunEmailInput = z.infer<typeof dryRunEmailSchema>;
export type ExtractionInferenceInput = z.infer<
  typeof extractionInferenceInputSchema
>;
