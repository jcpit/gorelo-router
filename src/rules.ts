import type {
  Decision,
  EvaluatedEmail,
  RuntimeConfig,
  StoredRule,
} from "./types";
import type { RuleAction, RuleCondition } from "./validation";

type FieldValue = string | number | boolean | readonly string[];
type RuleMatchState = "match" | "no_match" | "needs_mime";

export class RuleActionError extends Error {
  override readonly name = "RuleActionError";
}

function fieldValue(
  email: EvaluatedEmail,
  condition: RuleCondition,
): FieldValue {
  switch (condition.field) {
    case "from":
      return email.envelopeFrom;
    case "from_domain":
      return email.fromDomain;
    case "to":
      return email.envelopeTo;
    case "to_local_part":
      return email.toLocalPart;
    case "subject":
      return email.subject;
    case "body_text":
      return email.bodyText;
    case "attachment_name":
      return email.attachments.map((attachment) => attachment.filename);
    case "header": {
      const name = condition.headerName?.toLowerCase() ?? "";
      return Object.prototype.hasOwnProperty.call(email.headers, name)
        ? (email.headers[name] ?? "")
        : "";
    }
    case "spam_score":
      return email.spam.score;
    case "message_size":
      return email.rawSize;
    case "has_attachments":
      return email.hasAttachments;
  }
}

function normalize(value: string, caseSensitive: boolean): string {
  return caseSensitive ? value : value.toLowerCase();
}

function wildcardMatches(
  actual: string,
  pattern: string,
  caseSensitive: boolean,
): boolean {
  const value = normalize(actual, caseSensitive);
  const tokens: string[] = [];
  for (const token of normalize(pattern, caseSensitive)) {
    if (token !== "*" || tokens.at(-1) !== "*") {
      tokens.push(token);
    }
  }

  const wordCount = Math.ceil((tokens.length + 1) / 32);
  const stars = new Uint32Array(wordCount);
  const questions = new Uint32Array(wordCount);
  const literals = new Map<string, Uint32Array>();
  const setBit = (bits: Uint32Array, index: number): void => {
    bits[index >>> 5] = (bits[index >>> 5]! | (1 << (index & 31))) >>> 0;
  };

  tokens.forEach((token, index) => {
    if (token === "*") {
      setBit(stars, index);
    } else if (token === "?") {
      setBit(questions, index);
    } else {
      const bits = literals.get(token) ?? new Uint32Array(wordCount);
      setBit(bits, index);
      literals.set(token, bits);
    }
  });

  // A star can move to the following state without consuming input. Adjacent
  // stars were collapsed, so one propagation pass computes the full closure.
  const addStarEpsilonTransitions = (states: Uint32Array): void => {
    let carry = 0;
    for (let word = 0; word < wordCount; word += 1) {
      const starStates = states[word]! & stars[word]!;
      const shifted = ((starStates << 1) | carry) >>> 0;
      carry = starStates >>> 31;
      states[word] = (states[word]! | shifted) >>> 0;
    }
  };

  let active = new Uint32Array(wordCount);
  let next = new Uint32Array(wordCount);
  setBit(active, 0);
  addStarEpsilonTransitions(active);

  for (const character of value) {
    const matchingLiterals = literals.get(character);
    let carry = 0;
    for (let word = 0; word < wordCount; word += 1) {
      const compatible = questions[word]! | (matchingLiterals?.[word] ?? 0);
      const advancingStates = active[word]! & compatible;
      next[word] =
        ((active[word]! & stars[word]!) | (advancingStates << 1) | carry) >>> 0;
      carry = advancingStates >>> 31;
    }
    addStarEpsilonTransitions(next);
    [active, next] = [next, active];
  }

  const acceptingWord = tokens.length >>> 5;
  const acceptingBit = 1 << (tokens.length & 31);
  return (active[acceptingWord]! & acceptingBit) !== 0;
}

function compareString(actual: string, condition: RuleCondition): boolean {
  const caseSensitive = condition.caseSensitive;
  const expected = typeof condition.value === "string" ? condition.value : "";
  const normalizedActual = normalize(actual, caseSensitive);
  const normalizedExpected = normalize(expected, caseSensitive);

  switch (condition.operator) {
    case "equals":
      return normalizedActual === normalizedExpected;
    case "not_equals":
      return normalizedActual !== normalizedExpected;
    case "contains":
      return normalizedActual.includes(normalizedExpected);
    case "not_contains":
      return !normalizedActual.includes(normalizedExpected);
    case "starts_with":
      return normalizedActual.startsWith(normalizedExpected);
    case "ends_with":
      return normalizedActual.endsWith(normalizedExpected);
    case "wildcard":
      return wildcardMatches(actual, expected, caseSensitive);
    case "in":
      return (
        Array.isArray(condition.value) &&
        condition.value.some(
          (candidate) =>
            normalize(candidate, caseSensitive) === normalizedActual,
        )
      );
    case "exists":
      return actual.length > 0;
    case "gte":
    case "lte":
      return false;
  }
}

export function conditionMatches(
  email: EvaluatedEmail,
  condition: RuleCondition,
): boolean {
  if (
    !email.mimeParsed &&
    ["body_text", "attachment_name", "has_attachments"].includes(
      condition.field,
    )
  ) {
    return false;
  }
  const actual = fieldValue(email, condition);

  if (condition.operator === "exists") {
    if (Array.isArray(actual)) {
      return actual.length > 0;
    }
    if (typeof actual === "string") {
      return actual.length > 0;
    }
    if (typeof actual === "boolean") {
      return actual;
    }
    return false;
  }

  if (condition.operator === "gte" || condition.operator === "lte") {
    if (typeof actual !== "number" || typeof condition.value !== "number") {
      return false;
    }
    return condition.operator === "gte"
      ? actual >= condition.value
      : actual <= condition.value;
  }

  if (typeof actual === "boolean") {
    if (condition.operator === "equals") {
      return actual === condition.value;
    }
    if (condition.operator === "not_equals") {
      return actual !== condition.value;
    }
    return false;
  }

  if (typeof actual === "number") {
    if (condition.operator === "equals") {
      return actual === condition.value;
    }
    if (condition.operator === "not_equals") {
      return actual !== condition.value;
    }
    return false;
  }

  if (Array.isArray(actual)) {
    if (
      condition.operator === "not_equals" ||
      condition.operator === "not_contains"
    ) {
      return actual.every((value) => compareString(value, condition));
    }
    return actual.some((value) => compareString(value, condition));
  }

  return typeof actual === "string" ? compareString(actual, condition) : false;
}

export function ruleMatches(email: EvaluatedEmail, rule: StoredRule): boolean {
  if (rule.match === "all") {
    for (const condition of rule.conditions) {
      if (!conditionMatches(email, condition)) return false;
    }
    return true;
  }
  for (const condition of rule.conditions) {
    if (conditionMatches(email, condition)) return true;
  }
  return false;
}

function ruleMatchState(
  email: EvaluatedEmail,
  rule: StoredRule,
): RuleMatchState {
  const matchedState = (): RuleMatchState =>
    !email.mimeParsed && actionNeedsMime(rule.action) ? "needs_mime" : "match";
  let hasUnknown = false;
  if (rule.match === "all") {
    for (const condition of rule.conditions) {
      if (
        !email.mimeParsed &&
        ["body_text", "attachment_name", "has_attachments"].includes(
          condition.field,
        )
      ) {
        hasUnknown = true;
      } else if (!conditionMatches(email, condition)) {
        return "no_match";
      }
    }
    return hasUnknown ? "needs_mime" : matchedState();
  }

  for (const condition of rule.conditions) {
    if (
      !email.mimeParsed &&
      ["body_text", "attachment_name", "has_attachments"].includes(
        condition.field,
      )
    ) {
      hasUnknown = true;
    } else if (conditionMatches(email, condition)) {
      return matchedState();
    }
  }
  return hasUnknown ? "needs_mime" : "no_match";
}

function actionNeedsMime(action: RuleAction): boolean {
  return (
    (action.type === "forward_webhook" ||
      action.type === "create_ticket" ||
      action.type === "create_alert") &&
    action.fields.some((field) => field.source === "body_text")
  );
}

export function rulesNeedMime(rules: readonly StoredRule[]): boolean {
  return rules.some(
    (rule) =>
      rule.enabled &&
      (rule.conditions.some((condition) =>
        ["body_text", "attachment_name", "has_attachments"].includes(
          condition.field,
        ),
      ) ||
        actionNeedsMime(rule.action)),
  );
}

function ensureAllowedDestination(
  destination: string,
  config: RuntimeConfig,
): string {
  const normalized = destination.trim().toLowerCase();
  if (!config.allowedForwardDestinations.has(normalized)) {
    throw new RuleActionError(`Rule destination is not allowed: ${normalized}`);
  }
  return normalized;
}

export function validateRuleAction(
  action: RuleAction,
  config: RuntimeConfig,
): void {
  if (action.type === "forward" || action.type === "forward_webhook") {
    ensureAllowedDestination(
      action.destination ?? config.defaultGoreloAddress,
      config,
    );
    if (
      action.type === "forward_webhook" &&
      (!config.webhookSigningConfigured ||
        config.allowedWebhookHosts.size === 0)
    ) {
      throw new RuleActionError(
        "Signed webhook delivery is not configured for rule actions",
      );
    }
    return;
  }
  if (action.type === "create_ticket" || action.type === "create_alert") {
    if (!config.goreloApiConfigured) {
      throw new RuleActionError(
        "Gorelo API delivery is not configured for rule actions",
      );
    }
    return;
  }
  if (action.type === "quarantine") {
    if (config.quarantineMode === "internal") {
      if (action.destination) {
        ensureAllowedDestination(action.destination, config);
      }
      return;
    }
    const destination = action.destination ?? config.quarantineAddress;
    if (!destination) {
      throw new RuleActionError(
        "A quarantine action requires a destination or QUARANTINE_ADDRESS",
      );
    }
    ensureAllowedDestination(destination, config);
  }
}

function actionDecision(
  action: RuleAction,
  email: EvaluatedEmail,
  config: RuntimeConfig,
): Omit<Decision, "matchedRuleId" | "matchedRuleName"> {
  switch (action.type) {
    case "forward": {
      const destination = ensureAllowedDestination(
        action.destination ?? config.defaultGoreloAddress,
        config,
      );
      return {
        type: "forward",
        destination,
        reason: "forward rule matched",
        spam: email.spam,
      };
    }
    case "forward_webhook": {
      const destination = ensureAllowedDestination(
        action.destination ?? config.defaultGoreloAddress,
        config,
      );
      return {
        type: "forward",
        destination,
        webhook: {
          destinationId: action.webhookDestinationId,
          eventType: action.eventType,
          fields: action.fields,
          ...(action.clientIdentityField
            ? {
                clientIdentityField: action.clientIdentityField,
                clientAliasScope: action.clientAliasScope ?? "global",
              }
            : {}),
        },
        reason: "forward and webhook rule matched",
        spam: email.spam,
      };
    }
    case "create_ticket":
      return {
        type: "forward",
        gorelo: { action },
        reason: "create Gorelo ticket rule matched",
        spam: email.spam,
      };
    case "create_alert":
      return {
        type: "forward",
        gorelo: { action },
        reason: "create Gorelo alert rule matched",
        spam: email.spam,
      };
    case "quarantine": {
      if (config.quarantineMode === "internal") {
        return {
          type: "quarantine",
          reason: "quarantine rule matched",
          spam: email.spam,
        };
      }
      const configured = action.destination ?? config.quarantineAddress;
      if (!configured) {
        throw new RuleActionError(
          "A quarantine rule matched, but no quarantine address is configured",
        );
      }
      return {
        type: "quarantine",
        destination: ensureAllowedDestination(configured, config),
        reason: "quarantine rule matched",
        spam: email.spam,
      };
    }
    case "drop":
      return {
        type: "drop",
        reason: "drop rule matched",
        spam: email.spam,
      };
    case "reject":
      return {
        type: "reject",
        reason: action.reason,
        spam: email.spam,
      };
  }
}

function fallbackDecision(
  email: EvaluatedEmail,
  config: RuntimeConfig,
): Decision {
  if (email.spam.isSpam) {
    switch (config.spamAction) {
      case "forward":
        return {
          type: "forward",
          destination: config.defaultGoreloAddress,
          reason: "spam threshold met; configured to forward",
          spam: email.spam,
        };
      case "quarantine":
        if (config.quarantineMode === "internal") {
          return {
            type: "quarantine",
            reason: "spam threshold met",
            spam: email.spam,
          };
        }
        if (!config.quarantineAddress) {
          throw new Error(
            "SPAM_ACTION is quarantine, but QUARANTINE_ADDRESS is not set",
          );
        }
        return {
          type: "quarantine",
          destination: config.quarantineAddress,
          reason: "spam threshold met",
          spam: email.spam,
        };
      case "drop":
        return {
          type: "drop",
          reason: "spam threshold met",
          spam: email.spam,
        };
      case "reject":
        return {
          type: "reject",
          reason: "Message rejected by spam policy",
          spam: email.spam,
        };
    }
  }

  return {
    type: "forward",
    destination: config.defaultGoreloAddress,
    reason: "default Gorelo route",
    spam: email.spam,
  };
}

function matchedRuleDecision(
  rule: StoredRule,
  email: EvaluatedEmail,
  config: RuntimeConfig,
): Decision {
  if (
    (rule.action.type === "forward" ||
      rule.action.type === "forward_webhook" ||
      rule.action.type === "create_ticket" ||
      rule.action.type === "create_alert") &&
    email.spam.isSpam &&
    config.spamAction !== "forward" &&
    !rule.action.bypassSpam
  ) {
    return fallbackDecision(email, config);
  }
  return {
    ...actionDecision(rule.action, email, config),
    matchedRuleId: rule.id,
    matchedRuleName: rule.name,
    matchedRuleSnapshotId: `${rule.id}:${rule.updatedAt}`,
  };
}

export function decide(
  email: EvaluatedEmail,
  rules: readonly StoredRule[],
  config: RuntimeConfig,
): Decision {
  const orderedRules = [...rules]
    .filter((rule) => rule.enabled)
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.createdAt.localeCompare(right.createdAt),
    );

  for (const rule of orderedRules) {
    if (ruleMatches(email, rule)) {
      return matchedRuleDecision(rule, email, config);
    }
  }
  return fallbackDecision(email, config);
}

export function decideWithoutMime(
  email: EvaluatedEmail,
  rules: readonly StoredRule[],
  config: RuntimeConfig,
): Decision | undefined {
  const orderedRules = [...rules]
    .filter((rule) => rule.enabled)
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.createdAt.localeCompare(right.createdAt),
    );

  for (const rule of orderedRules) {
    const state = ruleMatchState(email, rule);
    if (state === "needs_mime") {
      return undefined;
    }
    if (state === "match") {
      return matchedRuleDecision(rule, email, config);
    }
  }

  return fallbackDecision(email, config);
}
