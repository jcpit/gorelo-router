import { handleFetch } from "./api";
import { loadConfig } from "./config";
import { handleEmail } from "./email-handler";
import { processPendingGoreloDeliveries } from "./gorelo-delivery";
import { deleteExpiredGoreloCatalogCache } from "./gorelo-cache";
import { deleteEventsBefore, listExpiredArchiveKeys } from "./repository";
import type { Env } from "./types";
import { retryClaimableWebhookDeliveries } from "./webhook-delivery";

async function expireAuditData(env: Env, cutoff: string): Promise<number> {
  while (true) {
    const archived = await listExpiredArchiveKeys(env.DB, cutoff);
    if (archived.length === 0) break;
    if (!env.MESSAGE_ARCHIVE) {
      throw new Error(
        "Expired audit rows reference raw messages, but MESSAGE_ARCHIVE is unavailable",
      );
    }
    await env.MESSAGE_ARCHIVE.delete(archived.map((item) => item.objectKey));
    await env.DB.batch(
      archived.map((item) =>
        env.DB.prepare(
          `UPDATE processing_events
                SET archive_key = NULL, archive_sha256 = NULL
              WHERE id = ? AND archive_key = ?`,
        ).bind(item.eventId, item.objectKey),
      ),
    );
  }
  return deleteEventsBefore(env.DB, cutoff);
}

export default {
  fetch(request, env) {
    return handleFetch(request, env);
  },

  email(message, env, context) {
    return handleEmail(message, env, context);
  },

  async scheduled(controller, env, context) {
    const config = loadConfig(env);
    if (controller.cron === "*/5 * * * *") {
      context.waitUntil(
        Promise.all([
          retryClaimableWebhookDeliveries(env, config),
          processPendingGoreloDeliveries(env, config),
        ]).then(([webhooks, gorelo]) => {
          console.log("Processed due outbound deliveries", {
            webhooks,
            gorelo,
          });
        }),
      );
      return;
    }
    const cutoff = new Date(
      Date.now() - config.eventRetentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    context.waitUntil(
      Promise.all([
        expireAuditData(env, cutoff),
        deleteExpiredGoreloCatalogCache(env.DB),
      ]).then(([deletedEvents, deletedCatalogs]) => {
        console.log("Expired retained data", {
          deletedEvents,
          deletedCatalogs,
          cutoff,
        });
      }),
    );
  },
} satisfies ExportedHandler<Env>;
