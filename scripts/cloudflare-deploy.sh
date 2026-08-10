#!/bin/sh
set -eu

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
secret_file="$(mktemp /tmp/gorelo-router-secrets.XXXXXX)"
terminal_echo_disabled=0
cleanup() {
  if [ "$terminal_echo_disabled" -eq 1 ]; then
    stty echo 2>/dev/null || true
  fi
  rm -f -- "$secret_file"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

printf "ADMIN_API_TOKEN (32+ characters; input hidden): "
if [ -t 0 ]; then
  stty -echo
  terminal_echo_disabled=1
fi
if ! IFS= read -r admin_token; then
  printf "\nUnable to read ADMIN_API_TOKEN.\n" >&2
  exit 1
fi
if [ "$terminal_echo_disabled" -eq 1 ]; then
  stty echo
  terminal_echo_disabled=0
fi
printf "\n"

if ! printf "%s" "$admin_token" | node -e '
  const fs = require("node:fs");
  const token = fs.readFileSync(0, "utf8");
  const byteLength = new TextEncoder().encode(token).byteLength;
  if (
    token !== token.trim() ||
    token.length < 32 ||
    byteLength > 4096 ||
    /[\u0000-\u001f\u007f]/.test(token) ||
    token === "replace-with-a-long-random-token"
  ) {
    console.error("ADMIN_API_TOKEN must be a non-placeholder value of at least 32 characters and at most 4096 bytes, without control characters or surrounding whitespace.");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify({ ADMIN_API_TOKEN: token }));
' > "$secret_file"; then
  exit 1
fi
unset admin_token

echo "Initializing the D1 schema..."
npm run db:migrate:remote

echo "Deploying Gorelo Router and its required admin secret atomically..."
./node_modules/.bin/wrangler deploy --secrets-file "$secret_file"
