-- Phase 5 scheduling workspace (ADR-024, ADR-037, C-113…C-115, C-120). Idempotent; applied as
-- ab_migrator after migrations. Tenant isolation itself comes from 010 (every tenant_id table).

-- Holidays and notification intents are history: removed holidays keep their row (removed_at),
-- intents are voided, never deleted.
REVOKE DELETE, TRUNCATE ON holiday, notification_intent FROM ab_app;

ALTER TABLE holiday DROP CONSTRAINT IF EXISTS holiday_shape;
ALTER TABLE holiday ADD CONSTRAINT holiday_shape CHECK (
  length(btrim(name)) > 0
  AND end_date >= start_date
  AND end_date - start_date <= 366
);

-- Student day plan (C-120): distinct ISO weekdays 1–7; empty = every day the batch meets.
ALTER TABLE batch_enrolment DROP CONSTRAINT IF EXISTS batch_enrolment_weekdays;
ALTER TABLE batch_enrolment ADD CONSTRAINT batch_enrolment_weekdays CHECK (
  weekdays IS NULL
  OR (weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[] AND cardinality(weekdays) <= 7)
);

-- A cancelled session says why; only cancelled sessions carry a reason; a holiday cancellation
-- names its holiday.
ALTER TABLE class_session DROP CONSTRAINT IF EXISTS class_session_cancel;
ALTER TABLE class_session ADD CONSTRAINT class_session_cancel CHECK (
  (status = 'CANCELLED') = (cancel_reason IS NOT NULL)
  AND (cancel_reason IS DISTINCT FROM 'HOLIDAY' OR holiday_id IS NOT NULL)
);

-- A make-up is a manual session and never its own make-up.
ALTER TABLE class_session DROP CONSTRAINT IF EXISTS class_session_makeup;
ALTER TABLE class_session ADD CONSTRAINT class_session_makeup CHECK (
  makeup_for_session_id IS NULL OR (origin = 'MANUAL' AND makeup_for_session_id <> id)
);

-- A generated class remembers its weekly slot's date (review H2); manual classes have none.
ALTER TABLE class_session DROP CONSTRAINT IF EXISTS class_session_slot;
ALTER TABLE class_session ADD CONSTRAINT class_session_slot CHECK (
  (origin = 'GENERATED') = (slot_date IS NOT NULL)
);
