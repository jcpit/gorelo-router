#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage: docker compose run --rm --build deploy [--rotate-admin-token]

Without options, an existing ADMIN_API_TOKEN is preserved. If the target Worker
is new or the token is missing, a new token is generated and displayed once
after a successful deployment. Generation requires interactive confirmation.

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
admin_token=""
cleanup() {
  if [ -n "$secret_file" ]; then
    rm -f -- "$secret_file"
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

  printf "A new ADMIN_API_TOKEN will be generated and displayed once after deployment. Continue? [y/N] "
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

if [ "$generate_admin_token" -eq 1 ]; then
  echo "Deploying Gorelo Router and its generated admin secret atomically..."
  ./node_modules/.bin/wrangler deploy --secrets-file "$secret_file"
  printf '\nA new ADMIN_API_TOKEN is active. Save it in your password manager now; Cloudflare cannot reveal it later:\n\n%s\n\n' "$admin_token"
else
  echo "Deploying Gorelo Router while preserving its existing admin secret..."
  ./node_modules/.bin/wrangler deploy
fi
