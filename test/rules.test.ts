import { describe, expect, it } from "vitest";
import {
  conditionMatches,
  decide,
  decideWithoutMime,
  ruleMatches,
  rulesNeedMime,
  validateRuleAction,
} from "../src/rules";
import type { RuleCondition } from "../src/validation";
import { config, email, rule } from "./helpers";

function condition(
  input: Omit<RuleCondition, "caseSensitive"> & { caseSensitive?: boolean },
) {
  return { caseSensitive: false, ...input } as RuleCondition;
}

function configWithoutQuarantineAddress(
  quarantineMode: "internal" | "mailbox",
) {
  const result = config({ quarantineMode });
  delete result.quarantineAddress;
  return result;
}

describe("rule condition matching", () => {
  it("matches sender domains without case sensitivity", () => {
    expect(
      conditionMatches(
        email({ fromDomain: "Vendor.Example" }),
        condition({
          field: "from_domain",
          operator: "equals",
          value: "vendor.example",
        }),
      ),
    ).toBe(true);
  });

  it("uses safe wildcard matching", () => {
    const wildcard = condition({
      field: "subject",
      operator: "wildcard",
      value: "Alert: *.example.com (?)",
    });
    expect(
      conditionMatches(
        email({ subject: "Alert: host.example.com (1)" }),
        wildcard,
      ),
    ).toBe(true);
    expect(
      conditionMatches(
        email({ subject: "Alert: hostXexample.com (1)" }),
        wildcard,
      ),
    ).toBe(false);

    expect(
      conditionMatches(
        email({ subject: "Alert: 🚨" }),
        condition({
          field: "subject",
          operator: "wildcard",
          value: "Alert: ?",
        }),
      ),
    ).toBe(true);
  });

  it("does not resolve absent inherited header names", () => {
    expect(
      conditionMatches(
        email({ headers: {} }),
        condition({
          field: "header",
          headerName: "constructor",
          operator: "exists",
        }),
      ),
    ).toBe(false);
  });

  it("matches wildcards across line breaks without regex backtracking", () => {
    const bodyWildcard = condition({
      field: "body_text",
      operator: "wildcard",
      value: "*failure*",
    });
    expect(
      conditionMatches(
        email({ bodyText: "first line\nfailure detected\nlast line" }),
        bodyWildcard,
      ),
    ).toBe(true);

    const adversarial = condition({
      field: "body_text",
      operator: "wildcard",
      value: `${"*a".repeat(40)}b`,
    });
    expect(
      conditionMatches(email({ bodyText: "a".repeat(100_000) }), adversarial),
    ).toBe(false);

    const longNearMatch = condition({
      field: "body_text",
      operator: "wildcard",
      value: `*${"a".repeat(510)}b`,
    });
    expect(
      conditionMatches(email({ bodyText: "a".repeat(200_000) }), longNearMatch),
    ).toBe(false);
  });

  it("requires every attachment to satisfy a negative condition", () => {
    const evaluated = email({
      attachments: [
        { filename: "report.pdf", mimeType: "application/pdf", size: 100 },
        {
          filename: "payload.exe",
          mimeType: "application/octet-stream",
          size: 100,
        },
      ],
      hasAttachments: true,
    });
    expect(
      conditionMatches(
        evaluated,
        condition({
          field: "attachment_name",
          operator: "not_contains",
          value: ".exe",
        }),
      ),
    ).toBe(false);
  });

  it("matches numeric spam thresholds", () => {
    expect(
      conditionMatches(
        email({ spam: { score: 7, reasons: [], isSpam: true } }),
        condition({ field: "spam_score", operator: "gte", value: 5 }),
      ),
    ).toBe(true);
  });

  it("treats has_attachments exists as attachment presence", () => {
    const exists = condition({ field: "has_attachments", operator: "exists" });
    expect(conditionMatches(email({ hasAttachments: false }), exists)).toBe(
      false,
    );
    expect(conditionMatches(email({ hasAttachments: true }), exists)).toBe(
      true,
    );
  });

  it("never treats unknown MIME content as an empty negative match", () => {
    const unparsed = email({
      bodyText: "",
      attachments: [],
      hasAttachments: false,
      mimeParsed: false,
    });
    expect(
      conditionMatches(
        unparsed,
        condition({
          field: "attachment_name",
          operator: "not_contains",
          value: ".exe",
        }),
      ),
    ).toBe(false);
    expect(
      conditionMatches(
        unparsed,
        condition({
          field: "has_attachments",
          operator: "equals",
          value: false,
        }),
      ),
    ).toBe(false);
  });
});

describe("rule evaluation", () => {
  it("supports all and any matching", () => {
    const allRule = rule({
      name: "Vendor alert",
      description: "",
      priority: 10,
      enabled: true,
      match: "all",
      conditions: [
        condition({
          field: "from_domain",
          operator: "equals",
          value: "example.com",
        }),
        condition({ field: "subject", operator: "contains", value: "offline" }),
      ],
      action: { type: "forward" },
    });
    expect(ruleMatches(email(), allRule)).toBe(true);
    expect(ruleMatches(email({ subject: "Everything is fine" }), allRule)).toBe(
      false,
    );
  });

  it("selects the lowest-priority-number matching rule", () => {
    const lowPriority = rule(
      {
        name: "Catch-all drop",
        description: "",
        priority: 500,
        enabled: true,
        match: "all",
        conditions: [
          condition({ field: "to", operator: "contains", value: "@" }),
        ],
        action: { type: "drop" },
      },
      "drop-rule",
    );
    const highPriority = rule(
      {
        name: "Trusted sender",
        description: "",
        priority: 10,
        enabled: true,
        match: "all",
        conditions: [
          condition({
            field: "from_domain",
            operator: "equals",
            value: "example.com",
          }),
        ],
        action: { type: "forward" },
      },
      "trusted-rule",
    );

    expect(
      decide(email(), [lowPriority, highPriority], config()),
    ).toMatchObject({
      type: "forward",
      matchedRuleId: "trusted-rule",
      destination: "tickets@gorelo.example",
    });
  });

  it("quarantines spam when no explicit rule matches", () => {
    expect(
      decide(
        email({ spam: { score: 6, reasons: ["test"], isSpam: true } }),
        [],
        config(),
      ),
    ).toMatchObject({
      type: "quarantine",
      destination: "quarantine@example.com",
    });
  });

  it("keeps an internal quarantine rule inside the review queue", () => {
    const quarantineRule = rule(
      {
        name: "Review matching mail",
        conditions: [
          condition({ field: "to", operator: "contains", value: "@" }),
        ],
        action: { type: "quarantine" },
      },
      "internal-quarantine-rule",
    );

    const decision = decide(
      email(),
      [quarantineRule],
      configWithoutQuarantineAddress("internal"),
    );

    expect(decision).toMatchObject({
      type: "quarantine",
      matchedRuleId: "internal-quarantine-rule",
    });
    expect(decision).not.toHaveProperty("destination");
  });

  it("fails closed when a mailbox quarantine rule has no destination", () => {
    const quarantineRule = rule({
      name: "Mailbox quarantine",
      conditions: [
        condition({ field: "to", operator: "contains", value: "@" }),
      ],
      action: { type: "quarantine" },
    });

    expect(() =>
      decide(
        email(),
        [quarantineRule],
        configWithoutQuarantineAddress("mailbox"),
      ),
    ).toThrow("no quarantine address is configured");
  });

  it("does not let an ordinary route bypass the spam action", () => {
    const route = rule(
      {
        name: "Vendor route",
        priority: 100,
        conditions: [
          condition({
            field: "from_domain",
            operator: "equals",
            value: "example.com",
          }),
        ],
        action: { type: "forward" },
      },
      "route-rule",
    );
    const spam = email({
      spam: { score: 6, reasons: ["test"], isSpam: true },
    });
    expect(decide(spam, [route], config())).toMatchObject({
      type: "quarantine",
      destination: "quarantine@example.com",
    });
    expect(
      decide(
        spam,
        [
          {
            ...route,
            action: { type: "forward", bypassSpam: true },
          },
        ],
        config(),
      ),
    ).toMatchObject({ type: "forward", matchedRuleId: "route-rule" });
  });

  it("applies the forward spam policy to webhook rules", () => {
    const route = rule(
      {
        name: "Vendor webhook",
        conditions: [
          condition({
            field: "from_domain",
            operator: "equals",
            value: "example.com",
          }),
        ],
        action: {
          type: "forward_webhook",
          webhookDestinationId: "destination-1",
          fields: [{ key: "summary", source: "subject" }],
        },
      },
      "webhook-rule",
    );
    const spam = email({
      spam: { score: 6, reasons: ["test"], isSpam: true },
    });
    if (route.action.type !== "forward_webhook") {
      throw new Error("Expected a forward_webhook fixture");
    }

    expect(decide(spam, [route], config())).toMatchObject({
      type: "quarantine",
      destination: "quarantine@example.com",
    });
    expect(
      decide(
        spam,
        [{ ...route, action: { ...route.action, bypassSpam: true } }],
        config(),
      ),
    ).toMatchObject({
      type: "forward",
      matchedRuleId: "webhook-rule",
      webhook: { destinationId: "destination-1" },
    });
  });

  it("keeps forwarding as the primary decision and describes the webhook", () => {
    const webhookRule = rule(
      {
        name: "Extract alert",
        conditions: [
          condition({
            field: "subject",
            operator: "contains",
            value: "offline",
          }),
        ],
        action: {
          type: "forward_webhook",
          destination: "tickets@gorelo.example",
          webhookDestinationId: "destination-1",
          eventType: "monitor.alert",
          fields: [
            { key: "summary", source: "subject", maxCharacters: 200 },
            {
              key: "asset",
              source: "body_text",
              startAfter: "Asset: ",
              endBefore: ";",
            },
          ],
          clientIdentityField: "asset",
          clientAliasScope: "monitoring-vendor",
        },
      },
      "webhook-rule",
    );

    expect(decide(email(), [webhookRule], config())).toMatchObject({
      type: "forward",
      destination: "tickets@gorelo.example",
      matchedRuleId: "webhook-rule",
      reason: "forward and webhook rule matched",
      webhook: {
        destinationId: "destination-1",
        eventType: "monitor.alert",
        fields: [
          { key: "summary", source: "subject", maxCharacters: 200 },
          { key: "asset", source: "body_text" },
        ],
        clientIdentityField: "asset",
        clientAliasScope: "monitoring-vendor",
      },
    });
  });

  it("keeps legacy literal destinations on the exact-address allow-list", () => {
    const exfiltrationRule = rule({
      name: "Bad destination",
      description: "",
      priority: 1,
      enabled: true,
      match: "all",
      conditions: [
        condition({ field: "to", operator: "contains", value: "@" }),
      ],
      action: { type: "forward", destination: "attacker@example.net" },
    });
    expect(() =>
      decide(
        email(),
        [exfiltrationRule],
        config({
          allowedForwardDomains: new Set(["gorelo.example", "example.net"]),
        }),
      ),
    ).toThrow("Rule destination is not allowed");
  });

  it("only requests MIME parsing for enabled content rules", () => {
    const contentRule = rule({
      name: "Body match",
      description: "",
      priority: 1,
      enabled: true,
      match: "all",
      conditions: [
        condition({
          field: "body_text",
          operator: "contains",
          value: "failure",
        }),
      ],
      action: { type: "forward" },
    });
    expect(rulesNeedMime([contentRule])).toBe(true);
    expect(rulesNeedMime([{ ...contentRule, enabled: false }])).toBe(false);
  });

  it("requests MIME parsing when a webhook extracts body text", () => {
    const webhookRule = rule({
      name: "Extract body field",
      conditions: [
        condition({
          field: "from_domain",
          operator: "equals",
          value: "example.com",
        }),
      ],
      action: {
        type: "forward_webhook",
        webhookDestinationId: "destination-1",
        fields: [{ key: "description", source: "body_text" }],
      },
    });

    expect(rulesNeedMime([webhookRule])).toBe(true);
    expect(rulesNeedMime([{ ...webhookRule, enabled: false }])).toBe(false);
    expect(
      decideWithoutMime(
        email({ mimeParsed: false, bodyText: "" }),
        [webhookRule],
        config(),
      ),
    ).toBeUndefined();
  });

  it("creates an API-only Gorelo action decision and applies spam policy", () => {
    const ticketRule = rule(
      {
        name: "Create ticket",
        conditions: [
          condition({
            field: "from_domain",
            operator: "equals",
            value: "example.com",
          }),
        ],
        action: {
          type: "create_ticket",
          fields: [
            { key: "summary", source: "subject" },
            { key: "customer", source: "literal", value: "Acme" },
            { key: "details", source: "body_text" },
          ],
          clientIdentityField: "customer",
          titleTemplate: "{{summary}}",
          descriptionTemplate: "{{details}}",
          statusId: 1,
          groupId: 2,
          typeId: 3,
        },
      },
      "ticket-rule",
    );

    expect(decide(email(), [ticketRule], config())).toMatchObject({
      type: "forward",
      matchedRuleId: "ticket-rule",
      reason: "create Gorelo ticket rule matched",
      gorelo: { action: { type: "create_ticket" } },
    });
    expect(rulesNeedMime([ticketRule])).toBe(true);
    expect(() => validateRuleAction(ticketRule.action, config())).toThrow(
      "Gorelo API delivery is not configured",
    );
    expect(() =>
      validateRuleAction(
        ticketRule.action,
        config({ goreloApiConfigured: true }),
      ),
    ).not.toThrow();

    expect(
      decide(
        email({ spam: { score: 7, reasons: ["test"], isSpam: true } }),
        [ticketRule],
        config({ goreloApiConfigured: true }),
      ),
    ).toMatchObject({ type: "quarantine" });
  });

  it("requires signed webhook capability and an allowed forward destination", () => {
    const action = ruleInputForWebhook();
    if (action.type !== "forward_webhook") {
      throw new Error("Expected a forward_webhook fixture");
    }

    expect(() => validateRuleAction(action, config())).toThrow(
      "Signed webhook delivery is not configured",
    );
    expect(() =>
      validateRuleAction(
        action,
        config({
          webhookSigningConfigured: true,
          allowedWebhookHosts: new Set(["hooks.example.com"]),
        }),
      ),
    ).not.toThrow();
    expect(() =>
      validateRuleAction(
        { ...action, destination: "attacker@example.net" },
        config({
          webhookSigningConfigured: true,
          allowedWebhookHosts: new Set(["hooks.example.com"]),
        }),
      ),
    ).toThrow("Rule destination is not allowed");
  });

  it("lets a higher-priority metadata rule decide before MIME parsing", () => {
    const sizeRule = rule(
      {
        name: "Reject large message",
        description: "",
        priority: 10,
        enabled: true,
        match: "all",
        conditions: [
          condition({ field: "message_size", operator: "gte", value: 1000 }),
        ],
        action: { type: "reject", reason: "Too large" },
      },
      "size-rule",
    );
    const contentRule = rule(
      {
        name: "Quarantine executable",
        description: "",
        priority: 20,
        enabled: true,
        match: "all",
        conditions: [
          condition({
            field: "attachment_name",
            operator: "ends_with",
            value: ".exe",
          }),
        ],
        action: { type: "quarantine" },
      },
      "content-rule",
    );
    expect(
      decideWithoutMime(
        email({ rawSize: 5000, mimeParsed: false }),
        [contentRule, sizeRule],
        config(),
      ),
    ).toMatchObject({ type: "reject", matchedRuleId: "size-rule" });
  });

  it("defers rather than bypassing a higher-priority content rule", () => {
    const contentRule = rule({
      name: "Body security rule",
      description: "",
      priority: 10,
      enabled: true,
      match: "all",
      conditions: [
        condition({
          field: "body_text",
          operator: "contains",
          value: "malware",
        }),
      ],
      action: { type: "quarantine" },
    });
    const routeRule = rule({
      name: "Vendor route",
      description: "",
      priority: 100,
      enabled: true,
      match: "all",
      conditions: [
        condition({
          field: "from_domain",
          operator: "equals",
          value: "example.com",
        }),
      ],
      action: { type: "forward" },
    });
    expect(
      decideWithoutMime(
        email({ mimeParsed: false }),
        [routeRule, contentRule],
        config(),
      ),
    ).toBeUndefined();
  });
});

function ruleInputForWebhook() {
  return rule({
    name: "Webhook route",
    conditions: [condition({ field: "to", operator: "contains", value: "@" })],
    action: {
      type: "forward_webhook",
      webhookDestinationId: "destination-1",
      fields: [{ key: "summary", source: "subject" }],
    },
  }).action;
}
