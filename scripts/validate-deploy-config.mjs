import { fileURLToPath } from "node:url";
import { experimental_readRawConfig } from "wrangler";

const configPath = fileURLToPath(new URL("../wrangler.jsonc", import.meta.url));
const { rawConfig: config } = experimental_readRawConfig({
  config: configPath,
});
const blockers = [];
const reservedDeploymentSuffixes = [
  "example.com",
  "example.net",
  "example.org",
  "example",
  "invalid",
  "localhost",
  "test",
];

function isReservedDeploymentHostname(value) {
  const hostname = value.toLowerCase().replace(/\.$/, "");
  return reservedDeploymentSuffixes.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}

if (
  typeof config.account_id !== "string" ||
  !/^[0-9a-f]{32}$/i.test(config.account_id) ||
  config.account_id === "00000000000000000000000000000000"
) {
  blockers.push("set account_id to the intended 32-character Cloudflare ID");
}
const database = Array.isArray(config.d1_databases)
  ? config.d1_databases.find((entry) => entry?.binding === "DB")
  : undefined;
if (
  !database ||
  typeof database.database_id !== "string" ||
  !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
    database.database_id,
  ) ||
  database.database_id === "00000000-0000-0000-0000-000000000000"
) {
  blockers.push("set database_id to the intended D1 UUID");
}
const variables =
  config.vars && typeof config.vars === "object" ? config.vars : {};
const forbiddenVariableNames = [
  "ADMIN_API_TOKEN",
  "GORELO_API_KEY",
  "WEBHOOK_SIGNING_SECRET",
  "CLOUDFLARE_API_TOKEN",
  "CF_API_TOKEN",
];
const exposedSecrets = forbiddenVariableNames.filter((name) =>
  Object.hasOwn(variables, name),
);
if (exposedSecrets.length > 0) {
  blockers.push(
    `remove secret ${exposedSecrets.length === 1 ? "name" : "names"} from vars: ${exposedSecrets.join(", ")}`,
  );
}
if (
  variables.DEFAULT_GORELO_ADDRESS ===
    "replace-with-your-gorelo-forwarding-address@example.com" ||
  variables.ALLOWED_FORWARD_DESTINATIONS ===
    "replace-with-your-gorelo-forwarding-address@example.com"
) {
  blockers.push("replace the placeholder Gorelo forwarding address");
}
if (config.workers_dev !== false) {
  blockers.push("set workers_dev to false");
}
if (config.preview_urls !== false) {
  blockers.push("set preview_urls to false");
}
const routes = Array.isArray(config.routes) ? config.routes : [];
const customDomainRoute = routes.length === 1 ? routes[0] : undefined;
if (
  !customDomainRoute ||
  typeof customDomainRoute !== "object" ||
  customDomainRoute.custom_domain !== true ||
  typeof customDomainRoute.pattern !== "string" ||
  isReservedDeploymentHostname(customDomainRoute.pattern)
) {
  blockers.push("configure exactly one non-placeholder Custom Domain route");
}
const addresses = Array.isArray(config.addresses) ? config.addresses : [];
const catchAllAddress = addresses.length === 1 ? addresses[0] : undefined;
if (
  typeof catchAllAddress !== "string" ||
  !/^\*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
    catchAllAddress,
  ) ||
  isReservedDeploymentHostname(catchAllAddress.slice(2))
) {
  blockers.push(
    "configure exactly one non-placeholder *@domain inbound catch-all",
  );
}
if (blockers.length > 0) {
  console.error(
    `Deployment configuration is incomplete:\n- ${blockers.join("\n- ")}`,
  );
  process.exitCode = 1;
} else {
  console.log("Deployment configuration has no scaffold placeholders.");
}
