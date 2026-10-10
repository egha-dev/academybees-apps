-- People and scheduling (Phase 3, C-09, C-90, C-91, ADR-024/025/034). Idempotent; applied after
-- 010/020. Tenant RLS on these tables comes from 010's loop (every table with tenant_id).

-- History is kept (ADR-025): the app role archives or closes, never deletes. Consent is
-- append-only (ADR-034); sequences are never reset by tenant code (C-91). Erasure requests
-- (DPDP Act) run as platform jobs (Phase 15), not through the app role.
REVOKE DELETE, TRUNCATE ON student, parent, teacher, course, batch, batch_enrolment,
  tenant_sequence FROM ab_app;
REVOKE UPDATE, DELETE, TRUNCATE ON consent_record FROM ab_app;
GRANT SELECT, INSERT ON consent_record TO ab_app;
-- The activity timeline is append-only like the audit log (ADR-027, Phase 4).
REVOKE UPDATE, DELETE, TRUNCATE ON activity_event FROM ab_app;
GRANT SELECT, INSERT ON activity_event TO ab_app;
REVOKE TRUNCATE ON student_health_note, parent_student, custom_field_definition, course_level,
  batch_teacher, schedule_rule, class_session, tenant_onboarding FROM ab_app;

-- Shape checks: the database refuses rows no screen could have produced.
ALTER TABLE student DROP CONSTRAINT IF EXISTS student_shape;
ALTER TABLE student ADD CONSTRAINT student_shape CHECK (
  length(btrim(full_name)) > 0
  AND length(btrim(admission_no)) > 0
  AND (date_of_birth IS NULL OR date_of_birth <= admission_date + 1)
);
ALTER TABLE parent DROP CONSTRAINT IF EXISTS parent_shape;
ALTER TABLE parent ADD CONSTRAINT parent_shape CHECK (
  length(btrim(full_name)) > 0
  AND (email IS NULL OR (email = lower(email) AND email LIKE '%_@_%'))
  AND (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$')
);
ALTER TABLE teacher DROP CONSTRAINT IF EXISTS teacher_shape;
ALTER TABLE teacher ADD CONSTRAINT teacher_shape CHECK (
  length(btrim(full_name)) > 0
  AND (email IS NULL OR (email = lower(email) AND email LIKE '%_@_%'))
  AND (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$')
);
ALTER TABLE parent_student DROP CONSTRAINT IF EXISTS parent_student_relationship;
ALTER TABLE parent_student ADD CONSTRAINT parent_student_relationship CHECK (
  relationship IN ('MOTHER', 'FATHER', 'GUARDIAN', 'GRANDPARENT', 'OTHER')
);
ALTER TABLE consent_record DROP CONSTRAINT IF EXISTS consent_record_purposes;
ALTER TABLE consent_record ADD CONSTRAINT consent_record_purposes CHECK (
  cardinality(purposes) > 0
);
ALTER TABLE custom_field_definition DROP CONSTRAINT IF EXISTS custom_field_definition_shape;
ALTER TABLE custom_field_definition ADD CONSTRAINT custom_field_definition_shape CHECK (
  entity IN ('STUDENT') AND key ~ '^[a-z][a-z0-9_]{0,39}$'
);
ALTER TABLE tenant_sequence DROP CONSTRAINT IF EXISTS tenant_sequence_positive;
ALTER TABLE tenant_sequence ADD CONSTRAINT tenant_sequence_positive CHECK (next_value >= 1);

ALTER TABLE batch DROP CONSTRAINT IF EXISTS batch_shape;
ALTER TABLE batch ADD CONSTRAINT batch_shape CHECK (
  length(btrim(name)) > 0
  AND (capacity IS NULL OR capacity BETWEEN 1 AND 10000)
  AND (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);
ALTER TABLE batch_enrolment DROP CONSTRAINT IF EXISTS batch_enrolment_dates;
ALTER TABLE batch_enrolment ADD CONSTRAINT batch_enrolment_dates CHECK (
  ended_on IS NULL OR ended_on >= started_on
);
-- ISO weekday; minutes after local midnight; a slot ends after it starts on the same day.
ALTER TABLE schedule_rule DROP CONSTRAINT IF EXISTS schedule_rule_shape;
ALTER TABLE schedule_rule ADD CONSTRAINT schedule_rule_shape CHECK (
  weekday BETWEEN 1 AND 7
  AND start_minute BETWEEN 0 AND 1439
  AND end_minute BETWEEN 1 AND 1440
  AND end_minute > start_minute
  AND (effective_to IS NULL OR effective_to >= effective_from)
);
ALTER TABLE class_session DROP CONSTRAINT IF EXISTS class_session_times;
ALTER TABLE class_session ADD CONSTRAINT class_session_times CHECK (ends_at > starts_at);
-- A generated session always belongs to its rule (manual ones may have none).
ALTER TABLE class_session DROP CONSTRAINT IF EXISTS class_session_origin;
ALTER TABLE class_session ADD CONSTRAINT class_session_origin CHECK (
  origin = 'MANUAL' OR schedule_rule_id IS NOT NULL
);

-- Media metadata (C-97): history, never deleted by tenant code; the shape matches its purpose.
REVOKE DELETE, TRUNCATE ON media_file FROM ab_app;
ALTER TABLE media_file DROP CONSTRAINT IF EXISTS media_file_shape;
ALTER TABLE media_file ADD CONSTRAINT media_file_shape CHECK (
  size_bytes > 0
  AND storage_key LIKE 't/' || tenant_id::text || '/%'
  -- Branding is the only public purpose (C-97).
  AND (visibility = 'PRIVATE' OR purpose LIKE 'branding.%')
);
