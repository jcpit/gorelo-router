import { describe, expect, it } from "vitest";
import { dryRunEmailSchema, ruleInputSchema } from "../src/validation";

describe("rule validation", () => {
  it("applies safe defaults", () => {
    const result = ruleInputSchema.parse({
      name: "Block sender",
      conditions: [
        { field: "from", operator: "equals", value: "spam@example.com" },
      ],
      action: { type: "drop" },
    });
    expect(result).toMatchObject({
      priority: 100,
      enabled: true,
      match: "all",
      description: "",
    });
    expect(result.conditions[0]?.caseSensitive).toBe(false);
  });

  it("requires a header name for header conditions", () => {
    const result = ruleInputSchema.safeParse({
      name: "Header match",
      conditions: [{ field: "header", operator: "contains", value: "yes" }],
      action: { type: "drop" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects values on exists conditions", () => {
    const result = ruleInputSchema.safeParse({
      name: "Attachment presence",
      conditions: [
        { field: "has_attachments", operator: "exists", value: true },
      ],
      action: { type: "drop" },
    });
    expect(result.success).toBe(false);
  });

  it("restricts exists to content-presence fields", () => {
    const result = ruleInputSchema.safeParse({
      name: "Invalid catch-all",
      conditions: [{ field: "message_size", operator: "exists" }],
      action: { type: "drop" },
    });
    expect(result.success).toBe(false);
  });

  it("does not bypass spam on forward actions by default", () => {
    const result = ruleInputSchema.parse({
      name: "Vendor route",
      conditions: [
        { field: "from_domain", operator: "equals", value: "vendor.example" },
      ],
      action: { type: "forward" },
    });
    expect(result.action).toMatchObject({ type: "forward", bypassSpam: false });
  });

  it("parses a bounded forward and webhook action with safe defaults", () => {
    const result = ruleInputSchema.parse({
      name: "Parse vendor alert",
      conditions: [
        { field: "from_domain", operator: "equals", value: "vendor.example" },
      ],
      action: {
        type: "forward_webhook",
        webhookDestinationId: "7c6134b8-94f2-42fb-aadd-86b8da91caf4",
        fields: [
          { key: "summary", source: "subject", maxCharacters: 200 },
          {
            key: "serial_number",
            source: "body_text",
            startAfter: "Serial: ",
            endBefore: ";",
            required: true,
          },
          {
            key: "vendor",
            source: "literal",
            value: "Example Monitoring",
          },
        ],
        clientIdentityField: "vendor",
      },
    });

    expect(result.action).toMatchObject({
      type: "forward_webhook",
      bypassSpam: false,
      eventType: "mail.parsed",
      webhookDestinationId: "7c6134b8-94f2-42fb-aadd-86b8da91caf4",
      clientIdentityField: "vendor",
      clientAliasScope: "global",
    });
  });

  it("requires client alias linkage to reference an extraction field exactly", () => {
    const parseLinkage = (linkage: Record<string, unknown>) =>
      ruleInputSchema.safeParse({
        name: "Client-linked alert",
        conditions: [{ field: "to", operator: "contains", value: "@" }],
        action: {
          type: "forward_webhook",
          webhookDestinationId: "destination-1",
          fields: [{ key: "client_name", source: "subject" }],
          ...linkage,
        },
      });

    expect(parseLinkage({ clientIdentityField: "missing_field" }).success).toBe(
      false,
    );
    expect(parseLinkage({ clientAliasScope: "vendor-a" }).success).toBe(false);
    expect(
      parseLinkage({
        clientIdentityField: "client_name",
        clientAliasScope: "unsafe scope",
      }).success,
    ).toBe(false);
    expect(
      parseLinkage({
        clientIdentityField: "client_name",
        clientAliasScope: "vendor-a",
      }).success,
    ).toBe(true);
  });

  it("enforces source-specific webhook extraction fields", () => {
    const base = {
      name: "Invalid extraction",
      conditions: [{ field: "to", operator: "contains", value: "@" }],
    } as const;

    expect(
      ruleInputSchema.safeParse({
        ...base,
        action: {
          type: "forward_webhook",
          webhookDestinationId: "destination-1",
          fields: [{ key: "header_value", source: "header" }],
        },
      }).success,
    ).toBe(false);
    expect(
      ruleInputSchema.safeParse({
        ...base,
        action: {
          type: "forward_webhook",
          webhookDestinationId: "destination-1",
          fields: [
            { key: "subject", source: "subject", headerName: "X-Vendor" },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      ruleInputSchema.safeParse({
        ...base,
        action: {
          type: "forward_webhook",
          webhookDestinationId: "destination-1",
          fields: [{ key: "vendor", source: "literal" }],
        },
      }).success,
    ).toBe(false);
    expect(
      ruleInputSchema.safeParse({
        ...base,
        action: {
          type: "forward_webhook",
          webhookDestinationId: "destination-1",
          fields: [{ key: "subject", source: "subject", value: "fixed" }],
        },
      }).success,
    ).toBe(false);
  });

  it("requires a bounded occurrence to accompany a start marker", () => {
    const parseField = (field: Record<string, unknown>) =>
      ruleInputSchema.safeParse({
        name: "Repeated block extraction",
        conditions: [{ field: "to", operator: "contains", value: "@" }],
        action: {
          type: "forward_webhook",
          webhookDestinationId: "destination-1",
          fields: [field],
        },
      });

    expect(
      parseField({ key: "customer", source: "body_text", occurrence: 2 })
        .success,
    ).toBe(false);
    expect(
      parseField({
        key: "customer",
        source: "body_text",
        startAfter: "Customer: ",
        occurrence: 2,
      }).success,
    ).toBe(true);
    expect(
      parseField({
        key: "customer",
        source: "body_text",
        startAfter: "Customer: ",
        occurrence: 1_001,
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate, unsafe, and unbounded webhook field configuration", () => {
    const parseFields = (fields: unknown[], overrides = {}) =>
      ruleInputSchema.safeParse({
        name: "Invalid extraction",
        conditions: [{ field: "to", operator: "contains", value: "@" }],
        action: {
          type: "forward_webhook",
          webhookDestinationId: "destination-1",
          fields,
          ...overrides,
        },
      });

    expect(
      parseFields([
        { key: "summary", source: "subject" },
        { key: "summary", source: "body_text" },
      ]).success,
    ).toBe(false);
    expect(
      parseFields([{ key: "unsafe key", source: "subject" }]).success,
    ).toBe(false);
    expect(parseFields([{ key: "api_key", source: "subject" }]).success).toBe(
      false,
    );
    expect(
      parseFields([
        { key: "body", source: "body_text", startAfter: "marker\u0000" },
      ]).success,
    ).toBe(false);
    expect(
      parseFields([{ key: "body", source: "body_text", maxCharacters: 4_001 }])
        .success,
    ).toBe(false);
    expect(
      parseFields([{ key: "summary", source: "subject" }], {
        eventType: "mail parsed\r\nInjected: yes",
      }).success,
    ).toBe(false);
  });

  it("rejects credential-shaped output keys and sensitive header extraction", () => {
    const parseFields = (fields: unknown[]) =>
      ruleInputSchema.safeParse({
        name: "Unsafe extraction",
        conditions: [{ field: "to", operator: "contains", value: "@" }],
        action: {
          type: "forward_webhook",
          webhookDestinationId: "destination-1",
          fields,
        },
      });

    for (const key of ["smtp_password", "auth_token"]) {
      expect(parseFields([{ key, source: "subject" }]).success).toBe(false);
    }
    for (const headerName of ["Authorization", "X-API-Key"]) {
      expect(
        parseFields([{ key: "header_value", source: "header", headerName }])
          .success,
      ).toBe(false);
    }
  });

  it("parses a client-linked Gorelo ticket mapping", () => {
    const result = ruleInputSchema.parse({
      name: "Create monitoring ticket",
      conditions: [
        { field: "to_local_part", operator: "equals", value: "alerts" },
      ],
      action: {
        type: "create_ticket",
        fields: [
          { key: "summary", source: "subject", required: true },
          {
            key: "client",
            source: "body_text",
            startAfter: "Client: ",
            endBefore: "\n",
          },
          { key: "details", source: "body_text", maxCharacters: 4_000 },
        ],
        clientIdentityField: "client",
        clientAliasScope: "monitoring-vendor",
        titleTemplate: "Monitor: {{summary}}",
        descriptionTemplate: "{{details}}",
        statusId: 10,
        groupId: 20,
        typeId: 30,
        priorityId: 2,
        sourceId: 6,
      },
    });

    expect(result.action).toMatchObject({
      type: "create_ticket",
      clientIdentityField: "client",
      clientAliasScope: "monitoring-vendor",
      sendTicketCreatedEmail: false,
      isUnread: true,
    });
  });

  it("supports a fixed imported client for Gorelo alerts", () => {
    const result = ruleInputSchema.parse({
      name: "Create alert",
      conditions: [
        { field: "from_domain", operator: "equals", value: "monitor.example" },
      ],
      action: {
        type: "create_alert",
        fields: [
          { key: "summary", source: "subject" },
          { key: "resource", source: "literal", value: "mail-gateway" },
        ],
        clientId: 42,
        nameTemplate: "{{summary}}",
        resourceTemplate: "{{resource}}",
      },
    });

    expect(result.action).toMatchObject({
      type: "create_alert",
      clientId: 42,
      severity: 3,
      bypassSpam: false,
    });
  });

  it("requires exactly one client mode and valid template references", () => {
    const parse = (action: Record<string, unknown>) =>
      ruleInputSchema.safeParse({
        name: "Invalid Gorelo action",
        conditions: [{ field: "to", operator: "contains", value: "@" }],
        action: {
          type: "create_alert",
          fields: [{ key: "summary", source: "subject" }],
          nameTemplate: "{{summary}}",
          resourceTemplate: "mail",
          ...action,
        },
      });

    expect(parse({}).success).toBe(false);
    expect(
      parse({ clientId: 42, clientIdentityField: "summary" }).success,
    ).toBe(false);
    expect(parse({ clientId: 42, nameTemplate: "{{missing}}" }).success).toBe(
      false,
    );
    expect(parse({ clientId: 42, nameTemplate: "{{ summary" }).success).toBe(
      false,
    );
    expect(parse({ clientId: 42, severity: 5 }).success).toBe(false);
  });

  it("does not permit fixed client assets on a dynamically resolved client", () => {
    expect(
      ruleInputSchema.safeParse({
        name: "Unsafe cross-client association",
        conditions: [{ field: "to", operator: "contains", value: "@" }],
        action: {
          type: "create_ticket",
          fields: [
            { key: "summary", source: "subject" },
            { key: "customer", source: "literal", value: "Acme" },
          ],
          clientIdentityField: "customer",
          titleTemplate: "{{summary}}",
          statusId: 1,
          groupId: 2,
          typeId: 3,
          agentAssetIds: ["ce7cb8a4-29d5-4b60-adba-fab15873446c"],
        },
      }).success,
    ).toBe(false);
  });

  it("requires a number for numeric comparisons", () => {
    const result = ruleInputSchema.safeParse({
      name: "Large message",
      conditions: [{ field: "message_size", operator: "gte", value: "1000" }],
      action: { type: "drop" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects string operators for numeric fields", () => {
    const result = ruleInputSchema.safeParse({
      name: "Invalid size rule",
      conditions: [
        { field: "message_size", operator: "contains", value: 1000 },
      ],
      action: { type: "drop" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects numeric operators for string fields", () => {
    const result = ruleInputSchema.safeParse({
      name: "Invalid subject rule",
      conditions: [{ field: "subject", operator: "gte", value: 5 }],
      action: { type: "drop" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts the maximum configurable dry-run body size", () => {
    const result = dryRunEmailSchema.safeParse({
      from: "sender@example.com",
      to: "support@example.com",
      bodyText: "x".repeat(1_000_000),
    });
    expect(result.success).toBe(true);
  });
});
