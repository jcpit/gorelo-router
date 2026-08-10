import { describe, expect, it, vi } from "vitest";
import {
  createGoreloClient,
  GoreloClientError,
  normalizeGoreloBaseUrl,
  type GoreloFetch,
} from "../src/gorelo";

const API_KEY = "test-gorelo-key-that-must-stay-secret";
const UUID = "ce7cb8a4-29d5-4b60-adba-fab15873446c";
const CANONICAL_GUID = "01234567-89ab-0cde-0123-456789abcdef";

function page(data: unknown[] = []): Record<string, unknown> {
  return {
    data,
    totalCount: data.length,
    nextCursor: null,
    previousCursor: null,
    hasMore: false,
    hasPrevious: false,
  };
}

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

function client(fetchImplementation: GoreloFetch, maxResponseBytes?: number) {
  return createGoreloClient({
    baseUrl: "https://api.aue.gorelo.io/",
    apiKey: API_KEY,
    fetch: fetchImplementation,
    ...(maxResponseBytes === undefined ? {} : { maxResponseBytes }),
  });
}

describe("Gorelo base URL security", () => {
  it("accepts only the two exact regional API origins and removes one trailing slash", () => {
    expect(normalizeGoreloBaseUrl("https://api.aue.gorelo.io/")).toBe(
      "https://api.aue.gorelo.io",
    );
    expect(normalizeGoreloBaseUrl("https://api.usw.gorelo.io")).toBe(
      "https://api.usw.gorelo.io",
    );
  });

  it.each([
    "http://api.aue.gorelo.io",
    "https://api.aue.gorelo.io.evil.example",
    "https://user:pass@api.aue.gorelo.io",
    "https://api.aue.gorelo.io:443",
    "https://api.aue.gorelo.io/v1",
    "https://api.aue.gorelo.io//",
    "https://api.aue.gorelo.io?redirect=evil",
    "https://api.aue.gorelo.io/#fragment",
    " https://api.aue.gorelo.io",
    "https://API.AUE.GORELO.IO",
  ])("rejects unsafe base URL %s", (baseUrl) => {
    expect(() => createGoreloClient({ baseUrl, apiKey: API_KEY })).toThrowError(
      expect.objectContaining({ code: "invalid_configuration" }),
    );
  });

  it("rejects malformed secrets without reflecting them in the error", () => {
    const malformedKey = "secret-value\nshould-not-leak";
    let thrown: unknown;
    try {
      createGoreloClient({
        baseUrl: "https://api.aue.gorelo.io",
        apiKey: malformedKey,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(GoreloClientError);
    expect(String(thrown)).not.toContain(malformedKey);
    expect(String(thrown)).not.toContain("should-not-leak");
  });

  it.each(["secret with spaces", "secret-with-unicode-–"])(
    "rejects a non-header-safe API key without reflecting it: %s",
    (unsafeKey) => {
      let thrown: unknown;
      try {
        createGoreloClient({
          baseUrl: "https://api.aue.gorelo.io",
          apiKey: unsafeKey,
        });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({ code: "invalid_configuration" });
      expect(String(thrown)).not.toContain(unsafeKey);
    },
  );
});

describe("Gorelo requests", () => {
  it("verifies the connection with a read-only one-client request", async () => {
    const fetchMock = vi.fn<GoreloFetch>(async () => json(page()));
    const gorelo = client(fetchMock);

    await expect(gorelo.verifyConnection()).resolves.toEqual({
      ok: true,
      baseUrl: "https://api.aue.gorelo.io",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [input, init] = fetchMock.mock.calls[0]!;
    expect(String(input)).toBe(
      "https://api.aue.gorelo.io/v1/clients?pageSize=1",
    );
    expect(init).toMatchObject({ method: "GET", redirect: "manual" });
    const headers = new Headers(init?.headers);
    expect(headers.get("x-api-key")).toBe(API_KEY);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("accept")).toBe("application/json");
  });

  it("encodes pagination and returns a bounded, normalized client page", async () => {
    const fetchMock = vi.fn<GoreloFetch>(async () =>
      json({
        ...page([
          {
            id: 42,
            name: "Acme",
            billingName: "Acme Billing",
            alternateName: null,
            status: { id: 9, name: "Active" },
            isDefault: true,
            domains: [{ id: 1, name: "ACME.EXAMPLE" }],
            serverOnlyField: "discard me",
          },
        ]),
        nextCursor: "next",
        hasMore: true,
      }),
    );

    const result = await client(fetchMock).listClients({
      cursor: "a+b/c=",
      pageSize: 25,
    });

    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://api.aue.gorelo.io/v1/clients?cursor=a%2Bb%2Fc%3D&pageSize=25",
    );
    expect(result).toEqual({
      data: [
        {
          id: 42,
          name: "Acme",
          billingName: "Acme Billing",
          alternateName: null,
          status: "Active",
          isDefault: true,
          domains: ["acme.example"],
        },
      ],
      totalCount: 1,
      nextCursor: "next",
      previousCursor: null,
      hasMore: true,
      hasPrevious: false,
    });
    expect(result.data[0]).not.toHaveProperty("serverOnlyField");
  });

  it("scopes contact lookup to a validated client ID", async () => {
    const fetchMock = vi.fn<GoreloFetch>(async () =>
      json(
        page([
          {
            id: 3,
            firstName: "Ada",
            lastName: "Lovelace",
            primaryEmail: "ADA@EXAMPLE.COM",
            clientId: 42,
            clientLocationId: 5,
            status: { name: "Active" },
          },
        ]),
      ),
    );

    await expect(
      client(fetchMock).listContacts({ clientId: 42, pageSize: 50 }),
    ).resolves.toMatchObject({
      data: [
        {
          id: 3,
          name: "Ada Lovelace",
          primaryEmail: "ada@example.com",
          clientId: 42,
          locationId: 5,
        },
      ],
    });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://api.aue.gorelo.io/v1/contacts?pageSize=50&clientId=42",
    );
  });

  it("calls every setup catalog through its explicit GET endpoint", async () => {
    const requests: string[] = [];
    const fetchMock: GoreloFetch = async (input) => {
      const url = new URL(String(input));
      requests.push(`${url.pathname}${url.search}`);
      switch (url.pathname) {
        case "/v1/clients/42/locations":
          return json([{ id: 5, name: "HQ", clientId: 42, isDefault: true }]);
        case "/v1/assets/agents":
          return json(
            page([
              {
                id: UUID,
                name: "host-01",
                displayName: "Server 01",
                clientId: 42,
                clientLocationId: 5,
                serialNo: "SER123",
                status: { name: "Online" },
              },
            ]),
          );
        case "/v1/organization/users":
          return json(
            page([
              {
                id: 8,
                firstName: "Grace",
                lastName: "Hopper",
                email: "GRACE@EXAMPLE.COM",
                status: { name: "Active" },
              },
            ]),
          );
        case "/v1/organization/groups":
          return json([{ id: 9, name: "Service Desk", alias: "support" }]);
        case "/v1/tickets/statuses":
          return json([
            {
              id: 10,
              name: "New",
              baseStatusId: 1,
              sortOrder: 0,
            },
          ]);
        case "/v1/tickets/tags":
          return json([{ id: 11, name: "Monitoring" }]);
        case "/v1/tickets/types":
          return json([{ id: 12, name: "Incident" }]);
        default:
          throw new Error(`Unexpected test endpoint ${url.pathname}`);
      }
    };
    const gorelo = client(fetchMock);

    await expect(gorelo.listLocations(42)).resolves.toEqual([
      { id: 5, name: "HQ", clientId: 42, isDefault: true },
    ]);
    await expect(gorelo.listAgentAssets()).resolves.toMatchObject({
      data: [
        {
          id: UUID,
          name: "Server 01",
          displayName: "Server 01",
          clientId: 42,
          locationId: 5,
          serialNumber: "SER123",
          status: "Online",
        },
      ],
    });
    await expect(gorelo.listUsers()).resolves.toMatchObject({
      data: [
        {
          id: 8,
          name: "Grace Hopper",
          email: "grace@example.com",
          status: "Active",
        },
      ],
    });
    await expect(gorelo.listGroups()).resolves.toEqual([
      { id: 9, name: "Service Desk", alias: "support" },
    ]);
    await expect(gorelo.listTicketStatuses()).resolves.toEqual([
      { id: 10, name: "New", baseStatusId: 1, sortOrder: 0 },
    ]);
    await expect(gorelo.listTicketTags()).resolves.toEqual([
      { id: 11, name: "Monitoring" },
    ]);
    await expect(gorelo.listTicketTypes()).resolves.toEqual([
      { id: 12, name: "Incident" },
    ]);

    expect(requests).toEqual([
      "/v1/clients/42/locations",
      "/v1/assets/agents",
      "/v1/organization/users",
      "/v1/organization/groups",
      "/v1/tickets/statuses",
      "/v1/tickets/tags",
      "/v1/tickets/types",
    ]);
  });

  it("accepts the official PascalCase catalog response envelope", async () => {
    const fetchMock = vi.fn<GoreloFetch>(async () =>
      json({
        StatusCode: 200,
        IsSuccess: true,
        Data: [{ Id: 42, Name: "Acme", Domains: [{ Name: "ACME.EXAMPLE" }] }],
        DataContext: {
          Pagination: {
            TotalCount: 1,
            NextCursor: null,
            PreviousCursor: null,
            HasMore: false,
            HasPrevious: false,
          },
        },
        Notifications: [],
      }),
    );

    await expect(client(fetchMock).listClients()).resolves.toMatchObject({
      data: [{ id: 42, name: "Acme", domains: ["acme.example"] }],
      totalCount: 1,
      hasMore: false,
    });
  });

  it("accepts Gorelo's canonical Guid and normalizes an unassigned agent client", async () => {
    const fetchMock = vi.fn<GoreloFetch>(async () =>
      json({
        StatusCode: 200,
        IsSuccess: true,
        Data: [
          {
            Id: CANONICAL_GUID,
            Name: "host-01",
            DisplayName: "Server 01",
            ClientId: 0,
            ClientLocationId: null,
            SerialNo: "SER123",
            Status: { Id: 1, Name: "Online" },
          },
        ],
        DataContext: {
          Pagination: {
            TotalCount: 1,
            NextCursor: null,
            PreviousCursor: null,
            HasMore: false,
            HasPrevious: false,
          },
        },
        Notifications: [],
      }),
    );

    await expect(client(fetchMock).listAgentAssets()).resolves.toEqual({
      data: [
        {
          id: CANONICAL_GUID,
          name: "Server 01",
          displayName: "Server 01",
          clientId: null,
          locationId: null,
          serialNumber: "SER123",
          status: "Online",
        },
      ],
      totalCount: 1,
      nextCursor: null,
      previousCursor: null,
      hasMore: false,
      hasPrevious: false,
    });
  });

  it("creates tickets with the exact official body and returns the provider ID", async () => {
    const fetchMock = vi.fn<GoreloFetch>(async () =>
      json({
        StatusCode: 200,
        IsSuccess: true,
        Data: { Id: UUID },
        DataContext: { TraceId: "trace-123" },
        Notifications: [],
      }),
    );
    const request = {
      Title: "Disk full",
      ClientId: 42,
      StatusId: 10,
      GroupId: 9,
      TypeId: 12,
      AgentAssetIds: [UUID],
      SendTicketCreatedEmail: false,
      IsUnread: true,
    };

    await expect(client(fetchMock).createTicket(request)).resolves.toEqual({
      id: UUID,
      traceId: "trace-123",
    });
    const [input, init] = fetchMock.mock.calls[0]!;
    expect(String(input)).toBe("https://api.aue.gorelo.io/v1/tickets");
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify(request),
      redirect: "manual",
    });
    const headers = new Headers(init?.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-api-key")).toBe(API_KEY);
  });

  it("accepts canonical Gorelo Guid asset and ticket identifiers", async () => {
    const fetchMock = vi.fn<GoreloFetch>(async () =>
      json({
        StatusCode: 200,
        IsSuccess: true,
        Data: { Id: CANONICAL_GUID },
        Notifications: [],
      }),
    );
    const request = {
      Title: "Agent offline",
      StatusId: 10,
      GroupId: 9,
      TypeId: 12,
      AgentAssetIds: [CANONICAL_GUID],
    };

    await expect(client(fetchMock).createTicket(request)).resolves.toEqual({
      id: CANONICAL_GUID,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      method: "POST",
      body: JSON.stringify(request),
    });
  });

  it("creates alerts through the documented trailing-slash endpoint", async () => {
    const fetchMock = vi.fn<GoreloFetch>(async () =>
      json({ StatusCode: 200, IsSuccess: true, Data: true, Notifications: [] }),
    );
    const request = {
      Name: "Disk usage",
      ClientId: 42,
      Resource: "srv-01",
      Severity: 1 as const,
    };

    await expect(client(fetchMock).createAlert(request)).resolves.toEqual({
      created: true,
    });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://api.aue.gorelo.io/v1/alerts/",
    );
  });

  it("rejects malformed create requests before sending", async () => {
    const fetchMock = vi.fn<GoreloFetch>();
    await expect(
      client(fetchMock).createTicket({
        Title: "",
        StatusId: 1,
        GroupId: 2,
        TypeId: 3,
      }),
    ).rejects.toMatchObject({ code: "invalid_configuration" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    () => client(async () => json(page())).listClients({ pageSize: 201 }),
    () => client(async () => json(page())).listClients({ cursor: "" }),
    () => client(async () => json([])).listLocations(0),
    () => client(async () => json(page())).listContacts({ clientId: -1 }),
  ])("rejects invalid selectors before making a request", async (operation) => {
    await expect(operation()).rejects.toMatchObject({
      code: "invalid_configuration",
    });
  });
});

describe("Gorelo response safety", () => {
  it("rejects an invalid paged envelope without exposing its contents", async () => {
    const sensitiveBody = { error: `tenant payload ${API_KEY}` };
    let thrown: unknown;
    try {
      await client(async () => json(sensitiveBody)).listClients();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: "invalid_response" });
    expect(String(thrown)).not.toContain(API_KEY);
    expect(String(thrown)).not.toContain("tenant payload");
  });

  it("rejects malformed JSON with a generic safe error", async () => {
    await expect(
      client(async () => new Response(`not-json-${API_KEY}`)).listGroups(),
    ).rejects.toMatchObject({
      code: "invalid_response",
      message: "Gorelo API returned an invalid response",
    });
  });

  it("does not read or disclose an HTTP error body", async () => {
    const responseBody = `private tenant details ${API_KEY}`;
    let thrown: unknown;
    try {
      await client(async () =>
        json({ responseBody }, { status: 401, statusText: responseBody }),
      ).listGroups();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      code: "http_error",
      status: 401,
      message: "Gorelo API request failed with status 401",
    });
    expect(String(thrown)).not.toContain(responseBody);
    expect(String(thrown)).not.toContain(API_KEY);
  });

  it("blocks redirects without disclosing their Location", async () => {
    const privateLocation = `https://private.example/tenant/${API_KEY}`;
    let thrown: unknown;
    try {
      await client(async (_input, init) => {
        expect(init?.redirect).toBe("manual");
        return new Response(null, {
          status: 307,
          headers: { location: privateLocation },
        });
      }).listGroups();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      code: "redirect_error",
      status: 307,
      message: "Gorelo API returned a redirect that was blocked",
      diagnostic: {
        phase: "response",
        reason: "redirect_rejected",
      },
    });
    expect(String(thrown)).not.toContain(privateLocation);
    expect(String(thrown)).not.toContain(API_KEY);
  });

  it("does not disclose errors thrown by the network implementation", async () => {
    await expect(
      client(async () => {
        throw new Error(`network diagnostics ${API_KEY}`);
      }).listGroups(),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "network_error",
        message: "Gorelo API request could not be completed",
        diagnostic: {
          phase: "request",
          reason: "fetch_failure",
        },
      }),
    );
  });

  it.each([
    ["ENOTFOUND", "dns_failure"],
    ["ERR_TLS_CERT_ALTNAME_INVALID", "tls_failure"],
    ["ECONNRESET", "connection_failure"],
    ["ERR_WORKER_SUBREQUEST_LIMIT", "connection_limit"],
    ["ERR_INVALID_CHAR", "invalid_header"],
  ] as const)(
    "maps allow-listed runtime code %s to the fixed reason %s",
    async (runtimeCode, reason) => {
      const privateDiagnostic = `private-network-${API_KEY}`;
      let thrown: unknown;
      try {
        await client(async () => {
          throw Object.assign(new Error(privateDiagnostic), {
            code: runtimeCode,
          });
        }).listGroups();
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({
        code: "network_error",
        diagnostic: { phase: "request", reason },
      });
      expect(String(thrown)).not.toContain(privateDiagnostic);
      expect(String(thrown)).not.toContain(API_KEY);
    },
  );

  it("rejects a declared oversized body before consuming it", async () => {
    const cancel = vi.fn(async () => undefined);
    const response = {
      ok: true,
      headers: new Headers({ "content-length": "1024" }),
      body: { cancel },
    } as unknown as Response;

    await expect(
      client(async () => response, 128).listGroups(),
    ).rejects.toMatchObject({ code: "response_too_large" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("enforces the response limit while streaming without content-length", async () => {
    const oversized = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(129)));
        controller.close();
      },
    });
    await expect(
      client(async () => new Response(oversized), 128).listGroups(),
    ).rejects.toMatchObject({ code: "response_too_large" });
  });

  it("aborts and returns a redacted timeout error", async () => {
    const fetchImplementation: GoreloFetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error(`aborted ${API_KEY}`)),
        );
      });
    const gorelo = createGoreloClient({
      baseUrl: "https://api.usw.gorelo.io",
      apiKey: API_KEY,
      fetch: fetchImplementation,
      timeoutMs: 50,
    });

    let thrown: unknown;
    try {
      await gorelo.listGroups();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      code: "timeout",
      message: "Gorelo API request timed out",
    });
    expect(String(thrown)).not.toContain(API_KEY);
  });

  it("rejects unsafe integer IDs in otherwise valid records", async () => {
    await expect(
      client(async () =>
        json([{ id: Number.MAX_SAFE_INTEGER + 1, name: "Unsafe" }]),
      ).listTicketTags(),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it.each([
    { description: "a braced Guid", id: `{${CANONICAL_GUID}}`, clientId: 0 },
    {
      description: "a non-hex Guid",
      id: "01234567-89ab-0cde-0123-456789abcdeg",
      clientId: 0,
    },
    {
      description: "a negative client relationship",
      id: CANONICAL_GUID,
      clientId: -1,
    },
  ])(
    "rejects an agent response containing $description",
    async ({ id, clientId }) => {
      await expect(
        client(async () =>
          json(
            page([
              {
                id,
                name: "Unsafe agent",
                clientId,
                clientLocationId: null,
              },
            ]),
          ),
        ).listAgentAssets(),
      ).rejects.toMatchObject({ code: "invalid_response" });
    },
  );
});
