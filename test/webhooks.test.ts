import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseAllowedWebhookHosts,
  sendWebhook,
  signWebhookPayload,
  validateWebhookUrl,
  WEBHOOK_DELIVERY_ID_HEADER,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_EVENT_ID_HEADER,
  WEBHOOK_IDEMPOTENCY_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WebhookDeliveryError,
  type WebhookFetch,
} from "../src/webhooks";

const SECRET = "test-signing-secret-at-least-32-bytes-long";
const ALLOWED = parseAllowedWebhookHosts(
  "hooks.example.com, events.vendor.example",
);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("webhook destination validation", () => {
  it("parses, canonicalizes, and deduplicates exact DNS hostnames", () => {
    expect([
      ...parseAllowedWebhookHosts(
        " Hooks.Example.com,events.vendor.example,hooks.example.com ",
      ),
    ]).toEqual(["hooks.example.com", "events.vendor.example"]);
  });

  it.each([
    "",
    "hooks.example.com,",
    "*.example.com",
    "https://hooks.example.com",
    "hooks.example.com:443",
    "localhost",
    "hooks.localhost",
    "hooks.local",
    "hooks.internal",
    "127.0.0.1",
    "[::1]",
    "singlelabel",
    "-hooks.example.com",
    "hooks..example.com",
  ])("rejects an unsafe allowlist entry %s", (entry) => {
    expect(() => parseAllowedWebhookHosts(entry)).toThrowError(
      expect.objectContaining({
        code: "invalid_configuration",
        classification: "definitive",
      }),
    );
  });

  it("allows a bounded path and non-sensitive query on an exact host", () => {
    expect(
      validateWebhookUrl(
        "https://HOOKS.EXAMPLE.COM:443/mail/events?workspace=ops&format=json",
        ALLOWED,
      ).href,
    ).toBe("https://hooks.example.com/mail/events?workspace=ops&format=json");
  });

  it.each([
    "http://hooks.example.com/event",
    "https://hooks.example.com:8443/event",
    "https://user@hooks.example.com/event",
    "https://hooks.example.com/event#secret",
    "https://hooks.example.com.evil.test/event",
    "https://sub.hooks.example.com/event",
    "https://127.0.0.1/event",
    "https://localhost/event",
    " https://hooks.example.com/event",
    "https://hooks.example.com/event?token=do-not-send-this",
    "https://hooks.example.com/event?client_secret=do-not-send-this",
    "https://hooks.example.com/event?webhookApiKey=do-not-send-this",
    "https://hooks.example.com/event?signature=do-not-send-this",
    "https://hooks.example.com/event?name=%0Aunsafe",
    "https://hooks.example.com/%0Aunsafe",
  ])("rejects unsafe URL %s without reflecting it", (url) => {
    let thrown: unknown;
    try {
      validateWebhookUrl(url, ALLOWED);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(WebhookDeliveryError);
    expect(String(thrown)).not.toContain(url);
    expect(String(thrown)).not.toContain("do-not-send-this");
  });

  it("rejects a malformed directly supplied allowlist", () => {
    expect(() =>
      validateWebhookUrl(
        "https://hooks.example.com/event",
        new Set(["*.example.com"]),
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_configuration" }));
  });
});

describe("webhook signing", () => {
  it("signs the timestamp and exact UTF-8 JSON bytes with HMAC-SHA256", async () => {
    const timestamp = "1786201234";
    const body = '{"message":"héllo","count":2}';
    const expected = createHmac("sha256", SECRET)
      .update(`${timestamp}.`)
      .update(Buffer.from(body, "utf8"))
      .digest("hex");

    await expect(signWebhookPayload(SECRET, timestamp, body)).resolves.toBe(
      `v1=${expected}`,
    );
    await expect(
      signWebhookPayload(SECRET, timestamp, new TextEncoder().encode(body)),
    ).resolves.toBe(`v1=${expected}`);
  });

  it("rejects weak or malformed secrets without reflecting them", async () => {
    const malformed = "short\nsecret";
    let thrown: unknown;
    try {
      await signWebhookPayload(malformed, "1786201234", "{}");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(WebhookDeliveryError);
    expect(String(thrown)).not.toContain(malformed);
    expect(String(thrown)).not.toContain("secret");
  });
});

describe("webhook delivery", () => {
  it("posts a bounded envelope with verifiable headers and exact-body signature", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T01:02:03.000Z"));
    const fetchMock = vi.fn<WebhookFetch>(
      async () => new Response(null, { status: 204 }),
    );

    await expect(
      sendWebhook({
        url: "https://hooks.example.com/mail?workspace=ops",
        allowedHosts: ALLOWED,
        signingSecret: SECRET,
        eventType: "mail.processed",
        eventId: "event-123",
        deliveryId: "delivery-456",
        payload: { subject: "Disk alert", score: 7, active: true },
        fetch: fetchMock,
      }),
    ).resolves.toEqual({
      ok: true,
      status: 204,
      eventId: "event-123",
      deliveryId: "delivery-456",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [input, init] = fetchMock.mock.calls[0]!;
    expect(String(input)).toBe("https://hooks.example.com/mail?workspace=ops");
    expect(init).toMatchObject({ method: "POST", redirect: "error" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);

    const body = String(init?.body);
    expect(JSON.parse(body)).toEqual({
      specVersion: "1.0",
      eventType: "mail.processed",
      eventId: "event-123",
      deliveryId: "delivery-456",
      sentAt: "2026-08-09T01:02:03.000Z",
      data: { subject: "Disk alert", score: 7, active: true },
    });
    const headers = new Headers(init?.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get(WEBHOOK_TIMESTAMP_HEADER)).toBe("1786237323");
    expect(headers.get(WEBHOOK_EVENT_HEADER)).toBe("mail.processed");
    expect(headers.get(WEBHOOK_EVENT_ID_HEADER)).toBe("event-123");
    expect(headers.get(WEBHOOK_DELIVERY_ID_HEADER)).toBe("delivery-456");
    expect(headers.get(WEBHOOK_IDEMPOTENCY_HEADER)).toBe("delivery-456");
    const expectedSignature = createHmac("sha256", SECRET)
      .update(`1786237323.${body}`)
      .digest("hex");
    expect(headers.get(WEBHOOK_SIGNATURE_HEADER)).toBe(
      `v1=${expectedSignature}`,
    );
  });

  it("generates a delivery identifier when one is not supplied", async () => {
    const fetchMock = vi.fn<WebhookFetch>(
      async () => new Response(null, { status: 200 }),
    );
    const result = await sendWebhook({
      url: "https://hooks.example.com/mail",
      allowedHosts: ALLOWED,
      signingSecret: SECRET,
      eventType: "mail.received",
      eventId: "event-123",
      payload: null,
      fetch: fetchMock,
    });
    expect(result.deliveryId).toMatch(/^[0-9a-f-]{36}$/);
    const headers = new Headers(fetchMock.mock.calls[0]![1]?.headers);
    expect(headers.get(WEBHOOK_IDEMPOTENCY_HEADER)).toBe(result.deliveryId);
  });

  it.each([
    [400, "definitive"],
    [404, "definitive"],
    [408, "definitive"],
    [429, "retryable"],
    [500, "retryable"],
    [503, "retryable"],
    [302, "retryable"],
  ] as const)(
    "classifies status %i as %s and discards the response body",
    async (status, classification) => {
      const cancel = vi.fn(async () => undefined);
      const stream = new ReadableStream({ cancel });
      const fetchMock = vi.fn<WebhookFetch>(
        async () => new Response(stream, { status }),
      );

      let thrown: unknown;
      try {
        await sendWebhook({
          url: "https://hooks.example.com/mail",
          allowedHosts: ALLOWED,
          signingSecret: SECRET,
          eventType: "mail.processed",
          eventId: "event-123",
          deliveryId: "delivery-456",
          payload: { safe: true },
          fetch: fetchMock,
        });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({
        code: "http_error",
        classification,
        status,
      });
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it("holds network errors as uncertain without leaking their message", async () => {
    const fetchMock = vi.fn<WebhookFetch>(async () => {
      throw new Error(
        "network failed for https://hooks.example.com/mail?token=leaked-secret",
      );
    });
    let thrown: unknown;
    try {
      await sendWebhook({
        url: "https://hooks.example.com/mail?workspace=ops",
        allowedHosts: ALLOWED,
        signingSecret: SECRET,
        eventType: "mail.processed",
        eventId: "event-123",
        payload: { private: "payload-secret" },
        fetch: fetchMock,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      code: "network_error",
      classification: "uncertain",
    });
    expect(String(thrown)).not.toContain("hooks.example.com");
    expect(String(thrown)).not.toContain("leaked-secret");
    expect(String(thrown)).not.toContain("payload-secret");
    expect(String(thrown)).not.toContain(SECRET);
  });

  it("classifies a whole-request timeout after dispatch as uncertain and aborts it", async () => {
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn<WebhookFetch>(
      async (_input, init) =>
        new Promise<Response>(() => {
          requestSignal = init?.signal ?? undefined;
        }),
    );
    const result = sendWebhook({
      url: "https://hooks.example.com/mail",
      allowedHosts: ALLOWED,
      signingSecret: SECRET,
      eventType: "mail.processed",
      eventId: "event-123",
      payload: {},
      fetch: fetchMock,
      timeoutMs: 50,
    });

    await expect(result).rejects.toMatchObject({
      code: "timeout",
      classification: "uncertain",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(requestSignal?.aborted).toBe(true);
  });

  it("rejects unsafe envelopes before dispatch", async () => {
    const fetchMock = vi.fn<WebhookFetch>();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await expect(
      sendWebhook({
        url: "https://hooks.example.com/mail",
        allowedHosts: ALLOWED,
        signingSecret: SECRET,
        eventType: "mail.processed",
        eventId: "event-123",
        payload: circular,
        fetch: fetchMock,
      }),
    ).rejects.toMatchObject({ code: "invalid_payload" });
    await expect(
      sendWebhook({
        url: "https://hooks.example.com/mail",
        allowedHosts: ALLOWED,
        signingSecret: SECRET,
        eventType: "mail.processed",
        eventId: "event-123\r\ninjected: header",
        payload: {},
        fetch: fetchMock,
      }),
    ).rejects.toMatchObject({ code: "invalid_configuration" });
    await expect(
      sendWebhook({
        url: "https://hooks.example.com/mail",
        allowedHosts: ALLOWED,
        signingSecret: SECRET,
        eventType: "mail.processed",
        eventId: "event-123",
        payload: { huge: "x".repeat(256 * 1024) },
        fetch: fetchMock,
      }),
    ).rejects.toMatchObject({ code: "invalid_payload" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects accessors, proxies, custom objects, symbols, and non-finite numbers safely", async () => {
    const getter = vi.fn(() => "must-not-run");
    const withAccessor = Object.defineProperty({}, "secret", {
      enumerable: true,
      get: getter,
    });
    const arrayWithAccessor: unknown[] = [];
    Object.defineProperty(arrayWithAccessor, "0", {
      enumerable: true,
      get: getter,
    });
    const hostileProxy = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error("payload-secret");
        },
      },
    );
    const withSymbol = { [Symbol("hidden")]: true };
    const fetchMock = vi.fn<WebhookFetch>();

    for (const payload of [
      withAccessor,
      arrayWithAccessor,
      hostileProxy,
      new Date(),
      withSymbol,
      NaN,
    ]) {
      let thrown: unknown;
      try {
        await sendWebhook({
          url: "https://hooks.example.com/mail",
          allowedHosts: ALLOWED,
          signingSecret: SECRET,
          eventType: "mail.processed",
          eventId: "event-123",
          payload,
          fetch: fetchMock,
        });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({ code: "invalid_payload" });
      expect(String(thrown)).not.toContain("payload-secret");
    }
    expect(getter).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
