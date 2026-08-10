#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage: docker compose run --rm --build deploy [--rotate-admin-token]

Without options, an existing ADMIN_API_TOKEN is preserved. If the target Worker
is new or the token is missing, a new token is generated and displayed once
after the core Worker version is active and before trigger reconciliation.
Generation requires interactive confirmation.

  --rotate-admin-token  Generate and deploy a replacement token intentionally.
  -h, --help            Show this help.
EOF
}

rotate_admin_token=0
case "$#:${1:-}" in
  0:) ;;
  1:--rotate-admin-token) rotate_admin_token=1 ;;
  1:-h | 1:--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

echo "Checking the deployable source tree..."
npm run security:public

echo "Validating the production configuration..."
npm run config:deploy:check

echo "Running formatting, type, test, and Worker build checks..."
npm run format:check
npm run check
npm test
npm run build

umask 077
secret_file=""
core_config_file=""
wrangler_output_file=""
admin_token=""
cleanup() {
  if [ -n "$secret_file" ]; then
    rm -f -- "$secret_file"
  fi
  if [ -n "$core_config_file" ]; then
    rm -f -- "$core_config_file"
  fi
  if [ -n "$wrangler_output_file" ]; then
    rm -f -- "$wrangler_output_file"
  fi
  admin_token=""
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

echo "Inspecting the target Worker's admin-secret state..."
admin_token_state="$(node /app/scripts/admin-token-state.mjs)"
generate_admin_token=0
if [ "$rotate_admin_token" -eq 1 ] || [ "$admin_token_state" = "missing" ]; then
  generate_admin_token=1
elif [ "$admin_token_state" != "configured" ]; then
  echo "Unexpected admin-secret state; deployment stopped." >&2
  exit 1
fi

if [ "$generate_admin_token" -eq 1 ]; then
  if [ ! -t 0 ] || [ ! -t 1 ]; then
    echo "Generating or rotating ADMIN_API_TOKEN requires an interactive terminal and explicit confirmation." >&2
    exit 1
  fi

  printf "A new ADMIN_API_TOKEN will be generated and displayed once after the core Worker version is active. Continue? [y/N] "
  if ! IFS= read -r confirmation; then
    printf "\nUnable to read confirmation; deployment stopped.\n" >&2
    exit 1
  fi
  case "$confirmation" in
    y | Y | yes | YES | Yes) ;;
    *)
      echo "Deployment stopped without changing the admin token."
      exit 1
      ;;
  esac
  unset confirmation

  admin_token="$(openssl rand -base64 48)"
  secret_file="$(mktemp /tmp/gorelo-router-secrets.XXXXXX)"

  if ! printf "%s" "$admin_token" | node -e '
    const fs = require("node:fs");
    const token = fs.readFileSync(0, "utf8");
    if (!/^[A-Za-z0-9+/]{64}$/.test(token)) {
      console.error("OpenSSL returned an invalid ADMIN_API_TOKEN.");
      process.exit(1);
    }
    const decoded = Buffer.from(token, "base64");
    if (decoded.length !== 48 || decoded.toString("base64") !== token) {
      console.error("OpenSSL returned an invalid ADMIN_API_TOKEN.");
      process.exit(1);
    }
    process.stdout.write(JSON.stringify({ ADMIN_API_TOKEN: token }));
  ' > "$secret_file"; then
    exit 1
  fi
fi

echo "Initializing the D1 schema..."
npm run db:migrate:remote

core_config_file="$(mktemp /app/wrangler.core-deploy.XXXXXX.jsonc)"
node /app/scripts/create-core-deploy-config.mjs \
  /app/wrangler.jsonc \
  "$core_config_file"
wrangler_output_file="$(mktemp /tmp/gorelo-router-wrangler-output.XXXXXX)"
export WRANGLER_OUTPUT_FILE_PATH="$wrangler_output_file"

core_deploy_status=0
if [ "$generate_admin_token" -eq 1 ]; then
  echo "Deploying the core Worker version with its generated admin secret..."
  if ! ./node_modules/.bin/wrangler deploy \
    --config "$core_config_file" \
    --secrets-file "$secret_file"; then
    core_deploy_status=1
  fi
else
  echo "Deploying the core Worker version while preserving its existing admin secret..."
  if ! ./node_modules/.bin/wrangler deploy \
    --config "$core_config_file"; then
    core_deploy_status=1
  fi
fi
unset WRANGLER_OUTPUT_FILE_PATH

core_deploy_confirmed=0
if [ "$core_deploy_status" -eq 0 ] && \
  node /app/scripts/validate-deploy-result.mjs "$wrangler_output_file"; then
  core_deploy_confirmed=1
fi

if [ "$core_deploy_confirmed" -ne 1 ]; then
  if [ "$generate_admin_token" -eq 1 ]; then
    echo "Worker activation could not be confirmed. The generated ADMIN_API_TOKEN might be active; save the value shown on the attached terminal temporarily for incident checks, then rerun with --rotate-admin-token to establish a new known token." >&2
    printf '\nPossibly active ADMIN_API_TOKEN:\n\n%s\n\n' "$admin_token"
  else
    echo "Core Worker activation could not be confirmed. The existing ADMIN_API_TOKEN was not intentionally rotated; rerun the ordinary deployment." >&2
  fi
  exit 1
fi

if [ "$generate_admin_token" -eq 1 ]; then
  printf '\nA new ADMIN_API_TOKEN is active. Save it in your password manager now; Cloudflare cannot reveal it later:\n\n%s\n\n' "$admin_token"
  admin_token=""
  rm -f -- "$secret_file"
  secret_file=""
fi
rm -f -- "$core_config_file" "$wrangler_output_file"
core_config_file=""
wrangler_output_file=""

echo "Reconciling HTTP, schedule, and Email Routing triggers..."
if ! ./node_modules/.bin/wrangler triggers deploy; then
  echo "The Worker version is active, but trigger reconciliation did not complete. Keep the active ADMIN_API_TOKEN and rerun the ordinary deployment without rotation." >&2
  exit 1
fi
