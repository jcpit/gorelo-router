-- Gorelo Router's initial public schema. This is a clean baseline rather than
-- an upgrade chain: the product had not been deployed before this release.

CREATE TABLE rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL CHECK (priority >= 0 AND priority <= 100000),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  match_mode TEXT NOT NULL CHECK (match_mode IN ('all', 'any')),
  conditions_json TEXT NOT NULL CHECK (json_valid(conditions_json)),
  action_json TEXT NOT NULL CHECK (json_valid(action_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_rules_evaluation
  ON rules (enabled DESC, priority ASC, created_at ASC);

CREATE TABLE processing_events (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL DEFAULT '',
  envelope_from TEXT NOT NULL,
  envelope_to TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  raw_size INTEGER NOT NULL CHECK (raw_size >= 0),
  spam_score INTEGER NOT NULL,
  spam_reasons_json TEXT NOT NULL CHECK (json_valid(spam_reasons_json)),
  decision TEXT NOT NULL
    CHECK (decision IN ('forward', 'quarantine', 'drop', 'reject')),
  matched_rule_id TEXT,
  matched_rule_name TEXT,
  destination TEXT,
  status TEXT NOT NULL
    CHECK (status IN (
      'forwarded',
      'quarantined',
      'dropped',
      'rejected',
      'failed'
    )),
  error TEXT,
  created_at TEXT NOT NULL,
  audit_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(audit_json)),
  archive_key TEXT,
  archive_sha256 TEXT
);

CREATE INDEX idx_processing_events_created_at
  ON processing_events (created_at DESC);

CREATE INDEX idx_processing_events_status_created_at
  ON processing_events (status, created_at DESC);

CREATE UNIQUE INDEX idx_processing_events_archive_key
  ON processing_events (archive_key)
  WHERE archive_key IS NOT NULL;

CREATE TABLE quarantine_items (
  event_id TEXT PRIMARY KEY,
  object_key TEXT UNIQUE,
  sha256 TEXT,
  state TEXT NOT NULL
    CHECK (state IN (
      'pending',
      'releasing',
      'released',
      'dismissed',
      'release_failed',
      'expired'
    )),
  expires_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewer TEXT,
  note TEXT,
  release_destination TEXT,
  release_message_id TEXT,
  last_error TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES processing_events(id) ON DELETE CASCADE
);

CREATE INDEX idx_quarantine_items_queue
  ON quarantine_items (state, updated_at DESC, event_id);

CREATE INDEX idx_quarantine_items_expiry
  ON quarantine_items (expires_at, state, event_id);

CREATE TABLE message_review_actions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(detail_json)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES processing_events(id) ON DELETE CASCADE
);

CREATE INDEX idx_message_review_actions_event
  ON message_review_actions (event_id, created_at ASC);

CREATE INDEX idx_message_review_actions_created_at
  ON message_review_actions (created_at DESC, id DESC);

-- Durable outbound records contain no authentication material. Attempts are
-- immutable from the repository's perspective.
CREATE TABLE outbound_deliveries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  action_index INTEGER NOT NULL CHECK (action_index BETWEEN 0 AND 999),
  action_type TEXT NOT NULL
    CHECK (action_type IN (
      'forward_email',
      'create_ticket',
      'create_alert',
      'send_webhook'
    )),
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN (
      'pending',
      'delivering',
      'succeeded',
      'failed',
      'uncertain'
    )),
  payload_json TEXT NOT NULL
    CHECK (json_valid(payload_json))
    CHECK (length(CAST(payload_json AS BLOB)) <= 65536),
  payload_digest TEXT NOT NULL CHECK (length(payload_digest) = 64),
  parser_snapshot_id TEXT
    CHECK (parser_snapshot_id IS NULL OR length(parser_snapshot_id) <= 320),
  rule_snapshot_id TEXT
    CHECK (rule_snapshot_id IS NULL OR length(rule_snapshot_id) <= 320),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  provider_id TEXT
    CHECK (provider_id IS NULL OR length(provider_id) <= 512),
  safe_error TEXT
    CHECK (safe_error IS NULL OR length(safe_error) <= 2000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  next_attempt_at TEXT,
  attempt_started_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (event_id, action_index),
  FOREIGN KEY (event_id) REFERENCES processing_events(id) ON DELETE CASCADE
);

CREATE INDEX idx_outbound_deliveries_queue
  ON outbound_deliveries (state, next_attempt_at, created_at, id);

CREATE INDEX idx_outbound_deliveries_event
  ON outbound_deliveries (event_id, action_index);

CREATE INDEX idx_outbound_deliveries_action_queue
  ON outbound_deliveries (
    action_type,
    state,
    next_attempt_at,
    created_at,
    id
  );

CREATE TABLE delivery_attempts (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'uncertain')),
  http_status INTEGER
    CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  safe_error TEXT
    CHECK (safe_error IS NULL OR length(safe_error) <= 2000),
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL CHECK (ended_at >= started_at),
  UNIQUE (delivery_id, attempt_number),
  FOREIGN KEY (delivery_id) REFERENCES outbound_deliveries(id) ON DELETE CASCADE
);

CREATE INDEX idx_delivery_attempts_delivery
  ON delivery_attempts (delivery_id, attempt_number ASC);

CREATE TABLE gorelo_catalog_cache (
  cache_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  client_id TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  item_count INTEGER NOT NULL CHECK (item_count >= 0),
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_gorelo_catalog_cache_expiry
  ON gorelo_catalog_cache (expires_at);

CREATE TABLE gorelo_clients (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 512),
  billing_name TEXT
    CHECK (billing_name IS NULL OR length(billing_name) BETWEEN 1 AND 512),
  alternate_name TEXT
    CHECK (alternate_name IS NULL OR length(alternate_name) BETWEEN 1 AND 512),
  status TEXT CHECK (status IS NULL OR length(status) BETWEEN 1 AND 256),
  domains_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(domains_json))
    CHECK (json_type(domains_json) = 'array')
    CHECK (length(CAST(domains_json AS BLOB)) <= 262144),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  imported_at TEXT NOT NULL CHECK (length(imported_at) BETWEEN 20 AND 40),
  last_seen_at TEXT NOT NULL CHECK (length(last_seen_at) BETWEEN 20 AND 40),
  CHECK (last_seen_at >= imported_at)
);

CREATE INDEX idx_gorelo_clients_name
  ON gorelo_clients (name COLLATE NOCASE, id);

CREATE INDEX idx_gorelo_clients_last_seen
  ON gorelo_clients (last_seen_at DESC, id);

CREATE TABLE client_aliases (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  client_id INTEGER NOT NULL,
  alias TEXT NOT NULL CHECK (length(alias) BETWEEN 1 AND 512),
  normalized_alias TEXT NOT NULL
    CHECK (length(normalized_alias) BETWEEN 1 AND 512),
  scope TEXT NOT NULL DEFAULT 'global' CHECK (length(scope) BETWEEN 1 AND 128),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 40),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 40),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (scope, normalized_alias),
  FOREIGN KEY (client_id) REFERENCES gorelo_clients(id) ON DELETE CASCADE
);

CREATE INDEX idx_client_aliases_client
  ON client_aliases (client_id, scope, normalized_alias);

CREATE TABLE gorelo_client_sync (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_synced_at TEXT NOT NULL
    CHECK (length(last_synced_at) BETWEEN 20 AND 40),
  imported_count INTEGER NOT NULL CHECK (imported_count >= 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 40)
);

CREATE TABLE webhook_destinations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  url TEXT NOT NULL UNIQUE CHECK (length(url) BETWEEN 1 AND 2048),
  host TEXT NOT NULL CHECK (length(host) BETWEEN 1 AND 253),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_webhook_destinations_name
  ON webhook_destinations (name COLLATE NOCASE);

CREATE INDEX idx_webhook_destinations_enabled
  ON webhook_destinations (enabled, name COLLATE NOCASE);
