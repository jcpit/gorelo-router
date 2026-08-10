import { afterEach, describe, expect, it, vi } from "vitest";
import { handleFetch } from "../src/api";
import type { Env } from "../src/types";

const ADMIN_TOKEN = "test-admin-token-0123456789-abcdef";

function environment(db: D1Database, overrides: Partial<Env> = {}): Env {
  return {
    DB: db,
    ADMIN_API_TOKEN: ADMIN_TOKEN,
    DEFAULT_GORELO_ADDRESS: "tickets@gorelo.example",
    ALLOWED_FORWARD_DESTINATIONS: "tickets@gorelo.example",
    ...overrides,
  };
}

function request(body: unknown, authenticated = true): Request {
  return new Request("https://worker.example/api/v1/extraction/infer", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authenticated ? { authorization: `Bearer ${ADMIN_TOKEN}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extraction inference API", () => {
  it("infers and verifies a field without querying D1 or calling a provider", async () => {
    const prepare = vi.fn();
    const providerFetch = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", providerFetch);
    const sample = "Customer: Acme\nDevice: srv-01";
    const start = sample.indexOf("Acme");

    const response = await handleFetch(
      request({
        key: "customer",
        source: "body_text",
        sample,
        selectionStart: start,
        selectionEnd: start + "Acme".length,
      }),
      environment({ prepare } as unknown as D1Database),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
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
    expect(prepare).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("supports complete envelope-address selections", async () => {
    const sample = "alerts@vendor.example";
    const response = await handleFetch(
      request({
        key: "sender",
        source: "from",
        sample,
        selectionStart: 0,
        selectionEnd: sample.length,
      }),
      environment({} as D1Database),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      field: { key: "sender", source: "from", required: true },
      value: sample,
    });
  });

  it("requires admin authentication", async () => {
    const response = await handleFetch(
      request(
        {
          key: "subject",
          source: "subject",
          sample: "Alert",
          selectionStart: 0,
          selectionEnd: 5,
        },
        false,
      ),
      environment({} as D1Database),
    );

    expect(response.status).toBe(401);
  });

  it("reuses the credential-shaped field-key policy", async () => {
    const response = await handleFetch(
      request({
        key: "customer_api_key",
        source: "subject",
        sample: "Alert",
        selectionStart: 0,
        selectionEnd: 5,
      }),
      environment({} as D1Database),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        title: "Validation failed",
        details: [
          expect.objectContaining({
            path: "key",
            message: "Reserved object keys are not allowed",
          }),
        ],
      },
    });
  });

  it("returns a redacted inference error", async () => {
    const secret = "private-tenant-value";
    const sample = `${secret}aaaa`;
    const start = sample.length - 3;
    const response = await handleFetch(
      request({
        key: "value",
        source: "subject",
        sample,
        selectionStart: start,
        selectionEnd: sample.length - 1,
      }),
      environment({} as D1Database),
    );

    expect(response.status).toBe(422);
    const body = await response.text();
    expect(body).toContain("unsupported_context");
    expect(body).not.toContain(secret);
  });

  it("rejects invalid ranges and oversized samples before inference", async () => {
    const invalidRange = await handleFetch(
      request({
        key: "value",
        source: "body_text",
        sample: "short",
        selectionStart: 4,
        selectionEnd: 2,
      }),
      environment({} as D1Database),
    );
    expect(invalidRange.status).toBe(400);

    const oversized = await handleFetch(
      request({
        key: "value",
        source: "body_text",
        sample: "x".repeat(200_001),
        selectionStart: 0,
        selectionEnd: 1,
      }),
      environment({} as D1Database),
    );
    expect(oversized.status).toBe(400);
  });
});
