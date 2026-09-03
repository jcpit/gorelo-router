import { describe, expect, it } from "vitest";
import { assessSpam } from "../src/spam";
import { config, email } from "./helpers";

describe("Cloudflare spam assessment", () => {
  it("uses the Cloudflare spam header as the only score source", () => {
    const result = assessSpam(email({
      subject: "YOU HAVE BEEN SELECTED - CLAIM YOUR PRIZE!!!!",
      bodyText: "https://bit.ly/win unsubscribe",
      attachments: [{ filename: "invoice.exe", mimeType: "application/octet-stream", size: 10 }],
      headers: { "x-cf-spamh-score": "1" },
    }), config());
    expect(result).toEqual({ score: 1, reasons: ["Cloudflare spam score 1"], isSpam: true });
  });

  it("does not invent a score when Cloudflare did not provide one", () => {
    expect(assessSpam(email({ subject: "claim your prize" }), config())).toEqual({ score: 0, reasons: [], isSpam: false });
  });
});
