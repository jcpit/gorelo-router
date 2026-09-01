-- Authenticated JSON webhook ingress. Source tokens are stored only as SHA-256
-- digests; raw payloads are never retained.

CREATE TABLE inbound_webhook_sources (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  slug TEXT NOT NULL
    CHECK (
      length(slug) BETWEEN 3 AND 64 AND
      slug = lower(slug) AND
      slug NOT GLOB '*[^a-z0-9-]*' AND
      substr(slug, 1, 1) GLOB '[a-z0-9]' AND
      substr(slug, -1, 1) GLOB '[a-z0-9]'
    ),
  token_hash TEXT NOT NULL
    CHECK (
      length(token_hash) = 64 AND
      token_hash = lower(token_hash) AND
      token_hash NOT GLOB '*[^0-9a-f]*'
    ),
  token_hint TEXT NOT NULL CHECK (length(token_hint) = 6),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  mappings_json TEXT NOT NULL
    CHECK (json_valid(mappings_json))
    CHECK (json_type(mappings_json) = 'array')
    CHECK (length(CAST(mappings_json AS BLOB)) <= 65536),
  action_json TEXT NOT NULL
    CHECK (json_valid(action_json))
    CHECK (json_type(action_json) = 'object')
    CHECK (length(CAST(action_json AS BLOB)) <= 65536),
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60
    CHECK (rate_limit_per_minute BETWEEN 1 AND 1000),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 40),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 40)
);

CREATE UNIQUE INDEX idx_inbound_webhook_sources_name
  ON inbound_webhook_sources (name COLLATE NOCASE);

CREATE UNIQUE INDEX idx_inbound_webhook_sources_slug
  ON inbound_webhook_sources (slug COLLATE NOCASE);

CREATE INDEX idx_inbound_webhook_sources_enabled
  ON inbound_webhook_sources (enabled, name COLLATE NOCASE, id);

CREATE TRIGGER inbound_webhook_sources_require_action_insert
BEFORE INSERT ON inbound_webhook_sources
WHEN (
  json_extract(NEW.action_json, '$.type') = 'gorelo_rule' AND
  NOT EXISTS (
    SELECT 1 FROM rules
     WHERE id = json_extract(NEW.action_json, '$.ruleId')
       AND json_extract(action_json, '$.type')
             IN ('create_ticket', 'create_alert')
  )
) OR (
  json_extract(NEW.action_json, '$.type') = 'send_webhook' AND
  NOT EXISTS (
    SELECT 1 FROM webhook_destinations
     WHERE id = json_extract(NEW.action_json, '$.destinationId')
       AND enabled = 1
  )
)
BEGIN
  SELECT RAISE(ABORT, 'inbound webhook source action is unavailable');
END;

CREATE TRIGGER inbound_webhook_sources_require_action_update
BEFORE UPDATE OF action_json ON inbound_webhook_sources
WHEN (
  json_extract(NEW.action_json, '$.type') = 'gorelo_rule' AND
  NOT EXISTS (
    SELECT 1 FROM rules
     WHERE id = json_extract(NEW.action_json, '$.ruleId')
       AND json_extract(action_json, '$.type')
             IN ('create_ticket', 'create_alert')
  )
) OR (
  json_extract(NEW.action_json, '$.type') = 'send_webhook' AND
  NOT EXISTS (
    SELECT 1 FROM webhook_destinations
     WHERE id = json_extract(NEW.action_json, '$.destinationId')
       AND enabled = 1
  )
)
BEGIN
  SELECT RAISE(ABORT, 'inbound webhook source action is unavailable');
END;

CREATE TRIGGER rules_protect_inbound_webhook_source_delete
BEFORE DELETE ON rules
WHEN EXISTS (
  SELECT 1 FROM inbound_webhook_sources
   WHERE json_extract(action_json, '$.type') = 'gorelo_rule'
     AND json_extract(action_json, '$.ruleId') = OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'rule is referenced by an inbound webhook source');
END;

CREATE TRIGGER rules_protect_inbound_webhook_source_update
BEFORE UPDATE OF action_json ON rules
WHEN EXISTS (
  SELECT 1 FROM inbound_webhook_sources
   WHERE json_extract(action_json, '$.type') = 'gorelo_rule'
     AND json_extract(action_json, '$.ruleId') = OLD.id
) AND json_extract(NEW.action_json, '$.type')
          NOT IN ('create_ticket', 'create_alert')
BEGIN
  SELECT RAISE(ABORT, 'rule is referenced by an inbound webhook source');
END;

CREATE TRIGGER webhook_destinations_protect_inbound_source_disable
BEFORE UPDATE OF enabled ON webhook_destinations
WHEN NEW.enabled = 0 AND EXISTS (
  SELECT 1 FROM inbound_webhook_sources
   WHERE json_extract(action_json, '$.type') = 'send_webhook'
     AND json_extract(action_json, '$.destinationId') = OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'webhook destination is referenced by an inbound source');
END;

CREATE TRIGGER webhook_destinations_protect_inbound_source_delete
BEFORE DELETE ON webhook_destinations
WHEN EXISTS (
  SELECT 1 FROM inbound_webhook_sources
   WHERE json_extract(action_json, '$.type') = 'send_webhook'
     AND json_extract(action_json, '$.destinationId') = OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'webhook destination is referenced by an inbound source');
END;

CREATE TABLE inbound_webhook_rate_limits (
  source_id TEXT NOT NULL,
  window_started_at TEXT NOT NULL CHECK (length(window_started_at) = 16),
  request_count INTEGER NOT NULL CHECK (request_count BETWEEN 1 AND 1000),
  PRIMARY KEY (source_id, window_started_at),
  FOREIGN KEY (source_id)
    REFERENCES inbound_webhook_sources(id) ON DELETE CASCADE
);

ALTER TABLE processing_events
  ADD COLUMN ingress_type TEXT NOT NULL DEFAULT 'email'
    CHECK (ingress_type IN ('email', 'webhook'));

ALTER TABLE processing_events
  ADD COLUMN ingress_source_id TEXT
    CHECK (ingress_source_id IS NULL OR length(ingress_source_id) = 36);

ALTER TABLE processing_events
  ADD COLUMN ingress_source_name TEXT
    CHECK (
      ingress_source_name IS NULL OR
      length(ingress_source_name) BETWEEN 1 AND 120
    );

ALTER TABLE processing_events
  ADD COLUMN ingress_event_type TEXT
    CHECK (
      ingress_event_type IS NULL OR
      length(ingress_event_type) BETWEEN 1 AND 128
    );

ALTER TABLE processing_events
  ADD COLUMN ingress_payload_digest TEXT
    CHECK (
      ingress_payload_digest IS NULL OR
      (length(ingress_payload_digest) = 64 AND
       ingress_payload_digest = lower(ingress_payload_digest) AND
       ingress_payload_digest NOT GLOB '*[^0-9a-f]*')
    );

ALTER TABLE processing_events
  ADD COLUMN ingress_idempotency_key TEXT
    CHECK (
      ingress_idempotency_key IS NULL OR
      length(ingress_idempotency_key) BETWEEN 1 AND 200
    );

ALTER TABLE processing_events
  ADD COLUMN ingress_variables_json TEXT
    CHECK (
      ingress_variables_json IS NULL OR
      (json_valid(ingress_variables_json) AND
       json_type(ingress_variables_json) = 'object' AND
       length(CAST(ingress_variables_json AS BLOB)) <= 65536)
    );

CREATE UNIQUE INDEX idx_processing_events_webhook_idempotency
  ON processing_events (ingress_source_id, ingress_idempotency_key)
  WHERE ingress_type = 'webhook' AND ingress_idempotency_key IS NOT NULL;

CREATE INDEX idx_processing_events_ingress
  ON processing_events (ingress_type, ingress_source_id, created_at DESC);
