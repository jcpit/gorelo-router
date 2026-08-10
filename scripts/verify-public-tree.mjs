import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const root = resolve(process.cwd());
const skippedDirectories = new Set([
  ".git",
  ".wrangler",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const forbiddenDirectories = new Set([
  ".aws",
  ".azure",
  ".kube",
  ".ssh",
  ".terraform",
]);

function fallbackFiles(directory = root) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...fallbackFiles(path));
    else if (entry.isFile()) files.push(relative(root, path));
  }
  return files;
}

function gitFiles(arguments_) {
  const output = execFileSync("git", [...arguments_, "-z"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return output.split("\0").filter(Boolean);
}

function publicationFiles() {
  try {
    return gitFiles(["ls-files", "--cached", "--others", "--exclude-standard"]);
  } catch {
    return fallbackFiles().filter(
      (path) =>
        allowedSensitiveExamples.has(path) ||
        (path !== ".dev.vars" &&
          path !== ".env" &&
          !path.startsWith(".dev.vars.") &&
          !path.startsWith(".env.")),
    );
  }
}

function cachedPublicationFiles() {
  try {
    return new Set(gitFiles(["ls-files", "--cached"]));
  } catch {
    return new Set();
  }
}

const forbiddenBasenames = new Set([
  ".dev.vars",
  ".env",
  ".netrc",
  ".npmrc",
  ".pypirc",
  "credentials.json",
  "id_ed25519",
  "id_rsa",
  "service-account.json",
  "wrangler.production.jsonc",
]);
const forbiddenExtensions = [
  ".db",
  ".dump",
  ".gz",
  ".har",
  ".jks",
  ".kdbx",
  ".key",
  ".keystore",
  ".log",
  ".msg",
  ".ovpn",
  ".p12",
  ".pcap",
  ".pcapng",
  ".pem",
  ".pfx",
  ".sqlite",
  ".sqlite3",
  ".tar",
  ".tfstate",
  ".tfvars",
  ".tgz",
  ".zip",
  ".7z",
];
const allowedSensitiveExamples = new Set([".dev.vars.example", ".env.example"]);
const allowedRawFixtures = new Set(["test/fixtures/multipart.eml"]);

const fixedPatterns = [
  [
    "private-key",
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
  ],
  [
    "provider-token",
    /(?:github_pat_|gh[pousr]_|AKIA[0-9A-Z]|ASIA[0-9A-Z]|xox[baprs]-|sk_live_|rk_live_|AIza[0-9A-Za-z_-])[A-Za-z0-9_\-+/=]{12,}/g,
  ],
  [
    "literal-bearer-token",
    /(?:authorization|proxy-authorization)[^\r\n]{0,40}Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  ],
  ["credential-in-url", /https?:\/\/[^/@:\s]+:[^/@\s]+@/gi],
];

const sensitiveAssignment =
  /\b(ADMIN_API_TOKEN|GORELO_API_KEY|WEBHOOK_SIGNING_SECRET|CLOUDFLARE_API_TOKEN|CF_API_TOKEN|AWS_SECRET_ACCESS_KEY|CLIENT_SECRET|PASSWORD|PASSWD)\b\s*[:=]\s*(?:"([^"]*)"|'([^']*)')/gi;
const sensitiveEnvironmentAssignment =
  /^(ADMIN_API_TOKEN|GORELO_API_KEY|WEBHOOK_SIGNING_SECRET|CLOUDFLARE_API_TOKEN|CF_API_TOKEN|AWS_SECRET_ACCESS_KEY|CLIENT_SECRET|PASSWORD|PASSWD)\s*=\s*(.*)$/gim;
const safeExampleValue = /^(?:x|\*+)$/i;
const safeDescriptiveValue =
  /(?:change[-_ ]?me|configured[-_ ]?(?:key|test)|do-not-send|dummy|example|fake|must-not-be|not-a-real|placeholder|replace|test[-_]|too-short|your[-_])/i;
const safeTestCredentialUrl = /^https:\/\/user:(?:pass|secret)@$/i;

function lineNumber(text, index) {
  let line = 1;
  for (let offset = 0; offset < index; offset += 1) {
    if (text.charCodeAt(offset) === 10) line += 1;
  }
  return line;
}

function shannonEntropy(value) {
  const counts = new Map();
  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  let result = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    result -= probability * Math.log2(probability);
  }
  return result;
}

const findings = [];
function addFinding(path, line, rule) {
  findings.push({ path, line, rule });
}

const files = [...new Set(publicationFiles())].sort();
const cachedFiles = cachedPublicationFiles();
for (const path of files) {
  const normalized = path.replaceAll("\\", "/");
  const name = basename(normalized);
  const lowerName = name.toLowerCase();
  const absolute = join(root, path);
  const isCached = cachedFiles.has(path);
  const existsInCheckout = existsSync(absolute) && statSync(absolute).isFile();
  if (!isCached && !existsInCheckout) {
    continue;
  }

  const hasForbiddenDirectory = normalized
    .split("/")
    .slice(0, -1)
    .some(
      (part) => skippedDirectories.has(part) || forbiddenDirectories.has(part),
    );
  const isSensitiveEnvironmentFile =
    (lowerName.startsWith(".dev.vars") || lowerName.startsWith(".env")) &&
    !allowedSensitiveExamples.has(lowerName);
  const isForbiddenExtension = forbiddenExtensions.some((extension) =>
    lowerName.endsWith(extension),
  );
  const isRawMessage =
    lowerName.endsWith(".eml") && !allowedRawFixtures.has(normalized);
  if (
    hasForbiddenDirectory ||
    forbiddenBasenames.has(lowerName) ||
    isSensitiveEnvironmentFile ||
    isForbiddenExtension ||
    isRawMessage
  ) {
    addFinding(normalized, 1, "prohibited-file");
    continue;
  }

  const byteSources = [];
  if (isCached) {
    byteSources.push(
      execFileSync("git", ["show", `:${path}`], {
        cwd: root,
        encoding: null,
        maxBuffer: 6_000_000,
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  }
  if (existsInCheckout) byteSources.push(readFileSync(absolute));

  for (const bytes of byteSources) {
    if (bytes.length > 5_000_000 || bytes.includes(0)) continue;
    const content = bytes.toString("utf8");

    for (const [rule, pattern] of fixedPatterns) {
      pattern.lastIndex = 0;
      for (const match of content.matchAll(pattern)) {
        if (
          rule === "credential-in-url" &&
          normalized.startsWith("test/") &&
          (safeDescriptiveValue.test(match[0]) ||
            safeTestCredentialUrl.test(match[0]))
        ) {
          continue;
        }
        addFinding(normalized, lineNumber(content, match.index ?? 0), rule);
      }
    }

    sensitiveAssignment.lastIndex = 0;
    for (const match of content.matchAll(sensitiveAssignment)) {
      const value = match[2] ?? match[3] ?? "";
      if (!safeExampleValue.test(value) && !safeDescriptiveValue.test(value)) {
        addFinding(
          normalized,
          lineNumber(content, match.index ?? 0),
          "literal-sensitive-value",
        );
      }
    }

    if (allowedSensitiveExamples.has(normalized)) {
      sensitiveEnvironmentAssignment.lastIndex = 0;
      for (const match of content.matchAll(sensitiveEnvironmentAssignment)) {
        const value = match[2].trim().replace(/^['"]|['"]$/g, "");
        if (
          !safeExampleValue.test(value) &&
          !safeDescriptiveValue.test(value)
        ) {
          addFinding(
            normalized,
            lineNumber(content, match.index ?? 0),
            "non-placeholder-example-secret",
          );
        }
      }
    }

    if (
      normalized !== "package-lock.json" &&
      !allowedSensitiveExamples.has(normalized)
    ) {
      for (const match of content.matchAll(/[A-Za-z0-9+/=_-]{40,}/g)) {
        const value = match[0];
        if (
          /[a-z]/.test(value) &&
          /[A-Z]/.test(value) &&
          /[0-9]/.test(value) &&
          shannonEntropy(value) >= 4.4
        ) {
          addFinding(
            normalized,
            lineNumber(content, match.index ?? 0),
            "high-entropy-value",
          );
        }
      }
    }
  }
}

const uniqueFindings = [
  ...new Map(
    findings.map((finding) => [
      `${finding.path}:${finding.line}:${finding.rule}`,
      finding,
    ]),
  ).values(),
].sort(
  (left, right) =>
    left.path.localeCompare(right.path) ||
    left.line - right.line ||
    left.rule.localeCompare(right.rule),
);

if (uniqueFindings.length) {
  console.error("Public-tree security check failed:");
  for (const finding of uniqueFindings) {
    console.error(`- ${finding.path}:${finding.line} [${finding.rule}]`);
  }
  console.error("Candidate values are intentionally never printed.");
  process.exit(1);
}

console.log(
  `Public-tree security check passed (${files.length} publication candidates).`,
);
