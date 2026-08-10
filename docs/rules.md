# Rule reference

Rules are evaluated by ascending `priority`; `0` runs before `10`, which runs before `100`. When priorities tie, the oldest rule runs first. The first enabled matching rule supplies the action.

There is one deliberate exception: when a matching action is `forward`, `forward_webhook`, `create_ticket`, or `create_alert`, the message is locally classified as spam, and global `SPAM_ACTION` is not `forward`, the global spam action overrides that route. Set `"bypassSpam": true` only when an explicit rule should bypass spam policy.

If no rule matches, the global spam action runs for messages at or above
`SPAM_THRESHOLD`; all other messages use the mailbox currently marked as the
persistent default.

## Shape

```json
{
  "name": "Route monitoring vendor",
  "description": "Known vendor alerts to a dedicated Gorelo route",
  "priority": 100,
  "enabled": true,
  "match": "all",
  "conditions": [
    {
      "field": "from_domain",
      "operator": "equals",
      "value": "vendor.example",
      "caseSensitive": false
    }
  ],
  "action": {
    "type": "forward",
    "mailboxId": "replace-with-a-named-mailbox-id",
    "bypassSpam": false
  }
}
```

`description`, `priority`, `enabled`, `match`, `caseSensitive`, and `bypassSpam` have defaults. Sending the normalized object returned by the API is the easiest way to update a rule.

## Fields

| Field             | Runtime value                                     | Requires MIME parsing |
| ----------------- | ------------------------------------------------- | --------------------- |
| `from`            | Envelope sender address                           | No                    |
| `from_domain`     | Domain of the envelope sender                     | No                    |
| `to`              | Envelope recipient, including `+detail`           | No                    |
| `to_local_part`   | Recipient local part, including `+detail`         | No                    |
| `subject`         | Decoded subject                                   | No                    |
| `header`          | Named header; set `headerName`                    | No                    |
| `message_size`    | Raw message size in bytes                         | No                    |
| `spam_score`      | Subject-only score computed by this Worker        | No                    |
| `body_text`       | Bounded plain text plus visible HTML-derived text | Yes                   |
| `attachment_name` | Each decoded attachment filename                  | Yes                   |
| `has_attachments` | Boolean attachment presence                       | Yes                   |

`from` and `from_domain` come from the SMTP envelope. They are useful routing hints, not proof of an authenticated identity. Plus-address detail has the same limitation.

### Bounded MIME behavior

Evaluation is priority-aware. The Worker first evaluates facts available without MIME parsing:

- A conclusive metadata/header/size rule can act without parsing, even if lower-priority content rules exist.
- When evaluation reaches a rule whose outcome genuinely depends on body or attachment facts, MIME parsing becomes necessary.
- If that message exceeds `MAX_PARSE_BYTES`, the Worker invokes the configured processing-failure route. It does not treat unknown content as empty or silently skip the rule. With no failure-forward or quarantine-mailbox address, the message is rejected.

Put a `message_size` rule at a strictly lower priority number than every content rule when large messages need deterministic rejection or forwarding. Align its byte threshold with `MAX_PARSE_BYTES`; the dashboard's size template demonstrates this ordering.

Only the first `MAX_BODY_CHARACTERS` of text is searchable. HTML conversion scans no more than `MAX_HTML_SCAN_CHARACTERS`. MIME parsing and filename/body matching are routing conveniences, not complete security inspection.

## Operators

| Operator                   | Expected value                                      | Meaning                                                        |
| -------------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| `equals`, `not_equals`     | string, number, or boolean appropriate to the field | Equality                                                       |
| `contains`, `not_contains` | string                                              | Substring                                                      |
| `starts_with`, `ends_with` | string                                              | Prefix or suffix                                               |
| `wildcard`                 | string                                              | Whole-value glob; `*` is any sequence and `?` is one character |
| `in`                       | array of strings                                    | Exact match to one member                                      |
| `gte`, `lte`               | number                                              | Numeric comparison for size or score                           |
| `exists`                   | no value                                            | Non-empty header/body, or attachment presence                  |

Wildcards are not regular expressions; the implementation uses a bounded bitset automaton with no regex backtracking. Conditions over several attachment filenames match when any filename satisfies a positive operator. Negative attachment operators require every filename to satisfy the negative comparison. `exists` is restricted to `header`, `body_text`, `attachment_name`, and `has_attachments`.

## Actions

- `{"type":"forward"}` is the intentional default-following form. It resolves the
  current default named mailbox and respects a non-forward spam policy.
- `{"type":"forward","mailboxId":"..."}` pins the rule to a registered
  named Gorelo mailbox by stable ID.
- `{"type":"forward","destination":"..."}` remains supported for legacy
  rules and selects an allow-listed, Cloudflare-verified literal address. The
  guided editor offers either default-following behavior or a pinned
  `mailboxId`; it does not create new literal destinations.
- `{"type":"forward","bypassSpam":true}` explicitly bypasses global spam handling after that rule matches.
- `{"type":"forward_webhook",...}` keeps the same primary email forward, but first atomically stores the event and pending delivery snapshot. After Cloudflare accepts the forward, it asynchronously sends a signed, idempotent webhook containing explicitly mapped variables. It never turns the webhook URL or signing secret into rule data.
- `{"type":"create_ticket",...}` creates one structured Gorelo ticket through `POST /v1/tickets`. It is API-only and does not forward the original email.
- `{"type":"create_alert",...}` creates one external Gorelo alert through `POST /v1/alerts/`. It is API-only and does not forward the original email.
- `{"type":"quarantine"}` creates a reviewable R2-backed hold when `QUARANTINE_MODE=internal`; its rule destination is ignored because the release destination is chosen during review.
- In `QUARANTINE_MODE=mailbox`, `{"type":"quarantine"}` forwards to `QUARANTINE_ADDRESS` after its audit insert, while `{"type":"quarantine","destination":"..."}` selects another allow-listed, Cloudflare-verified review mailbox.
- `{"type":"drop"}` silently accepts and discards the message. Use only for high-confidence blocks.
- `{"type":"reject","reason":"..."}` returns an SMTP rejection to the sending server.

Mailbox quarantine is not an in-app hold: the review mailbox owns disposition and release. `ARCHIVE_MODE=quarantine` or `all` may retain an audit copy, but only internal quarantine items are actionable in the dashboard. Internal release requires an allow-listed Gorelo destination selected by an authenticated operator.

Forwarding remains the normal choice when Gorelo should receive the original sender, MIME structure, and attachments. API-only actions send a bounded structured JSON request instead. They require `GORELO_API_KEY`, private `MESSAGE_ARCHIVE`, and an imported current client directory. Gorelo's [API overview](https://help.gorelo.io/api-overview) documents scoped `X-API-Key` authentication and links the regional [Australia](https://api.aue.gorelo.io/swagger) and [US](https://api.usw.gorelo.io/swagger) Swagger references.

### Named Gorelo mailboxes

**Setup → Gorelo mailboxes** gives forwarding addresses operator-friendly names
and maintains exactly one persistent default. `DEFAULT_GORELO_ADDRESS` creates
the initial mailbox/default only when the registry is empty. Once initialized,
changing that deployment variable never silently rewrites the registry or
changes the selected default.

The guided editor makes the choice explicit: follow the current default by
omitting both destination fields, or pin the rule to one stable `mailboxId`.
Changing the default affects unmatched mail and default-following rules; it
does not change a pinned rule. Renaming a mailbox also preserves the reference.
A disabled, missing, or no-longer-allow-listed mailbox cannot be routed to and
must be corrected before its rules are enabled.

The registry is not an escape hatch around deployment controls. Every mailbox
address and every legacy literal `destination` must appear in
`ALLOWED_FORWARD_DESTINATIONS` and be independently verified by Cloudflare.
`mailboxId` and `destination` are mutually exclusive on the same action.

### Webhook extraction fields

A `forward_webhook` action identifies a registered destination by ID and maps one to 50 fields. Each field has a safe `key` and one source: `from`, `from_domain`, `to`, `to_local_part`, `subject`, `body_text`, `message_id`, `header`, or `literal`.

- `header` requires `headerName`; `literal` requires `value`.
- `startAfter` and `endBefore` select text between literal delimiters. Matching is case-insensitive by default and never evaluates a regular expression or template language.
- `required: true` records a failed webhook delivery when a delimiter/value is missing. The primary email forward remains successful.
- `defaultValue` supplies an optional fallback. `maxCharacters` defaults to 1,000 and cannot exceed 4,000.
- `clientIdentityField` can name one extracted field. Its value is resolved by scoped alias, global alias, then exact Gorelo name, billing name, alternate name, or domain. Ambiguous and missing matches fail the webhook safely; they are never guessed.
- A Gorelo client can have multiple aliases. Setup accepts up to 100 newline-separated aliases in one atomic batch, groups them by scope, supports version-safe edits, and can preview the exact resolution before a rule is enabled.
- A `body_text` extraction forces bounded MIME parsing even when the rule conditions use envelope facts only.

The extracted variable map is capped below the 64 KiB durable-delivery snapshot limit. For a matching inbound message, the Worker atomically stores that pending snapshot with the message event before requesting the primary forward. The webhook is eligible to send only after the forward succeeds and only to the registered, enabled destination version bound into the snapshot.

### Structured Gorelo extraction and mapping

`create_ticket` and `create_alert` reuse the same one-to-50 `fields` array and literal extraction rules. Their templates may contain fixed text and `{{field_key}}` placeholders. Every placeholder must reference a key declared by that action; missing braces, unknown keys, executable expressions, and control characters are rejected. `body_text` extraction still forces bounded MIME parsing.

An extracted client identity is sender-controlled input even when it resolves exactly through an alias. Use dynamic client resolution only on a dedicated parser recipient whose source is independently authenticated upstream. The Worker requires a current imported directory and fails closed on missing, stale, or ambiguous aliases, but aliases do not authenticate the sender.

Every structured action must choose exactly one client strategy:

- `clientId` fixes the rule to one imported, current Gorelo client.
- `clientIdentityField` names an extraction key. Its value resolves by the optional `clientAliasScope` first, then a global alias, then an exact current name, billing name, alternate name, or domain. The scope defaults to `global`.

Setup is a one-to-many alias manager: each customer may have any number of global and source-scoped aliases. An operator can add up to 100 newline-separated aliases atomically, group and edit them with optimistic versions, and preview the exact result. A stale exact alias stops resolution without falling through. Aliases cannot equal another current client's exact catalog identity, and a later import that creates such a collision makes resolution ambiguous. Stale, missing, and ambiguous clients stop the API action without guessing.

Ticket rules map to Gorelo's official PascalCase request fields:

| Rule property               | Gorelo request field         | Constraint                                                              |
| --------------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| `titleTemplate`             | `Title`                      | Required; rendered value 1–998 characters                               |
| client selection            | `ClientId`                   | Required by this parser; fixed current ID or exact extracted resolution |
| `statusId`                  | `StatusId`                   | Required positive catalog ID                                            |
| `groupId`                   | `GroupId`                    | Required positive catalog ID                                            |
| `typeId`                    | `TypeId`                     | Required positive catalog ID                                            |
| `createdByNameTemplate`     | `CreatedByName`              | Optional rendered value; at most 320 characters                         |
| `descriptionTemplate`       | `Description`                | Optional rendered value; at most 16,000 characters                      |
| `priorityId`                | `PriorityId`                 | Optional integer 0–4                                                    |
| `sourceId`                  | `SourceId`                   | Optional integer 1–6                                                    |
| `locationId`                | `LocationId`                 | Optional; requires a fixed client                                       |
| `contactId`, `ccContactIds` | `ContactId`, `CcContactIds`  | Optional; require a fixed client                                        |
| assignee/watcher properties | corresponding user ID fields | Optional lead, assisting, and watcher IDs                               |
| `tagIds`                    | `TagIds`                     | Optional ticket tag IDs                                                 |
| `agentAssetIds`             | `AgentAssetIds`              | Optional agent UUIDs; requires a fixed client                           |
| `sendTicketCreatedEmail`    | `SendTicketCreatedEmail`     | Defaults to `false`                                                     |
| `isUnread`                  | `IsUnread`                   | Defaults to `true`                                                      |

ID arrays are unique and contain at most 100 values. The guided editor loads statuses, groups, types, users, tags, locations, contacts, and agent assets from current Gorelo catalogs. Custom-asset and uptime-monitor IDs are intentionally rejected because Gorelo does not currently expose safe catalog selectors for them.

Alert rules send `Name`, `ClientId`, `Resource`, optional `Description`, and `Severity`. `nameTemplate` and `resourceTemplate` are required and render to 1–998 characters; `descriptionTemplate` is optional and limited to 16,000. `severity` defaults to `3` and accepts only 1 through 4. Gorelo currently documents 1 as Critical, 2 as Error, and 3 as Warning; its help does not name 4, so this project calls it only “Severity 4” rather than inventing a label. See Gorelo's [alert overview](https://help.gorelo.io/alerts-overview).

The structured endpoints cannot receive raw MIME or attachments. The rule's primary action therefore does not forward the email; before the API call, the Worker retains the original RFC 5322 message in private `MESSAGE_ARCHIVE` and synchronously stores the event and credential-free delivery snapshot. Audit shows the extracted variables, resolved client, PascalCase request, immutable attempt, safe result, and returned ticket ID when available. Gorelo confirms an alert with a Boolean result and does not return an alert ID. Saving/editing a rule and Dry run prepare or validate mappings only; they never create a real ticket or alert.

Gorelo does not advertise an idempotency key for these create endpoints. Each delivery gets at most one provider attempt. Extraction/mapping failures and definitive 4xx responses are terminal `failed`; `429` is also terminal. These definitive failures use the configured failure destination or reject if none exists. A timeout, network error, 5xx, invalid/oversized response, or abandoned claim is `uncertain` because Gorelo might already have created the record. Neither failed nor uncertain structured actions are automatically replayed, and an uncertain action is never fallback-forwarded. Check Gorelo and the retained audit before taking manual action.

### Teach from an audited message

For a `forward_webhook`, `create_ticket`, or `create_alert` action, expand a
representative item in **Audit** and select **Create rule from this email**.
Choose the action and any named mailbox, then review the generated disabled
draft. Nothing is routed by that draft until an operator deliberately saves and
enables it.

Select the changing text in From, To, Subject, or the normalized plain-text
body and assign a safe variable key. The inference engine creates bounded
literal `startAfter`/`endBefore` markers and verifies that they reproduce the
selected value. Only those field definitions are stored with the rule. The
trainer never renders or exposes HTML, attachments, raw MIME, or archive object
identifiers.

If the audited event has no usable body, **Capture next** creates an opt-in,
narrow request for the first message matching the exact recipient and the
optional exact sender address/domain and literal subject filter. The dashboard
defaults to a 15-minute wait; the API accepts 5 to 60 minutes. Normal routing
continues unchanged while it is active. A match produces a bounded normalized
plain-text sample in private R2 for no more than 60 minutes. It contains no
HTML, attachments, or raw RFC 5322 message.
Cancellation, expiry, and non-matching mail produce no teaching sample.
The dashboard defaults to the exact prior envelope sender. The Worker also
requires Cloudflare's `canBeForwarded` signal; spam-classified, drop, reject,
quarantine, and oversize messages cannot consume the capture. Envelope matching
is not DMARC identity alignment, so retain the short window and use exact sender
plus a subject filter when practical.

## Examples

### Forward an alert and send mapped variables

```json
{
  "name": "Parse vendor server alert",
  "priority": 25,
  "conditions": [
    {
      "field": "from_domain",
      "operator": "equals",
      "value": "monitoring.vendor.example"
    }
  ],
  "action": {
    "type": "forward_webhook",
    "mailboxId": "replace-with-a-named-mailbox-id",
    "webhookDestinationId": "replace-with-a-registered-destination-id",
    "eventType": "mail.alert.parsed",
    "clientIdentityField": "client",
    "clientAliasScope": "global",
    "fields": [
      {
        "key": "client",
        "source": "body_text",
        "startAfter": "Customer:",
        "endBefore": "\n",
        "required": true
      },
      {
        "key": "asset",
        "source": "body_text",
        "startAfter": "Asset:",
        "endBefore": "\n"
      },
      {
        "key": "ticket_type",
        "source": "literal",
        "value": "Incident"
      }
    ]
  }
}
```

Configure/import clients and aliases and register the webhook destination in **Setup** before saving this rule. An explicit HTTP `429`/5xx response is retried by the five-minute delivery trigger, with five total automatic attempts at most. A network error, timeout, or abandoned in-flight claim is recorded as `uncertain` and is not automatically resent because the receiver may already have accepted it. Editing or deleting the registered destination also makes existing queued work `uncertain` instead of redirecting it.

### Create a structured ticket for one client and asset

This fixed-client rule can safely use client-specific contact, location, and asset selectors:

```json
{
  "name": "Create Acme monitoring ticket",
  "priority": 30,
  "conditions": [
    {
      "field": "from_domain",
      "operator": "equals",
      "value": "monitoring.vendor.example"
    }
  ],
  "action": {
    "type": "create_ticket",
    "fields": [
      { "key": "summary", "source": "subject", "required": true },
      {
        "key": "details",
        "source": "body_text",
        "startAfter": "Details:",
        "maxCharacters": 4000,
        "required": true
      },
      { "key": "vendor", "source": "literal", "value": "MonitorCo" }
    ],
    "clientId": 42,
    "titleTemplate": "{{summary}}",
    "descriptionTemplate": "{{details}}",
    "createdByNameTemplate": "Gorelo Router · {{vendor}}",
    "statusId": 10,
    "groupId": 20,
    "typeId": 30,
    "priorityId": 1,
    "sourceId": 6,
    "locationId": 100,
    "contactId": 200,
    "leadAssigneeId": 300,
    "tagIds": [400, 401],
    "agentAssetIds": ["ce7cb8a4-29d5-4b60-adba-fab15873446c"],
    "sendTicketCreatedEmail": false,
    "isUnread": true
  }
}
```

The rule editor fills these IDs from live/cached Gorelo selectors. Saving and Dry run do not call `POST /v1/tickets`; only a matching inbound email does.

### Create an alert using a customer alias

This rule extracts a source-system customer name and resolves it against any of that customer's configured aliases:

```json
{
  "name": "Create monitoring alert",
  "priority": 35,
  "conditions": [
    {
      "field": "from_domain",
      "operator": "equals",
      "value": "monitoring.vendor.example"
    }
  ],
  "action": {
    "type": "create_alert",
    "fields": [
      {
        "key": "customer",
        "source": "body_text",
        "startAfter": "Customer:",
        "endBefore": "\n",
        "required": true
      },
      { "key": "alert_name", "source": "subject", "required": true },
      {
        "key": "resource",
        "source": "body_text",
        "startAfter": "Asset:",
        "endBefore": "\n",
        "required": true
      },
      {
        "key": "details",
        "source": "body_text",
        "startAfter": "Details:",
        "maxCharacters": 4000
      }
    ],
    "clientIdentityField": "customer",
    "clientAliasScope": "monitoring-vendor",
    "nameTemplate": "{{alert_name}}",
    "resourceTemplate": "{{resource}}",
    "descriptionTemplate": "{{details}}",
    "severity": 2
  }
}
```

Import clients, add every applicable alias to the target customer, and use Setup's resolution preview for the same identity and scope before enabling the rule. Dry run returns a `goreloPreview` without calling `POST /v1/alerts/`.

### Reject mail that cannot be content-inspected

Create this before body or attachment rules. The example starts one byte above the scaffold's 10 MiB `MAX_PARSE_BYTES`; if that limit changes, set the rule value to `MAX_PARSE_BYTES + 1`.

```json
{
  "name": "Reject mail above MIME limit",
  "priority": 0,
  "conditions": [
    { "field": "message_size", "operator": "gte", "value": 10485761 }
  ],
  "action": {
    "type": "reject",
    "reason": "Message exceeds the accepted inspection size"
  }
}
```

### Drop an exact sender

```json
{
  "name": "Blocked sender",
  "priority": 10,
  "conditions": [
    { "field": "from", "operator": "equals", "value": "known-spam@example.net" }
  ],
  "action": { "type": "drop" }
}
```

### Quarantine executable-looking attachment names

```json
{
  "name": "Executable attachment names",
  "priority": 20,
  "match": "any",
  "conditions": [
    { "field": "attachment_name", "operator": "ends_with", "value": ".exe" },
    { "field": "attachment_name", "operator": "ends_with", "value": ".vbs" },
    { "field": "attachment_name", "operator": "ends_with", "value": ".scr" },
    { "field": "attachment_name", "operator": "ends_with", "value": ".lnk" }
  ],
  "action": { "type": "quarantine" }
}
```

This checks decoded filenames only; it is not malware detection.

### Route a client using plus-addressing

```json
{
  "name": "Contoso alert alias",
  "priority": 100,
  "conditions": [
    {
      "field": "to_local_part",
      "operator": "equals",
      "value": "alerts+contoso"
    }
  ],
  "action": {
    "type": "forward",
    "mailboxId": "replace-with-contoso-mailbox-id"
  }
}
```

### Explicitly bypass spam policy for a trusted integration

```json
{
  "name": "Trusted Acme integration",
  "priority": 30,
  "match": "all",
  "conditions": [
    {
      "field": "from_domain",
      "operator": "equals",
      "value": "alerts.acme.example"
    },
    {
      "field": "header",
      "headerName": "X-Acme-Integration",
      "operator": "equals",
      "value": "tenant-specific-marker"
    }
  ],
  "action": { "type": "forward", "bypassSpam": true }
}
```

Headers and envelope domains can be forged unless an upstream control authenticates them. Prefer a dedicated recipient plus independently validated sender/authentication controls before using `bypassSpam`.

### Quarantine a high local spam score

```json
{
  "name": "High local spam score",
  "priority": 500,
  "conditions": [{ "field": "spam_score", "operator": "gte", "value": 5 }],
  "action": { "type": "quarantine" }
}
```

The global `SPAM_ACTION` already handles the configured threshold after rule evaluation. An explicit rule is useful when the score action must occur at a specific priority.
