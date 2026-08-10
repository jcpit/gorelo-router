import { fileURLToPath } from "node:url";
import { experimental_readRawConfig } from "wrangler";

const configPath = fileURLToPath(new URL("../wrangler.jsonc", import.meta.url));
const { rawConfig } = experimental_readRawConfig({ config: configPath });
const accountId = rawConfig.account_id;

if (
  typeof accountId !== "string" ||
  !/^[0-9a-f]{32}$/i.test(accountId) ||
  accountId === "00000000000000000000000000000000"
) {
  console.error(
    "Cloudflare account is not configured. Run `docker compose run --rm cloudflare whoami`, then replace the all-zero account_id in wrangler.production.jsonc.",
  );
  process.exit(1);
}
