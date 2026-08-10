#!/bin/sh
set -eu

wrangler="/app/node_modules/.bin/wrangler"

for argument in "$@"; do
  case "$argument" in
    -h | --help | -v | --version)
      exec "$wrangler" "$@"
      ;;
  esac
done

case "${1:-}" in
  "" | login | logout | whoami)
    exec "$wrangler" "$@"
    ;;
esac

node /app/scripts/validate-cloudflare-account.mjs
exec "$wrangler" "$@"
