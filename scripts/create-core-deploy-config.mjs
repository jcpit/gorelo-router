import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { experimental_readRawConfig } from "wrangler";

export function createCoreDeployConfig(config) {
  const {
    addresses: _addresses,
    route: _route,
    routes: _routes,
    triggers: _triggers,
    ...coreConfig
  } = config;
  return coreConfig;
}

export function writeCoreDeployConfig(sourcePath, destinationPath) {
  const { rawConfig } = experimental_readRawConfig({ config: sourcePath });
  const coreConfig = createCoreDeployConfig(rawConfig);
  writeFileSync(destinationPath, `${JSON.stringify(coreConfig, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

const invokedAsScript =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedAsScript) {
  const [, , sourcePath, destinationPath] = process.argv;
  if (!sourcePath || !destinationPath) {
    console.error(
      "Usage: node create-core-deploy-config.mjs <source> <destination>",
    );
    process.exitCode = 2;
  } else {
    try {
      writeCoreDeployConfig(sourcePath, destinationPath);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
