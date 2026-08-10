-- Named Gorelo forwarding mailboxes. The singleton settings row identifies
-- the one default without duplicating default state across mailbox rows.

CREATE TABLE gorelo_mailboxes (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  address TEXT NOT NULL
    CHECK (
      length(address) BETWEEN 3 AND 320 AND
      address = TRIM(address) AND
      address = LOWER(address)
    ),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 40),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 40)
);

CREATE UNIQUE INDEX idx_gorelo_mailboxes_name
  ON gorelo_mailboxes (name COLLATE NOCASE);

CREATE UNIQUE INDEX idx_gorelo_mailboxes_address
  ON gorelo_mailboxes (address COLLATE NOCASE);

CREATE INDEX idx_gorelo_mailboxes_enabled
  ON gorelo_mailboxes (enabled, name COLLATE NOCASE, id);

-- SQLite's REPLACE conflict strategy may delete conflicting rows without
-- running delete triggers when recursive_triggers is disabled. Reject every
-- insert-side identity/name/address conflict before REPLACE can do that work.
CREATE TRIGGER gorelo_mailboxes_reject_replacement
BEFORE INSERT ON gorelo_mailboxes
WHEN EXISTS (
  SELECT 1 FROM gorelo_mailboxes
   WHERE id = NEW.id
      OR name = NEW.name COLLATE NOCASE
      OR address = NEW.address COLLATE NOCASE
)
BEGIN
  SELECT RAISE(ABORT, 'Gorelo mailboxes cannot be replaced');
END;

CREATE TRIGGER gorelo_mailboxes_reject_name_replacement
BEFORE UPDATE OF name ON gorelo_mailboxes
WHEN EXISTS (
  SELECT 1 FROM gorelo_mailboxes
   WHERE id <> OLD.id AND name = NEW.name COLLATE NOCASE
)
BEGIN
  SELECT RAISE(ABORT, 'Gorelo mailbox names cannot replace another mailbox');
END;

CREATE TABLE gorelo_mailbox_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  default_mailbox_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 40),
  FOREIGN KEY (default_mailbox_id)
    REFERENCES gorelo_mailboxes(id) ON DELETE RESTRICT
);

-- Persisted mailbox identity and delivery addresses are immutable. Operators
-- can rename a mailbox, toggle it when safe, or replace it with a new mailbox.
CREATE TRIGGER gorelo_mailboxes_identity_immutable
BEFORE UPDATE OF id, address ON gorelo_mailboxes
WHEN NEW.id <> OLD.id OR NEW.address <> OLD.address
BEGIN
  SELECT RAISE(ABORT, 'Gorelo mailbox identity and address are immutable');
END;

-- Protect the singleton default and every rule reference even when D1 is
-- changed outside the application API.
CREATE TRIGGER gorelo_mailboxes_protect_disable
BEFORE UPDATE OF enabled ON gorelo_mailboxes
WHEN OLD.enabled = 1 AND NEW.enabled = 0
  AND (
    EXISTS (
      SELECT 1 FROM gorelo_mailbox_settings
       WHERE id = 1 AND default_mailbox_id = OLD.id
    ) OR
    EXISTS (
      SELECT 1 FROM rules
       WHERE json_extract(action_json, '$.mailboxId') = OLD.id
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'referenced Gorelo mailbox cannot be disabled');
END;

CREATE TRIGGER gorelo_mailboxes_protect_delete
BEFORE DELETE ON gorelo_mailboxes
WHEN EXISTS (
    SELECT 1 FROM gorelo_mailbox_settings
     WHERE id = 1 AND default_mailbox_id = OLD.id
  ) OR EXISTS (
    SELECT 1 FROM rules
     WHERE json_extract(action_json, '$.mailboxId') = OLD.id
  )
BEGIN
  SELECT RAISE(ABORT, 'referenced Gorelo mailbox cannot be deleted');
END;

CREATE TRIGGER gorelo_mailbox_settings_require_enabled_insert
BEFORE INSERT ON gorelo_mailbox_settings
WHEN NOT EXISTS (
  SELECT 1 FROM gorelo_mailboxes
   WHERE id = NEW.default_mailbox_id AND enabled = 1
)
BEGIN
  SELECT RAISE(ABORT, 'default Gorelo mailbox must be enabled');
END;

CREATE TRIGGER gorelo_mailbox_settings_reject_replacement
BEFORE INSERT ON gorelo_mailbox_settings
WHEN EXISTS (
  SELECT 1 FROM gorelo_mailbox_settings WHERE id = NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'Gorelo mailbox settings cannot be replaced');
END;

CREATE TRIGGER gorelo_mailbox_settings_require_enabled_update
BEFORE UPDATE OF default_mailbox_id ON gorelo_mailbox_settings
WHEN NOT EXISTS (
  SELECT 1 FROM gorelo_mailboxes
   WHERE id = NEW.default_mailbox_id AND enabled = 1
)
BEGIN
  SELECT RAISE(ABORT, 'default Gorelo mailbox must be enabled');
END;

CREATE TRIGGER gorelo_mailbox_settings_protect_delete
BEFORE DELETE ON gorelo_mailbox_settings
BEGIN
  SELECT RAISE(ABORT, 'Gorelo mailbox settings cannot be deleted');
END;

ALTER TABLE processing_events
  ADD COLUMN destination_mailbox_id TEXT
    CHECK (
      destination_mailbox_id IS NULL OR
      length(destination_mailbox_id) = 36
    );

ALTER TABLE processing_events
  ADD COLUMN destination_mailbox_name TEXT
    CHECK (
      destination_mailbox_name IS NULL OR
      length(destination_mailbox_name) BETWEEN 1 AND 120
    );

-- Keep mailbox references valid even if rules are written outside the API.
-- SQLite serializes these checks with the mailbox-side guards above.
CREATE TRIGGER rules_require_enabled_mailbox_insert
BEFORE INSERT ON rules
WHEN json_extract(NEW.action_json, '$.mailboxId') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM gorelo_mailboxes
     WHERE id = json_extract(NEW.action_json, '$.mailboxId')
       AND enabled = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'selected Gorelo mailbox is unavailable');
END;

CREATE TRIGGER rules_require_enabled_mailbox_update
BEFORE UPDATE OF action_json ON rules
WHEN json_extract(NEW.action_json, '$.mailboxId') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM gorelo_mailboxes
     WHERE id = json_extract(NEW.action_json, '$.mailboxId')
       AND enabled = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'selected Gorelo mailbox is unavailable');
END;
