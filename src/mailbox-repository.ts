const BOOTSTRAP_GORELO_MAILBOX_ID = "00000000-0000-4000-8000-000000000001";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_PART_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i;
const DOMAIN_LABEL_PATTERN = /^[A-Z0-9-]+$/i;

export interface GoreloMailbox {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly enabled: boolean;
  readonly isDefault: boolean;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GoreloMailboxSettings {
  readonly defaultMailboxId: string;
  readonly version: number;
  readonly updatedAt: string;
}

export interface RoutableGoreloMailbox extends GoreloMailbox {
  readonly allowlisted: boolean;
  readonly routable: boolean;
}

export interface GoreloMailboxDirectory {
  readonly mailboxes: readonly RoutableGoreloMailbox[];
  readonly byId: ReadonlyMap<string, RoutableGoreloMailbox>;
  readonly defaultMailbox?: RoutableGoreloMailbox;
  readonly settings?: GoreloMailboxSettings;
}

export interface LoadGoreloMailboxDirectoryOptions {
  readonly allowedAddresses: ReadonlySet<string>;
  readonly bootstrapAddress?: string;
  readonly bootstrapName?: string;
}

interface GoreloMailboxRow {
  id: string;
  name: string;
  address: string;
  enabled: number;
  is_default: number;
  version: number;
  created_at: string;
  updated_at: string;
}

interface GoreloMailboxSettingsRow {
  default_mailbox_id: string;
  version: number;
  updated_at: string;
}

export type GoreloMailboxMutationResult =
  | { status: "updated"; mailbox: GoreloMailbox }
  | { status: "not_found" | "conflict" | "default" | "referenced" };

export type GoreloMailboxDeleteResult =
  "deleted" | "not_found" | "conflict" | "default" | "referenced";

export type GoreloMailboxDefaultResult =
  | {
      status: "updated";
      mailbox: GoreloMailbox;
      settings: GoreloMailboxSettings;
    }
  | {
      status: "not_initialized" | "not_found" | "disabled" | "conflict";
    };

export class GoreloMailboxInvariantError extends Error {
  override readonly name = "GoreloMailboxInvariantError";
}

function mailboxId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new TypeError("Gorelo mailbox ID must be a UUID");
  }
  return normalized;
}

function mailboxName(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 120 ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new TypeError(
      "Gorelo mailbox name must be between 1 and 120 characters without control characters",
    );
  }
  return normalized;
}

function isValidEmailAddress(value: string): boolean {
  if (value.length > 254) return false;
  const at = value.lastIndexOf("@");
  if (at <= 0 || value.indexOf("@") !== at) return false;
  const localPart = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (
    localPart.length > 64 ||
    !LOCAL_PART_PATTERN.test(localPart) ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..")
  ) {
    return false;
  }
  const labels = domain.split(".");
  return (
    domain.length <= 253 &&
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        DOMAIN_LABEL_PATTERN.test(label) &&
        !label.startsWith("-") &&
        !label.endsWith("-"),
    )
  );
}

export function normalizeGoreloMailboxAddress(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!isValidEmailAddress(normalized)) {
    throw new TypeError("Gorelo mailbox address must be a valid email address");
  }
  return normalized;
}

function rowToMailbox(row: GoreloMailboxRow): GoreloMailbox {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    enabled: row.enabled === 1,
    isDefault: row.is_default === 1,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSettings(row: GoreloMailboxSettingsRow): GoreloMailboxSettings {
  return {
    defaultMailboxId: row.default_mailbox_id,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

const MAILBOX_SELECT = `SELECT m.id, m.name, m.address, m.enabled,
       CASE WHEN s.default_mailbox_id = m.id THEN 1 ELSE 0 END AS is_default,
       m.version, m.created_at, m.updated_at
  FROM gorelo_mailboxes m
  LEFT JOIN gorelo_mailbox_settings s ON s.id = 1`;

export async function listGoreloMailboxes(
  db: D1Database,
): Promise<GoreloMailbox[]> {
  const result = await db
    .prepare(
      `${MAILBOX_SELECT}
        ORDER BY is_default DESC, m.name COLLATE NOCASE ASC, m.id ASC`,
    )
    .all<GoreloMailboxRow>();
  return result.results.map(rowToMailbox);
}

export async function getGoreloMailbox(
  db: D1Database,
  id: string,
): Promise<GoreloMailbox | null> {
  const row = await db
    .prepare(
      `${MAILBOX_SELECT}
        WHERE m.id = ?
        LIMIT 1`,
    )
    .bind(mailboxId(id))
    .first<GoreloMailboxRow>();
  return row ? rowToMailbox(row) : null;
}

export async function getGoreloMailboxSettings(
  db: D1Database,
): Promise<GoreloMailboxSettings | null> {
  const row = await db
    .prepare(
      `SELECT default_mailbox_id, version, updated_at
         FROM gorelo_mailbox_settings
        WHERE id = 1
        LIMIT 1`,
    )
    .first<GoreloMailboxSettingsRow>();
  return row ? rowToSettings(row) : null;
}

async function initializedDefaultMailbox(
  db: D1Database,
): Promise<GoreloMailbox | null> {
  const settings = await getGoreloMailboxSettings(db);
  if (!settings) return null;
  const existing = await getGoreloMailbox(db, settings.defaultMailboxId);
  if (!existing) {
    throw new GoreloMailboxInvariantError(
      "The Gorelo mailbox settings reference a missing default mailbox",
    );
  }
  return existing;
}

/**
 * Creates the legacy configured address as the initial named default. The
 * reserved UUID makes retries deterministic; once initialized, later config
 * changes never rewrite the persisted mailbox address.
 */
export async function ensureInitialGoreloMailbox(
  db: D1Database,
  address: string,
  name = "Default Gorelo mailbox",
): Promise<GoreloMailbox> {
  const existing = await initializedDefaultMailbox(db);
  if (existing) return existing;

  const count = await db
    .prepare("SELECT COUNT(*) AS count FROM gorelo_mailboxes")
    .first<{ count: number }>();
  if (Number(count?.count ?? 0) !== 0) {
    throw new GoreloMailboxInvariantError(
      "Gorelo mailboxes exist without default mailbox settings",
    );
  }

  const normalizedAddress = normalizeGoreloMailboxAddress(address);
  const normalizedName = mailboxName(name);
  const now = new Date().toISOString();
  const mailboxStatement = db
    .prepare(
      `INSERT INTO gorelo_mailboxes
         (id, name, address, enabled, version, created_at, updated_at)
       VALUES (?, ?, ?, 1, 1, ?, ?)`,
    )
    .bind(
      BOOTSTRAP_GORELO_MAILBOX_ID,
      normalizedName,
      normalizedAddress,
      now,
      now,
    );
  const settingsStatement = db
    .prepare(
      `INSERT INTO gorelo_mailbox_settings
         (id, default_mailbox_id, version, updated_at)
       VALUES (1, ?, 1, ?)`,
    )
    .bind(BOOTSTRAP_GORELO_MAILBOX_ID, now);

  try {
    await db.batch([mailboxStatement, settingsStatement]);
  } catch (error) {
    const concurrentlyCreated = await initializedDefaultMailbox(db);
    if (concurrentlyCreated) return concurrentlyCreated;
    throw error;
  }

  const created = await initializedDefaultMailbox(db);
  if (!created) {
    throw new GoreloMailboxInvariantError(
      "The initial Gorelo mailbox could not be persisted",
    );
  }
  return created;
}

export async function createGoreloMailbox(
  db: D1Database,
  input: { name: string; address: string; enabled: boolean },
): Promise<GoreloMailbox> {
  if (!(await getGoreloMailboxSettings(db))) {
    throw new GoreloMailboxInvariantError(
      "Initialize the default Gorelo mailbox before adding destinations",
    );
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO gorelo_mailboxes
         (id, name, address, enabled, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(
      id,
      mailboxName(input.name),
      normalizeGoreloMailboxAddress(input.address),
      input.enabled ? 1 : 0,
      now,
      now,
    )
    .run();
  const created = await getGoreloMailbox(db, id);
  if (!created) {
    throw new GoreloMailboxInvariantError(
      "The Gorelo mailbox could not be persisted",
    );
  }
  return created;
}

export async function countGoreloMailboxRuleReferences(
  db: D1Database,
  id: string,
  options: { enabledOnly?: boolean } = {},
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count
         FROM rules
        WHERE json_extract(action_json, '$.mailboxId') = ?${options.enabledOnly ? " AND enabled = 1" : ""}`,
    )
    .bind(mailboxId(id))
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function updateGoreloMailbox(
  db: D1Database,
  id: string,
  expectedVersion: number,
  input: { name: string; enabled: boolean },
): Promise<GoreloMailboxMutationResult> {
  const normalizedId = mailboxId(id);
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE gorelo_mailboxes
          SET name = ?, enabled = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?
          AND (
            ? = 1 OR (
              NOT EXISTS (
                SELECT 1 FROM gorelo_mailbox_settings
                 WHERE id = 1 AND default_mailbox_id = ?
              )
              AND NOT EXISTS (
                SELECT 1 FROM rules
                 WHERE json_extract(action_json, '$.mailboxId') = ?
              )
            )
          )`,
    )
    .bind(
      mailboxName(input.name),
      input.enabled ? 1 : 0,
      now,
      normalizedId,
      expectedVersion,
      input.enabled ? 1 : 0,
      normalizedId,
      normalizedId,
    )
    .run();
  if (result.meta.changes === 1) {
    const updated = await getGoreloMailbox(db, normalizedId);
    if (updated) return { status: "updated", mailbox: updated };
  }

  const current = await getGoreloMailbox(db, normalizedId);
  if (!current) return { status: "not_found" };
  if (current.version !== expectedVersion) return { status: "conflict" };
  if (!input.enabled && current.isDefault) return { status: "default" };
  if (
    !input.enabled &&
    (await countGoreloMailboxRuleReferences(db, normalizedId)) > 0
  ) {
    return { status: "referenced" };
  }
  return { status: "conflict" };
}

export async function setDefaultGoreloMailbox(
  db: D1Database,
  id: string,
  expectedSettingsVersion: number,
): Promise<GoreloMailboxDefaultResult> {
  const normalizedId = mailboxId(id);
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE gorelo_mailbox_settings
          SET default_mailbox_id = ?, version = version + 1, updated_at = ?
        WHERE id = 1 AND version = ?
          AND EXISTS (
            SELECT 1 FROM gorelo_mailboxes
             WHERE id = ? AND enabled = 1
          )`,
    )
    .bind(normalizedId, now, expectedSettingsVersion, normalizedId)
    .run();
  if (result.meta.changes === 1) {
    const [mailbox, settings] = await Promise.all([
      getGoreloMailbox(db, normalizedId),
      getGoreloMailboxSettings(db),
    ]);
    if (mailbox && settings) {
      return { status: "updated", mailbox, settings };
    }
    throw new GoreloMailboxInvariantError(
      "The default Gorelo mailbox update could not be read back",
    );
  }

  const settings = await getGoreloMailboxSettings(db);
  if (!settings) return { status: "not_initialized" };
  if (settings.version !== expectedSettingsVersion) {
    return { status: "conflict" };
  }
  const target = await getGoreloMailbox(db, normalizedId);
  if (!target) return { status: "not_found" };
  if (!target.enabled) return { status: "disabled" };
  return { status: "conflict" };
}

export async function deleteGoreloMailbox(
  db: D1Database,
  id: string,
  expectedVersion: number,
): Promise<GoreloMailboxDeleteResult> {
  const normalizedId = mailboxId(id);
  const result = await db
    .prepare(
      `DELETE FROM gorelo_mailboxes
        WHERE id = ? AND version = ?
          AND NOT EXISTS (
            SELECT 1 FROM gorelo_mailbox_settings
             WHERE id = 1 AND default_mailbox_id = ?
          )
          AND NOT EXISTS (
            SELECT 1 FROM rules
             WHERE json_extract(action_json, '$.mailboxId') = ?
          )`,
    )
    .bind(normalizedId, expectedVersion, normalizedId, normalizedId)
    .run();
  if (result.meta.changes === 1) return "deleted";

  const current = await getGoreloMailbox(db, normalizedId);
  if (!current) return "not_found";
  if (current.version !== expectedVersion) return "conflict";
  if (current.isDefault) return "default";
  if ((await countGoreloMailboxRuleReferences(db, normalizedId)) > 0) {
    return "referenced";
  }
  return "conflict";
}

export async function loadGoreloMailboxDirectory(
  db: D1Database,
  options: LoadGoreloMailboxDirectoryOptions,
): Promise<GoreloMailboxDirectory> {
  if (options.bootstrapAddress !== undefined) {
    await ensureInitialGoreloMailbox(
      db,
      options.bootstrapAddress,
      options.bootstrapName,
    );
  }
  const [mailboxes, settings] = await Promise.all([
    listGoreloMailboxes(db),
    getGoreloMailboxSettings(db),
  ]);
  const allowedAddresses = new Set(
    [...options.allowedAddresses].map(normalizeGoreloMailboxAddress),
  );
  const routableMailboxes = mailboxes.map((mailbox) => {
    const allowlisted = allowedAddresses.has(mailbox.address);
    return {
      ...mailbox,
      allowlisted,
      routable: mailbox.enabled && allowlisted,
    } satisfies RoutableGoreloMailbox;
  });
  const byId = new Map(
    routableMailboxes.map((mailbox) => [mailbox.id, mailbox] as const),
  );
  const defaultMailbox = settings
    ? byId.get(settings.defaultMailboxId)
    : undefined;
  return {
    mailboxes: routableMailboxes,
    byId,
    ...(defaultMailbox ? { defaultMailbox } : {}),
    ...(settings ? { settings } : {}),
  };
}
