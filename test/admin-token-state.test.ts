import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

interface SecretListResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

type ClassifyAdminTokenState = (
  result: SecretListResult,
) => "configured" | "missing";

const helperUrl = pathToFileURL(
  path.resolve("scripts/admin-token-state.mjs"),
).href;
const { classifyAdminTokenState } = (await import(helperUrl)) as {
  classifyAdminTokenState: ClassifyAdminTokenState;
};

function result(overrides: Partial<SecretListResult> = {}): SecretListResult {
  return {
    status: 0,
    stdout: "[]",
    stderr: "",
    ...overrides,
  };
}

describe("admin token state inspection", () => {
  it("recognizes the exact configured secret name", () => {
    expect(
      classifyAdminTokenState(
        result({
          stdout: JSON.stringify([
            { name: "GORELO_API_KEY", type: "secret_text" },
            { name: "ADMIN_API_TOKEN", type: "secret_text" },
          ]),
        }),
      ),
    ).toBe("configured");
  });

  it("treats a valid list without the admin token as missing", () => {
    expect(
      classifyAdminTokenState(
        result({
          stdout: JSON.stringify([
            { name: "GORELO_API_KEY", type: "secret_text" },
          ]),
        }),
      ),
    ).toBe("missing");
  });

  it("recognizes only Wrangler's pinned new-Worker diagnostic", () => {
    expect(
      classifyAdminTokenState(
        result({
          status: 1,
          stderr: `Worker "gorelo-router" not found.\n\nIf this is a new Worker, run \`wrangler deploy\` first to create it.\nOtherwise, check that the Worker name is correct and you're logged into the right account.`,
        }),
      ),
    ).toBe("missing");

    expect(() =>
      classifyAdminTokenState(
        result({ status: 1, stderr: "Worker not found during API request." }),
      ),
    ).toThrow("Worker not found during API request.");

    expect(() =>
      classifyAdminTokenState(
        result({
          status: 1,
          stderr:
            "If this is a new Worker, run `wrangler deploy` first to create it.",
        }),
      ),
    ).toThrow("If this is a new Worker");

    expect(() =>
      classifyAdminTokenState(
        result({
          status: 1,
          stderr: 'Worker "gorelo-router" not found. Authentication failed.',
        }),
      ),
    ).toThrow("Authentication failed");
  });

  it("fails closed on authentication and network errors", () => {
    expect(() =>
      classifyAdminTokenState(
        result({ status: 1, stderr: "Authentication error [code: 10000]" }),
      ),
    ).toThrow("Authentication error");

    expect(() =>
      classifyAdminTokenState(
        result({ status: 1, stderr: "Unable to connect to Cloudflare." }),
      ),
    ).toThrow("Unable to connect to Cloudflare.");
  });

  it("fails closed on malformed successful output", () => {
    expect(() =>
      classifyAdminTokenState(result({ stdout: "not json" })),
    ).toThrow("invalid secret-list response");
    expect(() => classifyAdminTokenState(result({ stdout: "{}" }))).toThrow(
      "invalid secret-list response",
    );
  });

  it("reports process launch failures without treating them as missing", () => {
    expect(() =>
      classifyAdminTokenState(
        result({
          status: null,
          error: new Error("spawn failed"),
        }),
      ),
    ).toThrow("Unable to inspect Worker secrets: spawn failed");
  });
});
