import type { EmailFacts, RuntimeConfig, SpamAssessment } from "./types";

const DEFAULT_SPAM_PHRASES = ["free money","lottery winner","guaranteed income","crypto giveaway","risk-free investment","you have been selected","claim your prize","act now","limited time offer","verify your account","gift card","wire transfer","casino bonus","work from home"];
const DANGEROUS_EXTENSIONS = /\.(?:exe|scr|pif|js|jse|mjs|vbs|vbe|wsf|wsh|bat|cmd|com|cpl|hta|scf|lnk|url|dll|ocx|sys|msi|msp|msix|appx|jar|apk|iso|img|vhd|vhdx|ps1|psm1|psd1|reg|inf|docm|dotm|xlsm|xltm|xlam|pptm|ppsm|ppam)$/i;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>()]+/gi;
const SHORTENER_HOSTS = new Set(["bit.ly","tinyurl.com","t.co","goo.gl","ow.ly","is.gd","buff.ly","cutt.ly"]);
function isTrustedDomain(domain: string, trusted: ReadonlySet<string>): boolean { for (const item of trusted) if (domain === item || domain.endsWith(`.${item}`)) return true; return false; }
function header(facts: EmailFacts, name: string): string { return String(facts.headers[name.toLowerCase()] ?? ""); }
function add(reasons: string[], reason: string, points: number): number { reasons.push(reason); return points; }

export function assessSpam(facts: EmailFacts, config: RuntimeConfig): SpamAssessment {
  let score = 0; const reasons: string[] = []; const subject = facts.subject.slice(0, 10_000); const body = facts.bodyText.slice(0, Math.min(config.maxBodyCharacters, 200_000)); const trusted = isTrustedDomain(facts.fromDomain, config.trustedSenderDomains); if (trusted) score -= 2;
  const phrases = config.spamKeywords.length > 0 ? config.spamKeywords : DEFAULT_SPAM_PHRASES; let subjectPoints = 0; let bodyPoints = 0; const subjectLower = subject.toLowerCase(); const bodyLower = body.toLowerCase();
  for (const phrase of phrases) { const needle = phrase.toLowerCase().trim(); if (!needle) continue; if (subjectLower.includes(needle)) { subjectPoints += 2; reasons.push(`subject phrase: ${phrase}`); } else if (bodyLower.includes(needle)) { bodyPoints += 1; reasons.push(`body phrase: ${phrase}`); } }
  score += Math.min(subjectPoints, 8) + Math.min(bodyPoints, 6);
  const letters = [...subject].filter((character) => /[a-z]/i.test(character)); const uppercase = letters.filter((character) => /[A-Z]/.test(character)); if (letters.length >= 12 && uppercase.length / letters.length >= 0.8) score += add(reasons, "mostly uppercase subject", 1); if (/[!$]{4,}/.test(subject)) score += add(reasons, "excessive subject punctuation", 1);
  const auth = `${header(facts,"authentication-results")} ${header(facts,"arc-authentication-results")} ${header(facts,"received-spf")}`.toLowerCase(); if (/(dmarc|dkim|spf)\s*=\s*(fail|softfail|neutral|temperror|permerror)|spf\s+(fail|softfail)/.test(auth)) score += add(reasons, "email authentication failure", 3);
  const reply = header(facts,"reply-to").match(/[\w.+-]+@[\w.-]+/)?.[0] ?? ""; if (reply && reply.toLowerCase().split("@")[1] !== facts.fromDomain.toLowerCase()) score += add(reasons, "reply-to domain differs from sender", 2);
  const urls = body.match(URL_PATTERN) ?? []; let shorteners = 0; let rawIpUrls = 0; for (const raw of urls.slice(0,100)) { try { const parsed = new URL(raw); if (SHORTENER_HOSTS.has(parsed.hostname.toLowerCase())) shorteners += 1; if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsed.hostname)) rawIpUrls += 1; } catch {} }
  if (shorteners) score += add(reasons, `${shorteners} link shortener${shorteners===1?"":"s"}`, Math.min(2,shorteners)); if (rawIpUrls) score += add(reasons, "link uses a raw IP address", 2); if (urls.length >= 8) score += add(reasons, "many links in message body", 1);
  const dangerous = facts.attachments.filter((attachment) => DANGEROUS_EXTENSIONS.test(attachment.filename)); if (dangerous.length) score += add(reasons, `${dangerous.length} potentially executable attachment${dangerous.length===1?"":"s"}`, Math.min(6,dangerous.length*3)); if (body && /unsubscribe|opt[- ]?out/i.test(body) && urls.length >= 3) score += add(reasons, "bulk-mail pattern", 1);
  return { score, reasons, isSpam: score >= config.spamThreshold };
}
