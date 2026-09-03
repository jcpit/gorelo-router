import { describe, expect, it } from "vitest";
import { assessSpam } from "../src/spam";
import { config, email } from "./helpers";

describe("Cloudflare spam assessment", () => {
  it("uses the Cloudflare spam header as the only score source", () => {
    const result = assessSpam(email({
      subject: "YOU HAVE BEEN SELECTED - CLAIM YOUR PRIZE!!!!",
      bodyText: "https://bit.ly/win unsubscribe",
      attachments: [{ filename: "invoice.exe", mimeType: "application/octet-stream", size: 10 }],
      headers: { "x-cf-spamh-score": "5" },
    }), config());
    expect(result).toEqual({ score: 5, reasons: ["Cloudflare spam score 5"], isSpam: true });
  });

  it("does not invent a score when Cloudflare did not provide one", () => {
    expect(assessSpam(email({ subject: "claim your prize" }), config())).toEqual({ score: 0, reasons: [], isSpam: false });
  });

  it("uses the configured threshold for global spam handling", () => {
    const facts = email({ headers: { "x-cf-spamh-score": "4" } });
    expect(assessSpam(facts, { ...config(), spamThreshold: 5 }).isSpam).toBe(false);
    expect(assessSpam(facts, { ...config(), spamThreshold: 4 }).isSpam).toBe(true);
  });
});
