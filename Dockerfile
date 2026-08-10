# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS dependencies

ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    WRANGLER_SEND_METRICS=false

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS source

COPY . .

FROM dependencies AS public-check

RUN apt-get update \
    && apt-get install --yes --no-install-recommends git \
    && git config --system --add safe.directory /workspace \
    && rm -rf /var/lib/apt/lists/*

COPY scripts/verify-public-tree.mjs /app/scripts/verify-public-tree.mjs

USER node
WORKDIR /workspace

ENTRYPOINT ["node", "/app/scripts/verify-public-tree.mjs"]
CMD []

FROM source AS test

RUN npm run security:public \
    && npm run format:check \
    && npm run check \
    && npm test \
    && npm run build

FROM source AS tooling

RUN chown node:node /app \
    && install -d -o node -g node /home/node/.config/.wrangler \
    && chmod 0755 /app/scripts/cloudflare-deploy.sh

USER node

ENTRYPOINT ["./node_modules/.bin/wrangler"]
CMD ["--help"]

FROM tooling AS deployment

ENTRYPOINT ["/app/scripts/cloudflare-deploy.sh"]
CMD []

FROM source AS development

ENV NODE_ENV=development

RUN chown node:node /app \
    && install -d -o node -g node /app/.wrangler /app/node_modules/.mf /data \
    && chmod 0755 /app/scripts/container-entrypoint.sh

USER node

EXPOSE 8787

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/healthz').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"]

CMD ["/app/scripts/container-entrypoint.sh"]
