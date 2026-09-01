const POSTMARK_ENDPOINT = "https://spamcheck.postmarkapp.com/filter";
const MAX_EXTERNAL_BYTES = 2 * 1024 * 1024;

export interface PostmarkSpamcheckResult {
  score: number;
  rules: readonly string[];
}

/**
 * Runs Postmark's free SpamAssassin check. The caller decides whether the
 * message is eligible; this helper never logs or persists message contents.
 */
export async function postmarkSpamcheck(
  raw: ArrayBuffer,
  timeoutMs: number,
): Promise<PostmarkSpamcheckResult | undefined> {
  if (raw.byteLength === 0 || raw.byteLength > MAX_EXTERNAL_BYTES) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(POSTMARK_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        email: new TextDecoder().decode(raw),
        options: "short",
      }),
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") return undefined;
    const record = payload as { success?: unknown; score?: unknown; rules?: unknown };
    const score = typeof record.score === "number" && Number.isFinite(record.score)
      ? Math.max(0, Math.min(100, record.score))
      : undefined;
    if (record.success !== true || score === undefined) return undefined;
    const rules = Array.isArray(record.rules)
      ? record.rules
          .map((rule) => {
            if (typeof rule === "string") return rule;
            if (rule && typeof rule === "object" && typeof (rule as { name?: unknown }).name === "string") {
              return (rule as { name: string }).name;
            }
            return "";
          })
          .filter((rule): rule is string => Boolean(rule))
          .map((rule) => rule.slice(0, 120))
          .slice(0, 20)
      : [];
    return { score, rules };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
