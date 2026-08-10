import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:email": resolve(projectDirectory, "test/cloudflare-email.ts"),
    },
  },
  test: {
    environment: "node",
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
