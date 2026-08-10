import type { EmailFacts, RuntimeConfig, SpamAssessment } from "./types";

const DEFAULT_SPAM_PHRASES = [
  "free money",
  "lottery winner",
  "guaranteed income",
  "crypto giveaway",
  "risk-free investment",
  "you have been selected",
  "claim your prize",
];

function isTrustedDomain(
  domain: string,
  trustedDomains: ReadonlySet<string>,
): boolean {
  for (const trusted of trustedDomains) {
    if (domain === trusted || domain.endsWith(`.${trusted}`)) {
      return true;
    }
  }
  return false;
}

export function assessSpam(
  facts: EmailFacts,
  config: RuntimeConfig,
): SpamAssessment {
  let score = 0;
  const reasons: string[] = [];

  if (isTrustedDomain(facts.fromDomain, config.trustedSenderDomains)) {
    score -= 2;
    reasons.push("trusted sender domain");
  }

  const subjectLower = facts.subject.toLowerCase();
  const phrases =
    config.spamKeywords.length > 0 ? config.spamKeywords : DEFAULT_SPAM_PHRASES;
  let keywordPoints = 0;
  for (const phrase of phrases) {
    if (subjectLower.includes(phrase.toLowerCase())) {
      keywordPoints += 2;
      reasons.push(`subject phrase: ${phrase}`);
    }
  }
  score += Math.min(keywordPoints, 6);

  const letters = [...facts.subject].filter((character) =>
    /[a-z]/i.test(character),
  );
  const upperCaseLetters = letters.filter((character) =>
    /[A-Z]/.test(character),
  );
  if (letters.length >= 12 && upperCaseLetters.length / letters.length >= 0.8) {
    score += 1;
    reasons.push("mostly uppercase subject");
  }

  if (/[!$]{4,}/.test(facts.subject)) {
    score += 1;
    reasons.push("excessive subject punctuation");
  }

  return {
    score,
    reasons,
    isSpam: score >= config.spamThreshold,
  };
}
