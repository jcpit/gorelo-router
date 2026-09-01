-- Explicit, one-shot webhook training capture. Payloads are stored privately
-- and are deleted when read or when the capture expires.
ALTER TABLE inbound_webhook_sources ADD COLUMN capture_requested_at TEXT;
ALTER TABLE inbound_webhook_sources ADD COLUMN capture_expires_at TEXT;
ALTER TABLE inbound_webhook_sources ADD COLUMN capture_object_key TEXT;
