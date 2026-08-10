import { handleFetch } from "./api";
import { loadConfig } from "./config";
import { handleEmail } from "./email-handler";
import { processPendingGoreloDeliveries } from "./gorelo-delivery";
import { deleteExpiredGoreloCatalogCache } from "./gorelo-cache";
import { deleteEventsBefore, listExpiredArchiveKeys } from "./repository";
import {
  deleteTerminalParserCapturesBefore,
  expireCapturedParserCapture,
  expirePendingParserCaptures,
  listExpiredParserCaptureSamples,
  PARSER_CAPTURE_SAMPLE_RETENTION_MS,
  recoverStaleParserCaptureClaims,
} from "./parser-capture-repository";
import type { Env } from "./types";
import { retryClaimableWebhookDeliveries } from "./webhook-delivery";

export async function deleteExpiredParserSampleObjects(
  bucket: R2Bucket | undefined,
  uploadedBefore: Date,
): Promise<number> {
  if (!bucket) return 0;
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({
      prefix: "parser-samples/",
      limit: 1_000,
      ...(cursor ? { cursor } : {}),
    });
    const keys = page.objects
      .filter(
        (object) =>
          object.key.startsWith("parser-samples/") &&
          object.uploaded <= uploadedBefore,
      )
      .map((object) => object.key);
    if (keys.length > 0) {
      await bucket.delete(keys);
      deleted += keys.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}

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

async function maintainParserCaptures(env: Env): Promise<{
  pendingExpired: number;
  claimsRecovered: number;
  claimExpiries: number;
  samplesExpired: number;
  sampleObjectsExpired: number;
}> {
  const now = new Date();
  const nowIso = now.toISOString();
  const claims = await recoverStaleParserCaptureClaims(env.DB, {
    staleBefore: new Date(now.getTime() - 10 * 60 * 1_000).toISOString(),
    recoveredAt: nowIso,
  });
  const pendingExpired = await expirePendingParserCaptures(env.DB, nowIso);
  const sampleObjectsExpired = await deleteExpiredParserSampleObjects(
    env.MESSAGE_ARCHIVE,
    new Date(now.getTime() - PARSER_CAPTURE_SAMPLE_RETENTION_MS),
  );
  const expiredSamples = await listExpiredParserCaptureSamples(env.DB, nowIso);
  let samplesExpired = 0;
  if (expiredSamples.length > 0) {
    if (!env.MESSAGE_ARCHIVE) {
      throw new Error(
        "Expired parser samples reference private objects, but MESSAGE_ARCHIVE is unavailable",
      );
    }
    for (const sample of expiredSamples) {
      await env.MESSAGE_ARCHIVE.delete(sample.objectKey);
      const result = await expireCapturedParserCapture(
        env.DB,
        sample.captureId,
        sample.version,
        nowIso,
      );
      if (result.status === "updated") samplesExpired += 1;
    }
  }
  await deleteTerminalParserCapturesBefore(
    env.DB,
    new Date(now.getTime() - 24 * 60 * 60 * 1_000).toISOString(),
  );
  return {
    pendingExpired,
    claimsRecovered: claims.recovered,
    claimExpiries: claims.expired,
    samplesExpired,
    sampleObjectsExpired,
  };
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
          maintainParserCaptures(env),
        ]).then(([webhooks, gorelo, captures]) => {
          console.log("Processed due outbound deliveries", {
            webhooks,
            gorelo,
            captures,
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
