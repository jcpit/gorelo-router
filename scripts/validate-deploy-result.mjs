import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const VERSION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function hasConfirmedDeployResult(output) {
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      entry?.type === "deploy" &&
      typeof entry.version_id === "string" &&
      VERSION_ID.test(entry.version_id)
    ) {
      return true;
    }
  }
  return false;
}

const invokedAsScript =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedAsScript) {
  const outputPath = process.argv[2];
  if (!outputPath) {
    console.error("Usage: node validate-deploy-result.mjs <output-file>");
    process.exitCode = 2;
  } else {
    try {
      if (!hasConfirmedDeployResult(readFileSync(outputPath, "utf8"))) {
        throw new Error(
          "Wrangler did not record a confirmed Worker version deployment.",
        );
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
