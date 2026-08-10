import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { extractBasicEmailFacts, extractEmailFacts } from "../src/mime";
import type { StoredRule } from "../src/types";
import { config, rule } from "./helpers";

function inbound(raw: Uint8Array): ForwardableEmailMessage {
  const text = new TextDecoder().decode(raw);
  const headers = new Headers();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) break;
    const separator = line.indexOf(":");
    if (separator > 0) {
      headers.append(
        line.slice(0, separator),
        line.slice(separator + 1).trim(),
      );
    }
  }
  return {
    from: "alerts@vendor.example",
    to: "support@alerts.example.net",
    headers,
    raw: new Blob([raw]).stream(),
    rawSize: raw.byteLength,
    setReject() {},
    async forward() {
      return {} as EmailSendResult;
    },
    async reply() {
      return {} as EmailSendResult;
    },
  };
}

async function fixture(): Promise<Uint8Array> {
  return new Uint8Array(
    await readFile(
      decodeURIComponent(
        new URL("./fixtures/multipart.eml", import.meta.url).pathname,
      ),
    ),
  );
}

function bodyRule(): StoredRule {
  return rule({
    name: "Disk alert",
    description: "",
    priority: 10,
    enabled: true,
    match: "all",
    conditions: [
      {
        field: "body_text",
        operator: "contains",
        value: "95 percent",
        caseSensitive: false,
      },
    ],
    action: { type: "forward" },
  });
}

describe("MIME extraction", () => {
  it("stores headers without Object prototype properties", async () => {
    const facts = extractBasicEmailFacts(inbound(await fixture()));
    expect(Object.getPrototypeOf(facts.headers)).toBeNull();
    expect(Object.hasOwn(facts.headers, "constructor")).toBe(false);
  });

  it("skips MIME parsing when no active rule needs content", async () => {
    const facts = await extractEmailFacts(
      inbound(await fixture()),
      [],
      config(),
    );
    expect(facts.mimeParsed).toBe(false);
    expect(facts.subject).toBe("Server – Disk Alert");
    expect(facts.bodyText).toBe("");
  });

  it("decodes bodies, subjects, and attachment metadata for content rules", async () => {
    const facts = await extractEmailFacts(
      inbound(await fixture()),
      [bodyRule()],
      config(),
    );
    expect(facts.mimeParsed).toBe(true);
    expect(facts.subject).toBe("Server – Disk Alert");
    expect(facts.bodyText).toContain("exceeded 95 percent");
    expect(facts.attachments).toEqual([
      {
        filename: "diagnostics.txt",
        mimeType: "text/plain",
        size: 11,
      },
    ]);
  });

  it("fails closed when required MIME inspection exceeds the guardrail", async () => {
    await expect(
      extractEmailFacts(
        inbound(await fixture()),
        [bodyRule()],
        config({ maxParseBytes: 1 }),
      ),
    ).rejects.toThrow("exceeds MAX_PARSE_BYTES");
  });

  it("extracts visible HTML text without including script content", async () => {
    const raw = new TextEncoder().encode(`From: alerts@vendor.example
To: support@alerts.example.net
Subject: HTML alert
Message-ID: <html-alert@vendor.example>
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8

<style>.hidden { display:none }</style><script>failure secret</script><p>Visible</p><p>outage text</p>`);
    const facts = await extractEmailFacts(inbound(raw), [bodyRule()], config());
    expect(facts.bodyText).toContain("Visible outage text");
    expect(facts.bodyText).not.toContain("failure secret");
  });

  it("combines divergent alternatives and preserves inline visible words", async () => {
    const raw = new TextEncoder().encode(`From: alerts@vendor.example
To: support@alerts.example.net
Subject: Alternative alert
Message-ID: <alternative-alert@vendor.example>
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="alternative"

--alternative
Content-Type: text/plain; charset=utf-8

Routine update
--alternative
Content-Type: text/html; charset=utf-8

<p>Critical <span>mal</span><span>ware</span> and <b>off</b>line alert</p>
--alternative--`);
    const facts = await extractEmailFacts(inbound(raw), [bodyRule()], config());
    expect(facts.bodyText).toContain("Routine update");
    expect(facts.bodyText).toContain("malware");
    expect(facts.bodyText).toContain("offline");
  });
});
