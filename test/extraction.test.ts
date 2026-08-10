import { describe, expect, it } from "vitest";
import {
  extractWebhookVariables,
  WebhookExtractionError,
  type WebhookExtractionField,
} from "../src/extraction";
import type { EmailFacts } from "../src/types";
import { email } from "./helpers";

function facts(overrides: Partial<EmailFacts> = {}): EmailFacts {
  return email(overrides);
}

describe("webhook variable extraction", () => {
  it("selects each bounded email source deterministically", () => {
    expect(
      extractWebhookVariables(facts(), [
        { key: "sender", source: "from" },
        { key: "sender_domain", source: "from_domain" },
        { key: "recipient", source: "to" },
        { key: "mailbox", source: "to_local_part" },
        { key: "title", source: "subject" },
        { key: "body", source: "body_text" },
        { key: "message", source: "message_id" },
      ]),
    ).toEqual({
      sender: "sender@example.com",
      sender_domain: "example.com",
      recipient: "support@alerts.example.net",
      mailbox: "support",
      title: "Printer is offline",
      body: "Please investigate the reception printer.",
      message: "<message@example.com>",
    });
  });

  it("looks up headers case-insensitively and supports bounded literals", () => {
    const result = extractWebhookVariables(
      facts({ headers: { "X-Client-Name": "  Acme Pty Ltd  " } }),
      [
        {
          key: "client",
          source: "header",
          headerName: "x-client-name",
          required: true,
        },
        { key: "origin", source: "literal", value: "  email-parser  " },
      ],
    );

    expect(result).toEqual({ client: "Acme Pty Ltd", origin: "email-parser" });
  });

  it("uses the first ordered boundaries and ignores ASCII case by default", () => {
    expect(
      extractWebhookVariables(
        facts({
          bodyText:
            "noise CLIENT: First Client END trailing CLIENT: Second END",
        }),
        [
          {
            key: "client",
            source: "body_text",
            startAfter: "client:",
            endBefore: "end",
          },
        ],
      ),
    ).toEqual({ client: "First Client" });
  });

  it("can deterministically select a later repeated start marker", () => {
    expect(
      extractWebhookVariables(
        facts({ bodyText: "Customer: Acme\nCustomer: Contoso\n" }),
        [
          {
            key: "customer",
            source: "body_text",
            startAfter: "Customer: ",
            endBefore: "\n",
            occurrence: 2,
            required: true,
          },
        ],
      ),
    ).toEqual({ customer: "Contoso" });
  });

  it("honours case-sensitive boundaries", () => {
    const source = facts({ bodyText: "Ref: wrong REF: RIGHT END" });
    expect(
      extractWebhookVariables(source, [
        {
          key: "reference",
          source: "body_text",
          startAfter: "REF:",
          endBefore: "END",
          caseSensitive: true,
        },
      ]),
    ).toEqual({ reference: "RIGHT" });
    expect(
      extractWebhookVariables(source, [
        {
          key: "reference",
          source: "body_text",
          startAfter: "ref:",
          caseSensitive: true,
        },
      ]),
    ).toEqual({ reference: "" });
  });

  it("applies defaults and required semantics to missing sources and boundaries", () => {
    expect(
      extractWebhookVariables(facts(), [
        {
          key: "missing_header",
          source: "header",
          headerName: "x-not-present",
          defaultValue: " fallback ",
        },
        {
          key: "missing_start",
          source: "subject",
          startAfter: "not present",
        },
        {
          key: "missing_end",
          source: "subject",
          endBefore: "not present",
          defaultValue: "unknown",
        },
      ]),
    ).toEqual({
      missing_header: "fallback",
      missing_start: "",
      missing_end: "unknown",
    });

    expect(() =>
      extractWebhookVariables(facts(), [
        {
          key: "ticket_id",
          source: "subject",
          startAfter: "Ticket:",
          required: true,
        },
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: "required_value_missing",
        fieldKey: "ticket_id",
      }),
    );
  });

  it("trims results and truncates by Unicode code point", () => {
    expect(
      extractWebhookVariables(facts({ subject: "  A😀BC  " }), [
        {
          key: "short_subject",
          source: "subject",
          maxCharacters: 3,
        },
      ]),
    ).toEqual({ short_subject: "A😀B" });

    expect(
      extractWebhookVariables(facts({ subject: "x".repeat(1_001) }), [
        { key: "default_limit", source: "subject" },
      ]).default_limit,
    ).toHaveLength(1_000);
  });

  it("rejects too many fields, duplicate keys, and unsafe identifiers", () => {
    const tooMany = Array.from({ length: 51 }, (_, index) => ({
      key: `field_${index}`,
      source: "subject" as const,
    }));
    expect(() => extractWebhookVariables(facts(), tooMany)).toThrowError(
      expect.objectContaining({ code: "too_many_fields" }),
    );
    expect(() =>
      extractWebhookVariables(facts(), [
        { key: "same", source: "subject" },
        { key: "same", source: "from" },
      ]),
    ).toThrowError(expect.objectContaining({ code: "duplicate_key" }));

    for (const key of [
      "bad-key",
      "9starts_with_number",
      "line\nbreak",
      "__proto__",
      "constructor",
    ]) {
      expect(() =>
        extractWebhookVariables(facts(), [
          { key, source: "subject" } as WebhookExtractionField,
        ]),
      ).toThrowError(
        expect.objectContaining({ code: "invalid_key", fieldKey: "<invalid>" }),
      );
    }
  });

  it("rejects invalid and ambiguous source-specific options", () => {
    const invalidFields: Array<{
      field: WebhookExtractionField;
      code: string;
    }> = [
      {
        field: { key: "header", source: "header" },
        code: "invalid_header_name",
      },
      {
        field: {
          key: "header",
          source: "header",
          headerName: "x-good\r\nevil",
        },
        code: "invalid_header_name",
      },
      {
        field: {
          key: "literal",
          source: "literal",
          value: "value",
          headerName: "x-unused",
        },
        code: "invalid_option",
      },
      {
        field: { key: "literal", source: "literal" },
        code: "invalid_literal",
      },
      {
        field: {
          key: "subject",
          source: "subject",
          value: "unused",
        },
        code: "invalid_option",
      },
    ];

    for (const { field, code } of invalidFields) {
      expect(() => extractWebhookVariables(facts(), [field])).toThrowError(
        expect.objectContaining({ code }),
      );
    }
  });

  it("bounds markers, defaults, literals, and per-field limits", () => {
    const cases: Array<{ field: WebhookExtractionField; code: string }> = [
      {
        field: { key: "empty", source: "subject", startAfter: "" },
        code: "invalid_marker",
      },
      {
        field: {
          key: "marker",
          source: "subject",
          endBefore: "x".repeat(257),
        },
        code: "invalid_marker",
      },
      {
        field: {
          key: "fallback",
          source: "subject",
          defaultValue: "x".repeat(4_001),
        },
        code: "invalid_default",
      },
      {
        field: {
          key: "literal",
          source: "literal",
          value: "x".repeat(4_001),
        },
        code: "invalid_literal",
      },
      {
        field: { key: "zero", source: "subject", maxCharacters: 0 },
        code: "invalid_max_characters",
      },
      {
        field: { key: "occurrence", source: "subject", occurrence: 2 },
        code: "invalid_occurrence",
      },
      {
        field: {
          key: "occurrence",
          source: "subject",
          startAfter: "Alert: ",
          occurrence: 1_001,
        },
        code: "invalid_occurrence",
      },
      {
        field: { key: "large", source: "subject", maxCharacters: 4_001 },
        code: "invalid_max_characters",
      },
      {
        field: { key: "fraction", source: "subject", maxCharacters: 2.5 },
        code: "invalid_max_characters",
      },
    ];

    for (const { field, code } of cases) {
      expect(() => extractWebhookVariables(facts(), [field])).toThrowError(
        expect.objectContaining({ code }),
      );
    }
  });

  it("rejects oversized source text before scanning it", () => {
    expect(() =>
      extractWebhookVariables(facts({ bodyText: "x".repeat(1_000_001) }), [
        { key: "body", source: "body_text" },
      ]),
    ).toThrowError(expect.objectContaining({ code: "source_too_large" }));
  });

  it("reserves delivery-envelope headroom below the 64 KiB snapshot limit", () => {
    const fields = Array.from({ length: 20 }, (_, index) => ({
      key: `field_${index}`,
      source: "literal" as const,
      value: "x".repeat(4_000),
      maxCharacters: 4_000,
    }));

    expect(() => extractWebhookVariables(facts(), fields)).toThrowError(
      expect.objectContaining({ code: "output_too_large" }),
    );
  });

  it("never reflects source content or markers in errors", () => {
    const sourceSecret = "tenant-secret-source-value";
    const markerSecret = "secret-marker-that-is-not-present";
    let thrown: unknown;
    try {
      extractWebhookVariables(facts({ bodyText: sourceSecret }), [
        {
          key: "safe_key",
          source: "body_text",
          startAfter: markerSecret,
          required: true,
        },
      ]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(WebhookExtractionError);
    expect(String(thrown)).toContain("safe_key");
    expect(String(thrown)).toContain("required_value_missing");
    expect(String(thrown)).not.toContain(sourceSecret);
    expect(String(thrown)).not.toContain(markerSecret);
    expect(Object.keys(thrown as object).sort()).toEqual([
      "code",
      "fieldKey",
      "name",
    ]);
  });

  it("does not mutate email facts or field definitions", () => {
    const source = Object.freeze(
      facts({ headers: Object.freeze({ "x-client": "Acme" }) }),
    );
    const field = Object.freeze({
      key: "client",
      source: "header" as const,
      headerName: "X-Client",
    });
    expect(extractWebhookVariables(source, Object.freeze([field]))).toEqual({
      client: "Acme",
    });
  });
});
