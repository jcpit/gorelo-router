export interface WebhookDestination {
  id: string;
  name: string;
  url: string;
  host: string;
  enabled: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface WebhookDestinationRow {
  id: string;
  name: string;
  url: string;
  host: string;
  enabled: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export type WebhookMutationResult =
  | { status: "updated"; webhook: WebhookDestination }
  | { status: "not_found" | "conflict" };

function rowToWebhook(row: WebhookDestinationRow): WebhookDestination {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    host: row.host,
    enabled: row.enabled === 1,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listWebhookDestinations(
  db: D1Database,
): Promise<WebhookDestination[]> {
  const result = await db
    .prepare(
      `SELECT id, name, url, host, enabled, version, created_at, updated_at
         FROM webhook_destinations
        ORDER BY name COLLATE NOCASE ASC, id ASC`,
    )
    .all<WebhookDestinationRow>();
  return result.results.map(rowToWebhook);
}

export async function getWebhookDestination(
  db: D1Database,
  id: string,
): Promise<WebhookDestination | null> {
  const row = await db
    .prepare(
      `SELECT id, name, url, host, enabled, version, created_at, updated_at
         FROM webhook_destinations
        WHERE id = ?
        LIMIT 1`,
    )
    .bind(id)
    .first<WebhookDestinationRow>();
  return row ? rowToWebhook(row) : null;
}

export async function createWebhookDestination(
  db: D1Database,
  input: { name: string; url: string; host: string; enabled: boolean },
): Promise<WebhookDestination> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO webhook_destinations
         (id, name, url, host, enabled, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(
      id,
      input.name,
      input.url,
      input.host,
      input.enabled ? 1 : 0,
      now,
      now,
    )
    .run();
  const webhook = await getWebhookDestination(db, id);
  if (!webhook) throw new Error("Webhook destination could not be persisted");
  return webhook;
}

export async function updateWebhookDestination(
  db: D1Database,
  id: string,
  expectedVersion: number,
  input: { name: string; url: string; host: string; enabled: boolean },
): Promise<WebhookMutationResult> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE webhook_destinations
          SET name = ?, url = ?, host = ?, enabled = ?,
              version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?`,
    )
    .bind(
      input.name,
      input.url,
      input.host,
      input.enabled ? 1 : 0,
      now,
      id,
      expectedVersion,
    )
    .run();
  if (result.meta.changes !== 1) {
    return (await getWebhookDestination(db, id))
      ? { status: "conflict" }
      : { status: "not_found" };
  }
  const webhook = await getWebhookDestination(db, id);
  return webhook ? { status: "updated", webhook } : { status: "not_found" };
}

export async function deleteWebhookDestination(
  db: D1Database,
  id: string,
  expectedVersion: number,
): Promise<"deleted" | "not_found" | "conflict"> {
  const result = await db
    .prepare("DELETE FROM webhook_destinations WHERE id = ? AND version = ?")
    .bind(id, expectedVersion)
    .run();
  if (result.meta.changes === 1) return "deleted";
  return (await getWebhookDestination(db, id)) ? "conflict" : "not_found";
}
