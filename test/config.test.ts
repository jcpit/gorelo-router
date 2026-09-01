import { describe, expect, it } from "vitest";
import { ConfigurationError, loadConfig } from "../src/config";
import type { Env } from "../src/types";

function env(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    DEFAULT_GORELO_ADDRESS: "Tickets@Gorelo.Example",
    ...overrides,
  };
}

describe("runtime configuration", () => {
  it("normalizes address and domain forwarding policies", () => {
    const result = loadConfig(
      env({
        QUARANTINE_ADDRESS: "Quarantine@Example.com",
        FAILURE_FORWARD_ADDRESS: "Failures@Example.com",
        ALLOWED_FORWARD_DOMAINS: " Managed.Example , OTHER.example ",
      }),
    );
    expect(result.defaultGoreloAddress).toBe("tickets@gorelo.example");
    expect(result.allowedForwardDestinations).toEqual(
      new Set([
        "tickets@gorelo.example",
        "quarantine@example.com",
        "failures@example.com",
      ]),
    );
    expect(result.allowedForwardDomains).toEqual(
      new Set(["gorelo.example", "managed.example", "other.example"]),
    );
    expect(result.quarantineMode).toBe("mailbox");
    expect(result.archiveMode).toBe("quarantine");
  });

  it("normalizes multiple inbound email domains", () => {
    const result = loadConfig(
      env({
        INBOUND_EMAIL_DOMAINS:
          " Alerts.Example.com, monitoring.example.net,alerts.example.com ",
      }),
    );
    expect(result.inboundEmailDomains).toEqual(
      new Set(["alerts.example.com", "monitoring.example.net"]),
    );
    expect(() =>
      loadConfig(env({ INBOUND_EMAIL_DOMAINS: "*@alerts.example.com" })),
    ).toThrow("INBOUND_EMAIL_DOMAINS");
  });

  it("supports an internal quarantine without a mailbox destination", () => {
    const result = loadConfig(
      env({
        SPAM_ACTION: "quarantine",
        QUARANTINE_MODE: "INTERNAL",
        ARCHIVE_MODE: "ALL",
        RELEASE_FROM_ADDRESS: "Release@Alerts.Example.net",
      }),
    );
    expect(result.quarantineMode).toBe("internal");
    expect(result.archiveMode).toBe("all");
    expect(result.releaseFromAddress).toBe("release@alerts.example.net");
  });

  it("fails closed when no failure or quarantine address is configured", () => {
    const result = loadConfig(env());
    expect(result.failureForwardAddress).toBeUndefined();
  });

  it("requires a quarantine destination for the quarantine spam action", () => {
    expect(() => loadConfig(env({ SPAM_ACTION: "quarantine" }))).toThrow(
      ConfigurationError,
    );
  });

  it("rejects invalid numeric settings", () => {
    expect(() => loadConfig(env({ SPAM_THRESHOLD: "not-a-number" }))).toThrow(
      "SPAM_THRESHOLD",
    );
    expect(() => loadConfig(env({ SPAM_THRESHOLD: "9" }))).toThrow(
      "SPAM_THRESHOLD",
    );
  });

  it("rejects malformed forwarding addresses", () => {
    expect(() =>
      loadConfig(env({ DEFAULT_GORELO_ADDRESS: "bad,addr@example.com" })),
    ).toThrow("DEFAULT_GORELO_ADDRESS");
    expect(() =>
      loadConfig(
        env({ ALLOWED_FORWARD_DESTINATIONS: "bad..addr@example.com" }),
      ),
    ).toThrow("ALLOWED_FORWARD_DESTINATIONS");
  });

  it("rejects malformed forwarding domains instead of broadening matches", () => {
    for (const domain of [
      "*.example.com",
      "alerts@example.com",
      "https://example.com",
      "example..com",
      "example.com.",
      "127.0.0.1",
      "münich.example",
      "localhost",
    ]) {
      expect(() =>
        loadConfig(env({ ALLOWED_FORWARD_DOMAINS: domain })),
      ).toThrow("ALLOWED_FORWARD_DOMAINS");
    }
  });

  it("rejects invalid review modes and release senders", () => {
    expect(() => loadConfig(env({ QUARANTINE_MODE: "queue" }))).toThrow(
      "QUARANTINE_MODE",
    );
    expect(() => loadConfig(env({ ARCHIVE_MODE: "forever" }))).toThrow(
      "ARCHIVE_MODE",
    );
    expect(() =>
      loadConfig(env({ RELEASE_FROM_ADDRESS: "not-an-address" })),
    ).toThrow("RELEASE_FROM_ADDRESS");
  });

  it("uses the Australian Gorelo API by default without requiring API mode", () => {
    const result = loadConfig(env());
    expect(result.goreloApiBaseUrl).toBe("https://api.aue.gorelo.io");
    expect(result.goreloRegion).toBe("aue");
    expect(result.goreloApiConfigured).toBe(false);
    expect(result.goreloCatalogCacheSeconds).toBe(300);
  });

  it("accepts only the published Gorelo regional API origins", () => {
    const result = loadConfig(
      env({
        GORELO_API_KEY: "configured-key",
        GORELO_API_BASE_URL: "https://api.usw.gorelo.io/",
        GORELO_CATALOG_CACHE_SECONDS: "600",
      }),
    );
    expect(result.goreloApiBaseUrl).toBe("https://api.usw.gorelo.io");
    expect(result.goreloRegion).toBe("usw");
    expect(result.goreloApiConfigured).toBe(true);
    expect(result.goreloCatalogCacheSeconds).toBe(600);

    for (const baseUrl of [
      "http://api.aue.gorelo.io",
      "https://example.com",
      "https://api.aue.gorelo.io/v1",
      "https://user:secret@api.aue.gorelo.io",
      "https://api.aue.gorelo.io?redirect=https://example.com",
    ]) {
      expect(() => loadConfig(env({ GORELO_API_BASE_URL: baseUrl }))).toThrow(
        "GORELO_API_BASE_URL",
      );
    }
  });

  it("keeps webhooks disabled by default and accepts an exact HTTPS host allowlist", () => {
    const disabled = loadConfig(env());
    expect(disabled.allowedWebhookHosts).toEqual(new Set());
    expect(disabled.webhookSigningConfigured).toBe(false);
    expect(disabled.webhookTimeoutMs).toBe(8_000);

    const configured = loadConfig(
      env({
        ALLOWED_WEBHOOK_HOSTS: "hooks.example.com, workflows.example.net",
        WEBHOOK_SIGNING_SECRET: "a-secure-example-secret-that-is-long-enough",
        WEBHOOK_TIMEOUT_MS: "5000",
      }),
    );
    expect(configured.allowedWebhookHosts).toEqual(
      new Set(["hooks.example.com", "workflows.example.net"]),
    );
    expect(configured.webhookSigningConfigured).toBe(true);
    expect(configured.webhookTimeoutMs).toBe(5_000);
  });

  it("rejects unsafe webhook settings", () => {
    for (const hosts of [
      "localhost",
      "127.0.0.1",
      "*.example.com",
      "hooks.example.com,",
    ]) {
      expect(() => loadConfig(env({ ALLOWED_WEBHOOK_HOSTS: hosts }))).toThrow(
        "ALLOWED_WEBHOOK_HOSTS",
      );
    }
    expect(() =>
      loadConfig(env({ WEBHOOK_SIGNING_SECRET: "too-short" })),
    ).toThrow("WEBHOOK_SIGNING_SECRET");
    expect(() => loadConfig(env({ WEBHOOK_TIMEOUT_MS: "30001" }))).toThrow(
      "WEBHOOK_TIMEOUT_MS",
    );
  });
});
