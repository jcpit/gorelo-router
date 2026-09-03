import type { EmailFacts, RuntimeConfig, SpamAssessment } from "./types";

export function assessSpam(facts: EmailFacts, _config: RuntimeConfig): SpamAssessment {
  const raw = facts.headers["x-cf-spamh-score"] ?? facts.headers["x-cf-spam-score"] ?? facts.headers["x-cf-spam"];
  const parsed = raw === undefined ? 0 : Number.parseFloat(raw.trim());
  const score = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  return { score, reasons: raw === undefined ? [] : [`Cloudflare spam score ${score}`], isSpam: score > 0 };
}
