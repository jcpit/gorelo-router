-- Short-lived, one-message parser teaching requests. Match criteria and state
-- live in D1; normalized sample content lives only in the private R2 binding.

CREATE TABLE parser_captures (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  source_event_id TEXT
    CHECK (
      source_event_id IS NULL OR
      length(source_event_id) BETWEEN 1 AND 320
    ),
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN (
      'pending',
      'claimed',
      'captured',
      'cancelled',
      'expired',
      'failed'
    )),
  match_recipient TEXT NOT NULL
    CHECK (
      length(match_recipient) BETWEEN 3 AND 254 AND
      match_recipient = lower(trim(match_recipient))
    ),
  match_sender_mode TEXT NOT NULL
    CHECK (match_sender_mode IN ('any', 'address', 'domain')),
  match_sender_value TEXT
    CHECK (
      match_sender_value IS NULL OR
      (length(match_sender_value) BETWEEN 1 AND 254 AND
       match_sender_value = lower(trim(match_sender_value)))
    ),
  match_subject_contains TEXT
    CHECK (
      match_subject_contains IS NULL OR
      length(match_subject_contains) BETWEEN 1 AND 200
    ),
  requested_by TEXT NOT NULL
    CHECK (length(requested_by) BETWEEN 1 AND 320),
  wait_expires_at TEXT NOT NULL
    CHECK (length(wait_expires_at) BETWEEN 20 AND 40),
  claim_event_id TEXT UNIQUE
    CHECK (
      claim_event_id IS NULL OR
      length(claim_event_id) BETWEEN 1 AND 320
    ),
  claimed_at TEXT
    CHECK (claimed_at IS NULL OR length(claimed_at) BETWEEN 20 AND 40),
  captured_event_id TEXT UNIQUE
    CHECK (
      captured_event_id IS NULL OR
      length(captured_event_id) BETWEEN 1 AND 320
    ),
  captured_at TEXT
    CHECK (captured_at IS NULL OR length(captured_at) BETWEEN 20 AND 40),
  sample_object_key TEXT UNIQUE
    CHECK (
      sample_object_key IS NULL OR
      (length(sample_object_key) BETWEEN 1 AND 1024 AND
       sample_object_key GLOB 'parser-samples/*.json')
    ),
  sample_sha256 TEXT
    CHECK (
      sample_sha256 IS NULL OR
      (length(sample_sha256) = 64 AND
       sample_sha256 = lower(sample_sha256) AND
       sample_sha256 NOT GLOB '*[^0-9a-f]*')
    ),
  sample_size INTEGER
    CHECK (sample_size IS NULL OR sample_size BETWEEN 1 AND 262144),
  sample_expires_at TEXT
    CHECK (
      sample_expires_at IS NULL OR
      length(sample_expires_at) BETWEEN 20 AND 40
    ),
  safe_error_code TEXT
    CHECK (
      safe_error_code IS NULL OR
      (length(safe_error_code) BETWEEN 1 AND 80 AND
       substr(safe_error_code, 1, 1) GLOB '[a-z]' AND
       safe_error_code NOT GLOB '*[^a-z0-9_]*')
    ),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 40),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 40),
  FOREIGN KEY (source_event_id)
    REFERENCES processing_events(id) ON DELETE SET NULL,
  FOREIGN KEY (captured_event_id)
    REFERENCES processing_events(id) ON DELETE CASCADE,
  CHECK (wait_expires_at > created_at),
  CHECK (updated_at >= created_at),
  CHECK (
    (match_sender_mode = 'any' AND match_sender_value IS NULL) OR
    (match_sender_mode IN ('address', 'domain') AND match_sender_value IS NOT NULL)
  ),
  CHECK (
    (claim_event_id IS NULL AND claimed_at IS NULL) OR
    (claim_event_id IS NOT NULL AND claimed_at IS NOT NULL)
  ),
  CHECK (
    (sample_object_key IS NULL AND sample_sha256 IS NULL AND sample_size IS NULL
      AND sample_expires_at IS NULL) OR
    (sample_object_key IS NOT NULL AND sample_sha256 IS NOT NULL
      AND sample_size IS NOT NULL AND sample_expires_at IS NOT NULL)
  ),
  CHECK (
    (state = 'pending' AND claim_event_id IS NULL
      AND captured_event_id IS NULL AND captured_at IS NULL
      AND sample_object_key IS NULL AND safe_error_code IS NULL) OR
    (state = 'claimed' AND claim_event_id IS NOT NULL
      AND captured_event_id IS NULL AND captured_at IS NULL
      AND sample_object_key IS NULL AND safe_error_code IS NULL) OR
    (state = 'captured' AND claim_event_id IS NULL
      AND captured_event_id IS NOT NULL AND captured_at IS NOT NULL
      AND sample_object_key IS NOT NULL AND safe_error_code IS NULL
      AND sample_expires_at > captured_at) OR
    (state = 'cancelled' AND claim_event_id IS NULL
      AND captured_event_id IS NULL AND captured_at IS NULL
      AND sample_object_key IS NULL AND safe_error_code IS NULL) OR
    (state = 'expired' AND claim_event_id IS NULL
      AND sample_object_key IS NULL AND safe_error_code IS NULL) OR
    (state = 'failed' AND claim_event_id IS NULL
      AND captured_event_id IS NULL AND captured_at IS NULL
      AND sample_object_key IS NULL AND safe_error_code IS NOT NULL)
  )
);

-- One active request per inbound address keeps "the next message" unambiguous.
CREATE UNIQUE INDEX idx_parser_captures_active_recipient
  ON parser_captures (match_recipient)
  WHERE state IN ('pending', 'claimed');

CREATE INDEX idx_parser_captures_match
  ON parser_captures (state, match_recipient, wait_expires_at);

CREATE INDEX idx_parser_captures_source_event
  ON parser_captures (source_event_id, created_at DESC);

CREATE INDEX idx_parser_captures_sample_expiry
  ON parser_captures (state, sample_expires_at)
  WHERE sample_object_key IS NOT NULL;
