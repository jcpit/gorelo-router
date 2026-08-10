import { describe, expect, it } from "vitest";
import {
  inferExtractionTemplate,
  TemplateInferenceError,
} from "../src/template-inference";

function selection(sample: string, value: string, occurrence = 1) {
  let start = -1;
  let offset = 0;
  for (let current = 0; current < occurrence; current += 1) {
    start = sample.indexOf(value, offset);
    offset = start + value.length;
  }
  if (start < 0) throw new Error("Test selection was not found");
  return { selectionStart: start, selectionEnd: start + value.length };
}

describe("template inference", () => {
  it("infers stable line markers and verifies the selected value", () => {
    const sample = "Customer: Acme\nDevice: srv-01";
    const result = inferExtractionTemplate({
      key: "customer",
      source: "body_text",
      sample,
      ...selection(sample, "Acme"),
    });

    expect(result).toEqual({
      field: {
        key: "customer",
        source: "body_text",
        startAfter: "Customer: ",
        endBefore: "\n",
        required: true,
      },
      value: "Acme",
      confidence: "high",
      warnings: [],
    });
  });

  it("normalizes CRLF while preserving original selection offsets", () => {
    const sample = "Customer: Acme\r\nDevice: srv-01";
    const result = inferExtractionTemplate({
      key: "device",
      source: "body_text",
      sample,
      ...selection(sample, "srv-01"),
    });

    expect(result.field).toMatchObject({
      startAfter: "Device: ",
      required: true,
    });
    expect(result.field).not.toHaveProperty("endBefore");
    expect(result.value).toBe("srv-01");
    expect(JSON.stringify(result.field)).not.toContain("\r");
  });

  it("pins a repeated label to a deterministic occurrence", () => {
    const sample = "Customer: Acme\nCustomer: Contoso\n";
    const result = inferExtractionTemplate({
      key: "second_customer",
      source: "body_text",
      sample,
      ...selection(sample, "Contoso"),
    });

    expect(result.field).toMatchObject({
      startAfter: "Customer: ",
      endBefore: "\n",
      occurrence: 2,
    });
    expect(result.value).toBe("Contoso");
    expect(result.confidence).toBe("medium");
    expect(result.warnings.join(" ")).toContain("occurrence 2");
  });

  it.each(["from", "to"] as const)(
    "supports selecting the complete %s value",
    (source) => {
      const sample = "alerts@vendor.example";
      expect(
        inferExtractionTemplate({
          key: `${source}_address`,
          source,
          sample,
          selectionStart: 0,
          selectionEnd: sample.length,
        }),
      ).toMatchObject({
        field: { key: `${source}_address`, source, required: true },
        value: sample,
        confidence: "high",
        warnings: [],
      });
    },
  );

  it("excludes selected edge whitespace and reports it", () => {
    const sample = "Customer:  Acme  \n";
    const start = sample.indexOf(" Acme ");
    const result = inferExtractionTemplate({
      key: "customer",
      source: "body_text",
      sample,
      selectionStart: start,
      selectionEnd: start + " Acme ".length,
    });

    expect(result.value).toBe("Acme");
    expect(result.warnings.join(" ")).toContain("whitespace");
  });

  it("fails with a redacted error when the selection has no safe boundary", () => {
    const secretSample = "aaaa";
    let thrown: unknown;
    try {
      inferExtractionTemplate({
        key: "value",
        source: "subject",
        sample: secretSample,
        selectionStart: 1,
        selectionEnd: 3,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TemplateInferenceError);
    expect(thrown).toMatchObject({ code: "unsupported_context" });
    expect(String(thrown)).not.toContain(secretSample);
  });

  it("rejects selected values above the extraction output limit", () => {
    const sample = "x".repeat(4_001);
    expect(() =>
      inferExtractionTemplate({
        key: "value",
        source: "body_text",
        sample,
        selectionStart: 0,
        selectionEnd: sample.length,
      }),
    ).toThrowError(expect.objectContaining({ code: "selection_too_large" }));
  });
});
