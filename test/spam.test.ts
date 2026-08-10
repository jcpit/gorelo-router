import { describe, expect, it } from "vitest";
import { assessSpam } from "../src/spam";
import { config, email } from "./helpers";

describe("spam assessment", () => {
  it("does not treat normal urgent MSP language as spam", () => {
    const result = assessSpam(
      email({ subject: "Urgent: production server is offline" }),
      config(),
    );
    expect(result).toEqual({ score: 0, reasons: [], isSpam: false });
  });

  it("combines high-confidence subject signals", () => {
    const result = assessSpam(
      email({ subject: "YOU HAVE BEEN SELECTED - CLAIM YOUR PRIZE!!!!" }),
      config(),
    );
    expect(result.score).toBeGreaterThanOrEqual(5);
    expect(result.isSpam).toBe(true);
  });

  it("allows configured phrases and trusted domains", () => {
    const result = assessSpam(
      email({
        subject: "Custom bad phrase",
        fromDomain: "alerts.vendor.example",
      }),
      config({
        spamKeywords: ["custom bad phrase"],
        trustedSenderDomains: new Set(["vendor.example"]),
      }),
    );
    expect(result.score).toBe(0);
    expect(result.isSpam).toBe(false);
  });
});
