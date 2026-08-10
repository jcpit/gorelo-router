import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const deployScript = readFileSync(
  path.resolve("scripts/cloudflare-deploy.sh"),
  "utf8",
);
const { createCoreDeployConfig } = (await import(
  pathToFileURL(path.resolve("scripts/create-core-deploy-config.mjs")).href
)) as {
  createCoreDeployConfig: (
    config: Record<string, unknown>,
  ) => Record<string, unknown>;
};
const { hasConfirmedDeployResult } = (await import(
  pathToFileURL(path.resolve("scripts/validate-deploy-result.mjs")).href
)) as {
  hasConfirmedDeployResult: (output: string) => boolean;
};

describe("production deployment safety", () => {
  it("deploys a trigger-free core before handing off the token", () => {
    const coreDeploy = deployScript.indexOf("wrangler deploy");
    const tokenHandoff = deployScript.indexOf(
      "A new ADMIN_API_TOKEN is active",
    );
    const triggers = deployScript.indexOf("wrangler triggers deploy");

    expect(coreDeploy).toBeGreaterThan(-1);
    expect(tokenHandoff).toBeGreaterThan(coreDeploy);
    expect(triggers).toBeGreaterThan(tokenHandoff);
  });

  it("distinguishes uncertain core activation from a later trigger failure", () => {
    expect(deployScript).toContain(
      "Worker activation could not be confirmed. The generated ADMIN_API_TOKEN might be active",
    );
    expect(deployScript).toContain("Possibly active ADMIN_API_TOKEN");
    expect(deployScript).toContain(
      "The Worker version is active, but trigger reconciliation did not complete",
    );
  });

  it("removes externally visible triggers from the core deploy config", () => {
    expect(
      createCoreDeployConfig({
        name: "gorelo-router",
        workers_dev: false,
        addresses: ["*@example.com"],
        route: "legacy.example.com/*",
        routes: [{ pattern: "router.example.com", custom_domain: true }],
        triggers: { crons: ["*/5 * * * *"] },
        vars: { SPAM_ACTION: "forward" },
      }),
    ).toEqual({
      name: "gorelo-router",
      workers_dev: false,
      vars: { SPAM_ACTION: "forward" },
    });
  });

  it("requires Wrangler to record a real deployed version", () => {
    const versionId = "01234567-89ab-4cde-8123-456789abcdef";
    expect(
      hasConfirmedDeployResult(
        `${JSON.stringify({ type: "deploy", version_id: versionId })}\n`,
      ),
    ).toBe(true);
    expect(
      hasConfirmedDeployResult(
        `${JSON.stringify({ type: "deploy", version_id: null })}\n`,
      ),
    ).toBe(false);
    expect(
      hasConfirmedDeployResult(
        `${JSON.stringify({ type: "command-failed", code: 10000 })}\n`,
      ),
    ).toBe(false);
  });
});
