import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  createClientAlias,
  importGoreloClients,
} from "../src/client-directory";
import {
  prepareGoreloAction,
  type GoreloActionCatalogLoader,
} from "../src/gorelo-action";
import type {
  GoreloCatalogKind,
  GoreloCatalogSnapshot,
} from "../src/gorelo-integration";
import type { GoreloRuleAction } from "../src/types";
import { ruleInputSchema } from "../src/validation";
import { email } from "./helpers";

class TestStatement {
  private bindings: unknown[] = [];

  constructor(private readonly statement: StatementSync) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.bindings = values;
    return this as unknown as D1PreparedStatement;
  }

  result(): D1Result {
    const result = this.statement.run(...(this.bindings as never[]));
    return {
      success: true,
      results: [],
      meta: { changes: Number(result.changes) },
    } as unknown as D1Result;
  }

  async run<T>(): Promise<D1Result<T>> {
    return this.result() as D1Result<T>;
  }

  async all<T>(): Promise<D1Result<T>> {
    return {
      success: true,
      results: this.statement.all(...(this.bindings as never[])) as T[],
      meta: { changes: 0 },
    } as unknown as D1Result<T>;
  }

  async first<T>(column?: string): Promise<T | null> {
    const row = this.statement.get(...(this.bindings as never[])) as
      Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }
}

class TestDatabase {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    this.sqlite.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
    this.sqlite.exec(
      readFileSync("migrations/0002_mailboxes_and_parser_samples.sql", "utf8"),
    );
    this.sqlite.exec(
      readFileSync("migrations/0003_parser_captures.sql", "utf8"),
    );
    this.sqlite.exec(
      readFileSync("migrations/0004_inbound_webhooks.sql", "utf8"),
    );
  }

  prepare(query: string): D1PreparedStatement {
    return new TestStatement(
      this.sqlite.prepare(query),
    ) as unknown as D1PreparedStatement;
  }

  async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) =>
        (statement as unknown as TestStatement).result(),
      );
      this.sqlite.exec("COMMIT");
      return results as D1Result<T>[];
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.sqlite.close();
  }
}

const databases: TestDatabase[] = [];

function database(): D1Database {
  const db = new TestDatabase();
  databases.push(db);
  return db as unknown as D1Database;
}

afterEach(() => {
  while (databases.length > 0) databases.pop()!.close();
});

async function seedClient(db: D1Database): Promise<void> {
  await importGoreloClients(
    db,
    [
      {
        id: 42,
        name: "Acme Pty Ltd",
        billingName: "Acme",
        alternateName: null,
        status: "Active",
        isDefault: false,
        domains: ["acme.example"],
      },
    ],
    { syncedAt: new Date("2026-08-09T00:00:00.000Z") },
  );
}

function action(value: Record<string, unknown>): GoreloRuleAction {
  const parsed = ruleInputSchema.parse({
    name: "Mapped action",
    conditions: [{ field: "to", operator: "contains", value: "@" }],
    action: value,
  });
  if (
    parsed.action.type !== "create_ticket" &&
    parsed.action.type !== "create_alert"
  ) {
    throw new Error("Expected a Gorelo action");
  }
  return parsed.action;
}

function catalog(
  kind: GoreloCatalogKind,
  items: readonly unknown[],
  clientId?: number,
): GoreloCatalogSnapshot {
  return {
    kind,
    items,
    totalCount: items.length,
    fetchedAt: "2026-08-10T00:00:00.000Z",
    expiresAt: "2099-08-10T00:00:00.000Z",
    cached: true,
    ...(clientId === undefined ? {} : { clientId }),
  };
}

function catalogLoader(
  catalogs: Partial<Record<GoreloCatalogKind, GoreloCatalogSnapshot>>,
): GoreloActionCatalogLoader {
  return async (kind, options) => {
    const value = catalogs[kind];
    if (!value) throw new Error(`Catalog ${kind} is unavailable`);
    if (
      options?.clientId !== undefined &&
      value.clientId !== options.clientId
    ) {
      throw new Error(`Catalog ${kind} has the wrong client scope`);
    }
    return value;
  };
}

function resolverTicket(
  overrides: Record<string, unknown> = {},
): GoreloRuleAction {
  return action({
    type: "create_ticket",
    fields: [
      { key: "summary", source: "subject" },
      { key: "contact", source: "literal", value: "night shift" },
      { key: "technician", source: "literal", value: "TECH@EXAMPLE.COM" },
      { key: "device", source: "literal", value: "HOST-01" },
    ],
    clientId: 42,
    titleTemplate: "{{summary}}",
    statusId: 10,
    groupId: 20,
    typeId: 30,
    contactResolver: { field: "contact", matchBy: "alias" },
    leadAssigneeResolver: { field: "technician", matchBy: "email" },
    agentAssetResolver: { field: "device", matchBy: "name" },
    ...overrides,
  });
}

function completeResolverCatalogs(
  overrides: Partial<Record<GoreloCatalogKind, GoreloCatalogSnapshot>> = {},
): Partial<Record<GoreloCatalogKind, GoreloCatalogSnapshot>> {
  const assetId = "ce7cb8a4-29d5-4b60-adba-fab15873446c";
  return {
    contacts: catalog(
      "contacts",
      [
        {
          id: 101,
          name: "Ada Lovelace",
          firstName: "Ada",
          lastName: "Lovelace",
          primaryEmail: "ada@example.com",
          alias: "Night Shift",
          clientId: 42,
          locationId: 5,
          status: "Active",
        },
      ],
      42,
    ),
    users: catalog("users", [
      {
        id: 202,
        name: "Grace Hopper",
        email: "tech@example.com",
        status: "Active",
      },
    ]),
    "agent-assets": catalog("agent-assets", [
      {
        id: assetId,
        name: "Friendly server",
        displayName: "Friendly server",
        deviceName: "host-01",
        clientId: 42,
        locationId: 5,
        serialNumber: "SER-001",
        status: "Online",
      },
    ]),
    locations: catalog(
      "locations",
      [{ id: 5, name: "HQ", clientId: 42, isDefault: true }],
      42,
    ),
    ...overrides,
  };
}

describe("Gorelo action preparation", () => {
  it("resolves one of multiple scoped aliases and renders a ticket request", async () => {
    const db = database();
    await seedClient(db);
    await createClientAlias(db, {
      clientId: 42,
      alias: "ACME-NOC",
      scope: "vendor-a",
    });
    await createClientAlias(db, {
      clientId: 42,
      alias: "Acme Legacy",
      scope: "vendor-a",
    });

    const result = await prepareGoreloAction(
      db,
      email({
        subject: "Disk full",
        bodyText: "Customer: ACME-NOC\nDevice: srv-01\nUsage: 97%",
      }),
      action({
        type: "create_ticket",
        fields: [
          { key: "summary", source: "subject" },
          {
            key: "customer",
            source: "body_text",
            startAfter: "Customer: ",
            endBefore: "\n",
            required: true,
          },
          {
            key: "device",
            source: "body_text",
            startAfter: "Device: ",
            endBefore: "\n",
          },
        ],
        clientIdentityField: "customer",
        clientAliasScope: "vendor-a",
        titleTemplate: "{{summary}} on {{device}}",
        descriptionTemplate: "Parsed for {{customer}}",
        statusId: 10,
        groupId: 20,
        typeId: 30,
      }),
    );

    expect(result).toMatchObject({
      actionType: "create_ticket",
      data: {
        goreloClient: {
          id: 42,
          name: "Acme Pty Ltd",
          matchedBy: "scoped_alias",
        },
      },
      request: {
        Title: "Disk full on srv-01",
        ClientId: 42,
        Description: "Parsed for ACME-NOC",
        StatusId: 10,
        GroupId: 20,
        TypeId: 30,
        SendTicketCreatedEmail: false,
        IsUnread: true,
      },
    });
  });

  it("uses a current fixed client for alert mappings", async () => {
    const db = database();
    await seedClient(db);
    await expect(
      prepareGoreloAction(
        db,
        email({ subject: "Offline" }),
        action({
          type: "create_alert",
          fields: [
            { key: "name", source: "subject" },
            { key: "resource", source: "literal", value: "srv-01" },
          ],
          clientId: 42,
          nameTemplate: "{{name}}",
          resourceTemplate: "{{resource}}",
          severity: 1,
        }),
      ),
    ).resolves.toMatchObject({
      request: {
        Name: "Offline",
        ClientId: 42,
        Resource: "srv-01",
        Severity: 1,
      },
    });
  });

  it("fails closed when extraction or client resolution is unavailable", async () => {
    const db = database();
    await seedClient(db);
    const base = {
      type: "create_alert",
      fields: [
        {
          key: "customer",
          source: "body_text",
          startAfter: "Customer: ",
          required: true,
        },
        { key: "name", source: "subject" },
      ],
      clientIdentityField: "customer",
      nameTemplate: "{{name}}",
      resourceTemplate: "mail",
    };

    await expect(
      prepareGoreloAction(db, email({ bodyText: "No marker" }), action(base)),
    ).resolves.toMatchObject({ preflightError: "extraction_failed" });
    await expect(
      prepareGoreloAction(
        db,
        email({ bodyText: "Customer: Unknown" }),
        action(base),
      ),
    ).resolves.toMatchObject({ preflightError: "client_resolution_failed" });
  });

  it("resolves contacts, technicians, and devices exactly and derives one location", async () => {
    const db = database();
    await seedClient(db);
    const result = await prepareGoreloAction(
      db,
      email({ subject: "Device offline" }),
      resolverTicket(),
      { loadCatalog: catalogLoader(completeResolverCatalogs()) },
    );

    expect(result).toMatchObject({
      request: {
        ClientId: 42,
        ContactId: 101,
        LeadAssigneeId: 202,
        AgentAssetIds: ["ce7cb8a4-29d5-4b60-adba-fab15873446c"],
        LocationId: 5,
      },
      data: {
        entityResolutions: {
          contact: {
            status: "resolved",
            id: 101,
            name: "Ada Lovelace",
            matchedBy: "alias",
          },
          leadAssignee: {
            status: "resolved",
            id: 202,
            name: "Grace Hopper",
            matchedBy: "email",
          },
          agentAsset: {
            status: "resolved",
            id: "ce7cb8a4-29d5-4b60-adba-fab15873446c",
            name: "Friendly server",
            matchedBy: "name",
          },
          location: { status: "derived", id: 5, source: "entities" },
        },
      },
    });
    expect(result.preflightError).toBeUndefined();
  });

  it("supports resolver associations after dynamically resolving the client", async () => {
    const db = database();
    await seedClient(db);
    const catalogs = completeResolverCatalogs();
    const catalogRequests: Array<{
      kind: GoreloCatalogKind;
      clientId?: number;
    }> = [];
    const baseLoader = catalogLoader(catalogs);
    const loadCatalog: GoreloActionCatalogLoader = async (kind, options) => {
      catalogRequests.push({
        kind,
        ...(options?.clientId === undefined
          ? {}
          : { clientId: options.clientId }),
      });
      return baseLoader(kind, options);
    };
    const result = await prepareGoreloAction(
      db,
      email({ subject: "Device offline" }),
      resolverTicket({
        clientId: undefined,
        fields: [
          { key: "summary", source: "subject" },
          { key: "customer", source: "literal", value: "Acme Pty Ltd" },
          { key: "contact", source: "literal", value: "ADA@EXAMPLE.COM" },
          {
            key: "technician",
            source: "literal",
            value: "Grace Hopper",
          },
          {
            key: "device",
            source: "literal",
            value: "ce7cb8a4-29d5-4b60-adba-fab15873446c",
          },
        ],
        clientIdentityField: "customer",
        contactResolver: { field: "contact", matchBy: "email" },
        leadAssigneeResolver: { field: "technician", matchBy: "name" },
        agentAssetResolver: { field: "device", matchBy: "id" },
      }),
      { loadCatalog },
    );

    expect(result).toMatchObject({
      request: {
        ClientId: 42,
        ContactId: 101,
        LeadAssigneeId: 202,
        AgentAssetIds: ["ce7cb8a4-29d5-4b60-adba-fab15873446c"],
      },
    });
    expect(catalogRequests).toContainEqual({ kind: "contacts", clientId: 42 });
    expect(catalogRequests).not.toContainEqual({ kind: "contacts" });
  });

  it("deduplicates repeated catalog rows with the same Gorelo ID", async () => {
    const db = database();
    await seedClient(db);
    const catalogs = completeResolverCatalogs();
    const contact = catalogs.contacts!.items[0]!;
    catalogs.contacts = catalog("contacts", [contact, contact], 42);

    const result = await prepareGoreloAction(
      db,
      email({ subject: "Device offline" }),
      resolverTicket({
        leadAssigneeResolver: undefined,
        agentAssetResolver: undefined,
      }),
      { loadCatalog: catalogLoader(catalogs) },
    );

    expect(result).toMatchObject({
      request: { ContactId: 101 },
      data: { entityResolutions: { contact: { status: "resolved", id: 101 } } },
    });
  });

  it("fails closed on ambiguous and cross-client matches without repeating the identity in resolution metadata", async () => {
    const db = database();
    await seedClient(db);
    const baseContact = completeResolverCatalogs().contacts!.items[0] as Record<
      string,
      unknown
    >;
    const ambiguousCatalogs = completeResolverCatalogs({
      contacts: catalog(
        "contacts",
        [baseContact, { ...baseContact, id: 102 }],
        42,
      ),
    });
    const ambiguous = await prepareGoreloAction(
      db,
      email(),
      resolverTicket({
        leadAssigneeResolver: undefined,
        agentAssetResolver: undefined,
      }),
      { loadCatalog: catalogLoader(ambiguousCatalogs) },
    );
    expect(ambiguous).toMatchObject({
      preflightError: "entity_resolution_failed",
      data: {
        entityResolutions: {
          contact: { status: "ambiguous", matchedBy: "alias" },
        },
      },
    });
    expect(JSON.stringify(ambiguous.data.entityResolutions)).not.toContain(
      "night shift",
    );

    const crossClient = await prepareGoreloAction(
      db,
      email(),
      resolverTicket({
        leadAssigneeResolver: undefined,
        agentAssetResolver: undefined,
      }),
      {
        loadCatalog: catalogLoader(
          completeResolverCatalogs({
            contacts: catalog(
              "contacts",
              [{ ...baseContact, clientId: 99 }],
              42,
            ),
          }),
        ),
      },
    );
    expect(crossClient).toMatchObject({
      preflightError: "entity_resolution_failed",
      data: { entityResolutions: { contact: { status: "invalid" } } },
    });
  });

  it("distinguishes missing, invalid, and unavailable resolver inputs", async () => {
    const db = database();
    await seedClient(db);
    const missing = await prepareGoreloAction(
      db,
      email(),
      resolverTicket({
        fields: [
          { key: "summary", source: "subject" },
          { key: "contact", source: "literal", value: "unknown" },
        ],
        leadAssigneeResolver: undefined,
        agentAssetResolver: undefined,
      }),
      { loadCatalog: catalogLoader(completeResolverCatalogs()) },
    );
    expect(missing).toMatchObject({
      preflightError: "entity_resolution_failed",
      data: { entityResolutions: { contact: { status: "not_found" } } },
    });

    const invalid = await prepareGoreloAction(
      db,
      email(),
      resolverTicket({
        fields: [
          { key: "summary", source: "subject" },
          { key: "contact", source: "literal", value: "000101" },
        ],
        contactResolver: { field: "contact", matchBy: "id" },
        leadAssigneeResolver: undefined,
        agentAssetResolver: undefined,
      }),
      { loadCatalog: catalogLoader(completeResolverCatalogs()) },
    );
    expect(invalid).toMatchObject({
      preflightError: "entity_resolution_failed",
      data: { entityResolutions: { contact: { status: "invalid" } } },
    });

    const unavailable = await prepareGoreloAction(
      db,
      email(),
      resolverTicket({
        leadAssigneeResolver: undefined,
        agentAssetResolver: undefined,
      }),
      { loadCatalog: catalogLoader({}) },
    );
    expect(unavailable).toMatchObject({
      preflightError: "entity_resolution_failed",
      data: {
        entityResolutions: { contact: { status: "catalog_unavailable" } },
      },
    });

    const currentContact = completeResolverCatalogs().contacts!;
    const expired = await prepareGoreloAction(
      db,
      email(),
      resolverTicket({
        leadAssigneeResolver: undefined,
        agentAssetResolver: undefined,
      }),
      {
        loadCatalog: catalogLoader(
          completeResolverCatalogs({
            contacts: {
              ...currentContact,
              expiresAt: "2026-08-10T01:00:00.000Z",
            },
          }),
        ),
      },
    );
    expect(expired).toMatchObject({
      preflightError: "entity_resolution_failed",
      data: {
        entityResolutions: { contact: { status: "catalog_unavailable" } },
      },
    });

    const incomplete = await prepareGoreloAction(
      db,
      email(),
      resolverTicket({
        leadAssigneeResolver: undefined,
        agentAssetResolver: undefined,
      }),
      {
        loadCatalog: catalogLoader(
          completeResolverCatalogs({
            contacts: { ...currentContact, totalCount: 2 },
          }),
        ),
      },
    );
    expect(incomplete).toMatchObject({
      preflightError: "entity_resolution_failed",
      data: {
        entityResolutions: { contact: { status: "catalog_unavailable" } },
      },
    });
  });

  it("fails closed when resolved locations conflict or are stale", async () => {
    const db = database();
    await seedClient(db);
    const asset = completeResolverCatalogs()["agent-assets"]!
      .items[0] as Record<string, unknown>;
    const conflict = await prepareGoreloAction(
      db,
      email(),
      resolverTicket({ leadAssigneeResolver: undefined }),
      {
        loadCatalog: catalogLoader(
          completeResolverCatalogs({
            "agent-assets": catalog("agent-assets", [
              { ...asset, locationId: 6 },
            ]),
          }),
        ),
      },
    );
    expect(conflict).toMatchObject({
      preflightError: "entity_resolution_failed",
      data: {
        entityResolutions: {
          location: {
            status: "conflict",
            matchedBy: "entity_locations",
          },
        },
      },
    });

    const stale = await prepareGoreloAction(
      db,
      email(),
      resolverTicket({
        leadAssigneeResolver: undefined,
        agentAssetResolver: undefined,
      }),
      {
        loadCatalog: catalogLoader(
          completeResolverCatalogs({ locations: catalog("locations", [], 42) }),
        ),
      },
    );
    expect(stale).toMatchObject({
      preflightError: "entity_resolution_failed",
      data: {
        entityResolutions: {
          location: {
            status: "not_found",
            matchedBy: "entity_locations",
          },
        },
      },
    });

    const wrongLocationScope = await prepareGoreloAction(
      db,
      email(),
      resolverTicket({
        leadAssigneeResolver: undefined,
        agentAssetResolver: undefined,
      }),
      {
        loadCatalog: async (kind) => {
          const snapshot = completeResolverCatalogs()[kind];
          if (!snapshot) throw new Error(`Catalog ${kind} is unavailable`);
          return kind === "locations"
            ? { ...snapshot, clientId: 99 }
            : snapshot;
        },
      },
    );
    expect(wrongLocationScope).toMatchObject({
      preflightError: "entity_resolution_failed",
      data: {
        entityResolutions: {
          location: {
            status: "catalog_unavailable",
            matchedBy: "entity_locations",
          },
        },
      },
    });
  });

  it("rejects a dynamic entity location that conflicts with a fixed location", async () => {
    const db = database();
    await seedClient(db);
    const result = await prepareGoreloAction(
      db,
      email(),
      resolverTicket({
        locationId: 7,
        leadAssigneeResolver: undefined,
        agentAssetResolver: undefined,
      }),
      { loadCatalog: catalogLoader(completeResolverCatalogs()) },
    );
    expect(result).toMatchObject({
      preflightError: "entity_resolution_failed",
      data: { entityResolutions: { location: { status: "conflict" } } },
    });
  });
});
