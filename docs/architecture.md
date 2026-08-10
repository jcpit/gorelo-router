# Architecture and production notes

## Boundaries

Cloudflare Email Routing owns SMTP receipt and the live `ForwardableEmailMessage`. The top-level Wrangler `addresses` declaration makes deployment reconcile one `*@domain` catch-all to this Worker; the Worker owns recipient-specific inspection, ordered rule evaluation, client identity resolution, delivery audit, and routing. An explicit Cloudflare Email Routing rule takes precedence over the catch-all, so any address configured there bypasses Gorelo Router entirely. Gorelo's native inbound address owns the default email-to-ticket conversion; opt-in structured rules use Gorelo's ticket or alert API instead.

The normal forward path deliberately does not call `POST /v1/tickets`: Gorelo's native inbound route preserves message and attachment semantics that its structured ticket API cannot reproduce. A matching rule may add a signed webhook action after the primary forward. An explicit `create_ticket` or `create_alert` rule is API-only on its primary path: it requires a private `MESSAGE_ARCHIVE` and sends only mapped fields to Gorelo instead of calling `message.forward()`. A definitive failure may still use the explicit failure route. An internal quarantine is different again—it retains the exact RFC 5322 message in private R2 until a reviewer dismisses or releases it.

## Processing sequence

```text
envelope + headers + size
          │
          ▼
ordered tri-state rule evaluation ── conclusive ──► decision
          │                                           │
      needs content                            ARCHIVE_MODE policy
          ▼                                           │
MAX_PARSE_BYTES guard                                  ▼
          │                                  private R2 raw object
          ▼                                           │
bounded MIME parse → final decision ───────┬──────────┬──────────┬──────────┐
                                           ▼          ▼          ▼          ▼
                                        forward   API-only   internal  reject/drop
                                                     │       hold
                                              R2 raw + D1     │
                                               delivery      ▼
                                                  │      D1 review
                                                  ▼
                                           Gorelo ticket/alert
```

1. Build envelope/header facts without consuming the raw stream.
2. Normalize configuration and load ordered D1 rules.
3. Score the decoded subject and evaluate rules as match, no match, or needs MIME.
4. Parse MIME only when a potentially decisive rule requires body/attachment facts; reject or use the explicit failure route when the message exceeds `MAX_PARSE_BYTES`.
5. Record a bounded audit snapshot: sanitized headers, safe text preview, attachment facts, spam threshold/reasons, decision reason, and processing trace.
6. Apply `ARCHIVE_MODE`: `none` stores no routine raw messages, `quarantine` stores quarantine decisions, and `all` stores every decision. Internal quarantine and API-only Gorelo actions always archive regardless of this setting.
7. Before a forward or mailbox-quarantine handoff, synchronously create its D1 event in an unconfirmed failure state; do not call `message.forward()` if that insert fails. After Cloudflare accepts the forward request, update the event to `forwarded` or `quarantined`. Drop and reject decisions are also recorded before the irreversible action. Internal holds and structured actions synchronously commit their R2/D1 state before any downstream step.
8. For `forward_webhook`, atomically commit the message event and a pending idempotent delivery snapshot before the primary forward. Resolve only the destination ID/version/digest captured in that snapshot, send the signed webhook only after Cloudflare accepts the forward, and record every attempt. Webhook failure does not undo or duplicate the primary Gorelo forward.
9. For `create_ticket` or `create_alert`, resolve an imported current client, render a bounded credential-free PascalCase request, persist its delivery snapshot, and make one Gorelo create attempt. Update the event and delivery audit with the confirmed, failed, or uncertain result. A definitive failure can use the explicit failure route; an uncertain result is retained without fallback.

This preserves rule order without treating unavailable MIME content as empty. It also lets a high-priority envelope or size rule protect the parsing path.

## Quarantine modes and review states

`QUARANTINE_MODE=mailbox` preserves the traditional disposition: after the Worker creates its D1 audit event, Cloudflare forwards to the rule destination or `QUARANTINE_ADDRESS`. That mailbox owns review and release. An R2 copy may exist under `ARCHIVE_MODE`, but mailbox mode is not an in-app hold or release queue.

`QUARANTINE_MODE=internal` requires `MESSAGE_ARCHIVE`. The Worker stores the original under an opaque `messages/YYYY/MM/DD/<uuid>.eml` key, records its SHA-256, synchronously creates a version-1 `pending` item, and returns without forwarding. Review transitions use conditional D1 updates:

```text
pending ──release──► releasing ──confirmed completion──► released
   │                     ├─ definite pre-dispatch failure ──► release_failed ──retry──┐
   │                     └─ dispatch/audit ambiguity ───────► releasing (uncertain)   │
   └────────dismiss─────────────────────────────────────────► dismissed               │
                                                                                    └─► releasing
```

Every mutation increments `version`; stale requests receive `409 Conflict`. Review actions are append-only. Only failures that occur while reading or preparing the retained message, before the send binding is invoked, become retryable `release_failed`. Once dispatch begins, an exception cannot prove that Cloudflare did not accept the message, and a later D1 failure cannot erase that possibility. Those paths record `release_uncertain` with a fixed credential-free reason when D1 remains available and stay in non-actionable `releasing`; if even that audit write fails, the original `releasing` transition still blocks retry. Operators must verify the destination before manual remediation.

## Release delivery and provenance

Release uses Cloudflare Email Sending through the optional, restricted `RELEASE_EMAIL` `send_email` binding and requires `RELEASE_FROM_ADDRESS`. The production scaffold omits both so forward-only deployments have no Email Sending prerequisite; operators add them together when enabling release. The destination must also pass the application's `ALLOWED_FORWARD_DESTINATIONS` check. Cloudflare documents both the [Workers sending API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/) and [binding sender/recipient restrictions](https://developers.cloudflare.com/email-service/configuration/send-bindings/).

The archived MIME body and attachments are retained, but obsolete relay/authentication headers are removed. The released message uses service-controlled `From: Gorelo Router <RELEASE_FROM_ADDRESS>` and `To`; original visible addresses become `X-Mail-Parser-Original-From` and `X-Mail-Parser-Original-To`; original envelope provenance and the release ID are added as `X-` headers. If no original `Reply-To` exists, the original envelope sender becomes `Reply-To`. This gives the outbound message an authenticated service identity without erasing provenance.

## Client identity directory

The optional Gorelo API key is a Worker secret and is used only with an exact regional origin. Client import validates and bounds every catalog page, then atomically upserts a D1 snapshot. Missing clients are retained as stale so operator aliases are not silently deleted.

Each client can own multiple aliases in every scope. Alias batches are bounded to 100 entries and inserted in one SQL statement, so a duplicate or existing assignment rejects the entire batch. Updates and deletes use optimistic versions. Aliases use NFKC normalization plus exact comparison. Resolution order is scoped alias, global alias, exact current catalog fields (name, billing name, alternate name, domain). A stale alias match is terminal rather than falling through. Alias creation and editing reject values that equal another current client's catalog identity; if a later import introduces that collision, resolution returns `ambiguous`. No fuzzy or precedence shortcut chooses a customer. Setup groups aliases under their client and scope and provides an authenticated resolution preview.

## Structured Gorelo ticket and alert delivery

Structured actions require `GORELO_API_KEY`, the exact configured Australia or US endpoint, a private `MESSAGE_ARCHIVE` binding, and a successfully imported current client directory. Gorelo documents scoped `X-API-Key` authentication, regional origins, and the `401`, `403`, and `429` error meanings in its [API overview](https://help.gorelo.io/api-overview). The regional [Australia](https://api.aue.gorelo.io/swagger) and [US](https://api.usw.gorelo.io/swagger) Swagger references define the official `POST /v1/tickets` and `POST /v1/alerts/` endpoints and their PascalCase request contract.

Both action types reuse the bounded, literal-delimiter extraction engine. A rule must select exactly one client strategy: a fixed current `clientId`, or a `clientIdentityField` whose extracted value resolves through scoped/global aliases and exact catalog identities. Templates substitute only `{{field_key}}` values that the same rule declares; there is no executable expression language. A ticket requires title, status, group, and type, and may associate a fixed-client location, primary/CC contacts, users, tags, or agent assets returned by the imported catalogs. Custom assets and uptime IDs are rejected until the integration has a trustworthy catalog selector for them. Alert creation requires name, client, and resource; severity is an integer from 1 through 4. Gorelo's current help names 1 as Critical, 2 as Error, and 3 as Warning, but does not name 4, so the UI intentionally presents it only as “Severity 4”; see [Gorelo's alert overview](https://help.gorelo.io/alerts-overview).

The API payload cannot carry the original RFC 5322 structure or attachments. Before preparing a provider call, the Worker retains the original privately and synchronously creates the event and delivery records. D1 stores the bounded variables, resolved client, region, exact request snapshot and digest, safe result category, immutable attempts, and provider ticket ID when returned. The alert endpoint confirms success without returning an alert ID. D1 never stores the API key or request authentication headers. The authenticated Dry run endpoint prepares the same mapping preview but does not call Gorelo.

Gorelo's create contract does not expose an external idempotency key. The ledger prevents duplicate local claims, but it cannot prove that Gorelo rejected a request when a connection drops after dispatch. Preflight failures and definitive 4xx responses are terminal `failed` deliveries. A rate limit is also terminal rather than automatically replayed. Definitive failures use `FAILURE_FORWARD_ADDRESS` (or its configured quarantine fallback) when available and otherwise reject. Network errors, timeouts, 5xx responses, invalid/oversized responses, and claims abandoned after dispatch become `uncertain`. Failed and uncertain Gorelo creates are never automatically replayed; the scheduled worker processes only durable rows that have never been claimed. Uncertain creates specifically never trigger a forwarding fallback. An operator must check Gorelo and the retained audit before deciding what to do.

## Signed webhook delivery

Webhook destinations are registered separately from rules. The server accepts only HTTPS URLs on exact public DNS hostnames in `ALLOWED_WEBHOOK_HOSTS`; it rejects credentials, fragments, custom ports, IP literals, local/internal names, and sensitive query-parameter names. Rules store a destination ID, never a URL. Each durable delivery binds that ID to the selected destination version and a SHA-256 digest of the canonical endpoint, so a later edit cannot silently redirect queued client data.

Fields use literal delimiters rather than regular expressions or executable templates. The resulting variable object is bounded and becomes the non-secret D1 delivery snapshot. Each POST includes an event ID, durable delivery/idempotency ID, Unix timestamp, and `v1=` HMAC-SHA256 signature over `timestamp + "." + exact JSON bytes`. The shared signing key exists only as `WEBHOOK_SIGNING_SECRET`.

Delivery uses optimistic claims and immutable attempt rows. Definitive 4xx failures stop. Explicit HTTP `429`/5xx responses receive bounded retry scheduling for at most five total automatic attempts. Network errors and timeouts are `uncertain` and are not automatically resent because request acceptance cannot be disproved. The five-minute cron first reconciles claims abandoned for more than ten minutes to `uncertain`, then processes only due retryable HTTP failures. Destination drift also becomes `uncertain`. Overlapping triggers are safe because only one expected version can claim or reconcile a delivery.

## Audit and admin surface

The self-hosted Tabler dashboard has five workspaces:

- **Rules**: guided and JSON editing, templates, ordering, enable/disable, extraction mapping, structured Gorelo catalog selectors, and deletion. Custom-asset and uptime IDs are rejected until they can be selected from a trustworthy catalog.
- **Quarantine**: state counts, filtering/search, safe content detail, EML download, review timeline, and versioned Release/Dismiss actions when supported by runtime capabilities.
- **Audit**: recent decision summaries and hydrated detail including spam analysis, sanitized headers, body preview, attachments, processing trace, archive availability and authenticated EML download, mapped variables, resolved Gorelo clients, provider IDs, and immutable delivery attempts.
- **Dry run**: policy and structured-mapping evaluation without delivery or storage. It never creates a Gorelo ticket or alert.
- **Setup**: non-secret, enabled-rule-aware readiness; Gorelo connection/catalog checks; current-client import; grouped one-to-many global/source-scoped alias management and resolution preview; and registered webhook destinations. Readiness requires the integrations actually used by enabled rules, including current Gorelo clients and enabled webhook destinations. Secret values are never entered or returned in the browser.

Every new D1 reference to a retained R2 object pins its SHA-256. Authenticated raw download and quarantine release perform a bounded read and verify the stored size and any pinned digest before using the bytes. The detail API applies the same verification before parsing an object that is within `MAX_PARSE_BYTES`; on verification failure it keeps the existing bounded audit snapshot instead of hydrating from untrusted bytes. Raw content is served only as an authenticated attachment with no-store caching, `nosniff`, and a sandbox CSP.

## Retention and storage consistency

The daily cron derives a cutoff from `EVENT_RETENTION_DAYS`. It repeatedly deletes expired R2 objects first, clears their private D1 archive references, and then deletes processing records; quarantine items and action history cascade. If R2 is unavailable while an expired D1 row still references an object, cleanup stops rather than deleting the only pointer.

Configure a bucket lifecycle slightly longer than D1 retention as an orphan safety net. R2 lifecycle deletion is not instantaneous; see [object lifecycle behavior](https://developers.cloudflare.com/r2/buckets/object-lifecycles/). R2 automatically encrypts objects and metadata at rest, but the bucket must remain private; see [R2 data security](https://developers.cloudflare.com/r2/reference/data-security/).

## Safe defaults and failure model

- `SPAM_ACTION=forward` observes the transparent subject/envelope heuristic without diverting mail. It is not antivirus, phishing detection, or sender authentication.
- `QUARANTINE_MODE` defaults to `mailbox`; `ARCHIVE_MODE` defaults to `quarantine`.
- Trusted envelope-sender domains only subtract score; they are not authentication or allow-list decisions. Dynamic client mapping must therefore use a dedicated parser recipient plus independently authenticated upstream source; an exact alias prevents fuzzy misrouting but does not establish trust.
- A matching forward, webhook, ticket, or alert rule cannot bypass non-forward global spam policy without explicit `bypassSpam: true`.
- Failure routing uses `FAILURE_FORWARD_ADDRESS`, then `QUARANTINE_ADDRESS`, and never silently falls through to normal Gorelo delivery.
- Dynamic destinations are validated in the application and constrained again by Cloudflare bindings/verified addresses.
- User regular expressions are excluded; wildcard matching uses a bounded bitset automaton.
- Admin tokens are compared through SHA-256 digests and retained only in dashboard memory.
- Webhook URLs are centrally registered against an exact host allowlist; rule content cannot choose a URL.
- Webhook signatures, timestamps, and idempotency IDs let receivers authenticate and deduplicate requests without putting credentials in D1.
- API-only Gorelo actions require a current exact client, private raw retention, and one locally claimed provider attempt. Uncertain creates are never automatically replayed or fallback-forwarded.

An internal hold fails closed if R2 or its D1 review insert fails; any partial object is removed before the failure route/rejection. Ordinary forward and mailbox-quarantine paths synchronously insert a provisional event before calling Cloudflare, and forward-plus-webhook paths atomically insert both the event and pending delivery. A successful handoff is recorded only after `message.forward()` returns, but that status proves Cloudflare accepted the request—not final downstream mailbox delivery. If the completion update fails, the provisional failure state remains and the Worker never replays the primary forward automatically. Hard Worker CPU/memory termination remains outside JavaScript recovery.

## Security and privacy

Raw EML, bounded body previews, addresses, headers, filenames, and review notes are client data. Retained messages may contain malware. Use least-privilege bindings, a private bucket, short contractual retention, and a specialist mail-security layer for malware, phishing, BEC, URL reputation, and attachment-content inspection.

Protect the HTTP application with Cloudflare Access and disable alternate direct routes. Review actions use the Access email only when both identity and assertion headers are present, but the Worker does not cryptographically verify that JWT itself. Without an enforced Access boundary, the recorded name can be spoofed by a bearer-token holder and falls back to `admin-api`; it is not non-repudiable identity.

## Production hardening checklist

- Use a dedicated ingestion subdomain when another provider handles corporate mail.
- Observe scores before enabling quarantine/drop/reject.
- Create the private `MESSAGE_ARCHIVE` bucket and a lifecycle rule slightly longer than `EVENT_RETENTION_DAYS`.
- Initialize D1 from the single first-release baseline and keep the `MESSAGE_ARCHIVE` bucket private.
- When enabling automated release, onboard the release sender domain, add the otherwise optional `send_email` binding and `RELEASE_FROM_ADDRESS`, restrict the binding to exact sender/Gorelo addresses, and live-test threading, sender association, and attachments.
- Put a metadata-only size rule before body/attachment rules and align it with `MAX_PARSE_BYTES`.
- Save the one-time, OpenSSL-generated `ADMIN_API_TOKEN` immediately; rotate it
  only through the explicit deployment option, and never commit or log it.
- Give `GORELO_API_KEY` only the scopes needed for enabled structured features, and keep the region endpoint exact.
- Import current Gorelo clients, configure all aliases, and test exact resolution before enabling API-only rules.
- Test structured mappings with Dry run and fake clients; do not use a production key for test creates.
- Generate and rotate a random `WEBHOOK_SIGNING_SECRET`; configure exact destination hosts and verify receiver-side timestamp/signature checks.
- Monitor Worker exceptions, R2/D1 failures, `release_failed`/long-running `releasing`, and quarantine volume.
- Monitor failed/uncertain outbound deliveries; investigate uncertain attempts before any manual remediation.
- Verify `/api/v1/readiness` after every schema, binding, enabled-rule, client-import, or webhook-destination change.
- Use Workers Paid for representative large multipart workloads.

## Future extensions

- Last-known-good rule snapshots for short D1 outages.
- Per-rule counters in Analytics Engine without additional PII.
- Cryptographically verified Access JWT actors and rule-mutation audit history.
- Queue-backed higher-throughput delivery while retaining the same D1 claim ledger and uncertain-outcome boundary.
