#!/bin/sh
set -eu

./node_modules/.bin/wrangler d1 migrations apply mail-parser \
  --config /app/wrangler.docker.jsonc \
  --local \
  --persist-to /data

exec ./node_modules/.bin/wrangler dev \
  --config /app/wrangler.docker.jsonc \
  --ip 0.0.0.0 \
  --port 8787 \
  --persist-to /data
