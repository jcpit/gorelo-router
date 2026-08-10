import { EmailMessage } from "cloudflare:email";
import { describe, expect, it, vi } from "vitest";
import {
  archiveRawMessage,
  deleteArchivedMessage,
  prepareReleasedMessage,
  readArchivedMessage,
  releaseArchivedMessage,
  verifiedArchivedArrayBuffer,
} from "../src/archive";

interface CapturedObject {
  bytes: Uint8Array;
  object: R2ObjectBody;
  options: R2PutOptions | undefined;
}

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function fakeBucket(): {
  bucket: R2Bucket;
  deleted: string[];
  objects: Map<string, CapturedObject>;
  put: ReturnType<typeof vi.fn>;
} {
  const objects = new Map<string, CapturedObject>();
  const deleted: string[] = [];

  const put = vi.fn(
    async (key: string, value: ArrayBuffer, options?: R2PutOptions) => {
      const bytes = new Uint8Array(value.slice(0));
      const object = {
        key,
        size: bytes.byteLength,
        arrayBuffer: async () => bytes.slice().buffer,
        text: async () => new TextDecoder().decode(bytes),
      } as unknown as R2ObjectBody;
      objects.set(key, { bytes, object, options });
      return object;
    },
  );
  const get = vi.fn(async (key: string) => objects.get(key)?.object ?? null);
  const remove = vi.fn(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      deleted.push(key);
      objects.delete(key);
    }
  });

  return {
    bucket: { put, get, delete: remove } as unknown as R2Bucket,
    deleted,
    objects,
    put,
  };
}

describe("message archive", () => {
  it("stores exact raw bytes under an opaque date/UUID key with SHA-256 metadata", async () => {
    const fake = fakeBucket();
    const eventId = "7e5a2df6-3218-4b26-a18a-ed3a453be232";
    const raw = new TextEncoder().encode(
      "From: sender@example.com\r\n" +
        "To: support@example.com\r\n" +
        "Subject: Alert\r\n\r\n" +
        "Raw body.\r\n",
    );

    const archived = await archiveRawMessage(
      fake.bucket,
      eventId,
      ownedBuffer(raw),
      "2026-08-08T03:14:15.000Z",
    );

    expect(archived).toEqual({
      objectKey: `messages/2026/08/08/${eventId}.eml`,
      sha256:
        "4ed0e26cc412e58b512b0b209adcb2ab57d0ac03bd3ed9a47a04adb5a82b00fd",
    });
    expect(archived.objectKey).toMatch(
      /^messages\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f-]{36}\.eml$/,
    );

    const captured = fake.objects.get(archived.objectKey);
    expect(captured).toBeDefined();
    expect([...captured!.bytes]).toEqual([...raw]);
    expect(captured!.options).toEqual({
      httpMetadata: { contentType: "message/rfc822" },
      customMetadata: { sha256: archived.sha256 },
    });
    expect(fake.put).toHaveBeenCalledOnce();
  });

  it("reads and deletes archived objects, with absent bindings as a no-op", async () => {
    const fake = fakeBucket();
    const raw = new TextEncoder().encode("raw message bytes");
    const archived = await archiveRawMessage(
      fake.bucket,
      "77e3a9af-aa65-4ed1-b167-627e381c9b39",
      ownedBuffer(raw),
      "2026-08-09T00:00:00.000Z",
    );

    const stored = await readArchivedMessage(fake.bucket, archived.objectKey);
    expect(stored).not.toBeNull();
    expect([...new Uint8Array(await stored!.arrayBuffer())]).toEqual([...raw]);

    await deleteArchivedMessage(undefined, archived.objectKey);
    await deleteArchivedMessage(fake.bucket, undefined);
    expect(fake.deleted).toEqual([]);

    await deleteArchivedMessage(fake.bucket, archived.objectKey);
    expect(fake.deleted).toEqual([archived.objectKey]);
    await expect(
      readArchivedMessage(fake.bucket, archived.objectKey),
    ).resolves.toBeNull();
  });

  it("fails closed when retained bytes do not match the pinned digest", async () => {
    const fake = fakeBucket();
    const raw = new TextEncoder().encode("expected raw message");
    const archived = await archiveRawMessage(
      fake.bucket,
      "5fba2c18-5d6b-4aa3-9862-85f99ce9dc3e",
      ownedBuffer(raw),
      "2026-08-09T00:00:00.000Z",
    );
    const stored = await readArchivedMessage(fake.bucket, archived.objectKey);
    await expect(
      verifiedArchivedArrayBuffer(stored!, "0".repeat(64)),
    ).rejects.toThrow(/integrity/i);
    await expect(
      verifiedArchivedArrayBuffer(stored!, archived.sha256),
    ).resolves.toBeInstanceOf(ArrayBuffer);
  });

  it("releases an EmailMessage instance through the send binding", async () => {
    const expectedResult = { messageId: "released-message" } as EmailSendResult;
    const send = vi.fn(async (_message: EmailMessage) => expectedResult);
    const binding = { send } as unknown as SendEmail;
    const raw = "From: quarantine@example.com\r\n\r\nReleased";

    await expect(
      releaseArchivedMessage(
        binding,
        "release@example.com",
        "tickets@gorelo.example",
        raw,
      ),
    ).resolves.toBe(expectedResult);

    expect(send).toHaveBeenCalledOnce();
    const message = send.mock.calls[0]![0];
    expect(message).toBeInstanceOf(EmailMessage);
    expect(message).toMatchObject({
      from: "release@example.com",
      to: "tickets@gorelo.example",
      raw,
    });
  });

  it("rewrites authenticated delivery headers while preserving provenance and binary body bytes", async () => {
    const body = new Uint8Array([0, 255, 13, 10, 65]);
    const headers = new TextEncoder().encode(
      "From: Original Sender <sender@outside.example>\r\n" +
        "To: alerts@example.net\r\n" +
        "Subject: Original subject\r\n" +
        "Received: by old-mta.example\r\n" +
        "Content-Type: application/octet-stream\r\n\r\n",
    );
    const raw = new Uint8Array(headers.length + body.length);
    raw.set(headers);
    raw.set(body, headers.length);

    const stream = prepareReleasedMessage(ownedBuffer(raw), {
      from: "release@router.example",
      to: "tickets@gorelo.example",
      originalEnvelopeFrom: "sender@outside.example",
      originalEnvelopeTo: "support@alerts.example.net",
      releaseId: "release-123",
    });
    const rewritten = new Uint8Array(await new Response(stream).arrayBuffer());
    const boundary = rewritten.findIndex(
      (_value, index) =>
        rewritten[index] === 13 &&
        rewritten[index + 1] === 10 &&
        rewritten[index + 2] === 13 &&
        rewritten[index + 3] === 10,
    );
    expect(boundary).toBeGreaterThan(0);
    const rewrittenHeaders = new TextDecoder().decode(
      rewritten.subarray(0, boundary),
    );
    expect(rewrittenHeaders).toContain(
      "From: Gorelo Router <release@router.example>",
    );
    expect(rewrittenHeaders).toContain("To: tickets@gorelo.example");
    expect(rewrittenHeaders).toContain("Reply-To: sender@outside.example");
    expect(rewrittenHeaders).toContain(
      "X-Mail-Parser-Original-From: Original Sender <sender@outside.example>",
    );
    expect(rewrittenHeaders).toContain(
      "X-Mail-Parser-Original-To: alerts@example.net",
    );
    expect(rewrittenHeaders).not.toContain("Received: by old-mta.example");
    expect([...rewritten.subarray(boundary + 4)]).toEqual([...body]);
  });
});
