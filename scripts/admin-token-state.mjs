import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ADMIN_SECRET_NAME = "ADMIN_API_TOKEN";
const NEW_WORKER_MARKER =
  "If this is a new Worker, run `wrangler deploy` first to create it.";

export function classifyAdminTokenState(result) {
  if (result.error) {
    throw new Error(
      `Unable to inspect Worker secrets: ${result.error.message}`,
    );
  }

  if (result.status === 0) {
    let listed;
    try {
      listed = JSON.parse(result.stdout);
    } catch {
      throw new Error("Wrangler returned an invalid secret-list response.");
    }
    if (!Array.isArray(listed)) {
      throw new Error("Wrangler returned an invalid secret-list response.");
    }
    return listed.some((entry) => entry?.name === ADMIN_SECRET_NAME)
      ? "configured"
      : "missing";
  }

  const diagnostic = result.stderr.trim();
  if (
    diagnostic.includes(NEW_WORKER_MARKER) &&
    /Worker "[^"\r\n]+"(?: \(env: "[^"\r\n]+"\))? not found\./.test(diagnostic)
  ) {
    return "missing";
  }

  throw new Error(
    diagnostic || "Unable to inspect the target Worker's configured secrets.",
  );
}

export function inspectAdminTokenState() {
  const projectDirectory = fileURLToPath(new URL("..", import.meta.url));
  const wrangler = fileURLToPath(
    new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [wrangler, "secret", "list", "--format", "json"],
    { cwd: projectDirectory, encoding: "utf8" },
  );
  return classifyAdminTokenState(result);
}

const invokedAsScript =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedAsScript) {
  try {
    process.stdout.write(`${inspectAdminTokenState()}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
