# Security policy

## Reporting a vulnerability

Do not include credentials, customer mail, tenant identifiers, or other sensitive data in a public issue. Use GitHub's private vulnerability reporting for this repository when available. If that channel is unavailable, ask the repository owner for a private contact method without disclosing the vulnerability details publicly.

## Secrets and local data

Cloudflare, Gorelo, webhook, and administrator credentials belong in Cloudflare Worker secrets or the ignored local `.dev.vars` file. Never place them in Wrangler variables, rules, webhook records, fixtures, screenshots, logs, or documentation.

Deployment account IDs, hostnames, and routing addresses belong in the ignored
`wrangler.production.jsonc`. They are not authentication secrets, but they can
identify a customer or tenant. Never force-add or publish that file, and do not
assume a credential scanner can recognize every operational identifier copied
to another filename.

The Compose services run as UID/GID `1000`. On native Linux, keep local config
owner-writable only and grant that container identity read-only access with a
narrow ACL or group-read permission. Do not solve bind-mount errors by making a
secret file world-writable.

Run `docker compose run --rm --build public-check` before committing or pushing.
It scans the mounted checkout, including files excluded from the application
image, for prohibited files and secret-like content. It prints only the affected
filename, line number, and rule—not the candidate value. GitHub Actions repeats
the check against Git's exact publication candidate set.

If a secret is ever committed, revoke or rotate it immediately. Removing it from the current tree or rewriting Git history does not invalidate the exposed credential.
