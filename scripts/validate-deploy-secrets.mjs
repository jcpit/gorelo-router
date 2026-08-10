import { inspectAdminTokenState } from "./admin-token-state.mjs";

try {
  if (inspectAdminTokenState() === "configured") {
    console.log("Required deployment secrets are configured.");
  } else {
    console.error(
      "Deployment is missing required Worker secrets:\n- ADMIN_API_TOKEN",
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
