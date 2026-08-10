import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const wrangler = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const result = spawnSync(
  process.execPath,
  [wrangler, "secret", "list", "--format", "json"],
  { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" },
);

if (result.status !== 0) {
  console.error(
    result.stderr.trim() ||
      "Unable to inspect the target Worker's configured secrets.",
  );
  process.exitCode = result.status ?? 1;
} else {
  let listed;
  try {
    listed = JSON.parse(result.stdout);
  } catch {
    console.error("Wrangler returned an invalid secret-list response.");
    process.exitCode = 1;
  }

  if (Array.isArray(listed)) {
    const configured = new Set(
      listed.flatMap((entry) =>
        entry && typeof entry.name === "string" ? [entry.name] : [],
      ),
    );
    const missing = ["ADMIN_API_TOKEN"].filter((name) => !configured.has(name));
    if (missing.length > 0) {
      console.error(
        `Deployment is missing required Worker secrets:\n- ${missing.join("\n- ")}`,
      );
      process.exitCode = 1;
    } else {
      console.log("Required deployment secrets are configured.");
    }
  }
}
