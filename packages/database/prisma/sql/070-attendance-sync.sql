-- Phase 6 attendance and sync (ADR-016, ADR-017, C-126…C-128). Idempotent; applied as ab_migrator
-- after migrations. Tenant isolation itself comes from 010 (every tenant_id table).

-- History is never rewritten: marks change in place (versioned) but are never deleted; their
-- change log and the sync op ledger are append-only.
REVOKE DELETE, TRUNCATE ON attendance FROM ab_app;
REVOKE UPDATE, DELETE, TRUNCATE ON attendance_change, sync_operation FROM ab_app;
GRANT SELECT, INSERT ON attendance_change, sync_operation TO ab_app;
-- Notifications are marked read, never deleted (retention is Phase 15).
REVOKE DELETE, TRUNCATE ON notification FROM ab_app;

ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_shape;
ALTER TABLE attendance ADD CONSTRAINT attendance_shape CHECK (version >= 1);

ALTER TABLE attendance_change DROP CONSTRAINT IF EXISTS attendance_change_shape;
ALTER TABLE attendance_change ADD CONSTRAINT attendance_change_shape CHECK (
  from_status IS DISTINCT FROM to_status
);

-- An intent names what it is about: a holiday for holiday cancellations, a class for attendance.
ALTER TABLE notification_intent DROP CONSTRAINT IF EXISTS notification_intent_subject;
ALTER TABLE notification_intent ADD CONSTRAINT notification_intent_subject CHECK (
  (kind = 'SESSION_CANCELLED_HOLIDAY' AND holiday_id IS NOT NULL)
  OR (kind IN ('ATTENDANCE_ABSENT', 'ATTENDANCE_LATE') AND session_id IS NOT NULL)
);
