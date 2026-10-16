-- Phase 5 review H2: generated classes keep their weekly slot's date, so moving a class to another
-- day never makes generation recreate it on the original day. Expand-only.
ALTER TABLE "class_session" ADD COLUMN "slot_date" DATE;

-- Backfill across every academy: FORCE RLS would hide all rows from the owner, so lift it for this
-- statement only (010-tenant-rls.sql forces it again right after every migration run).
ALTER TABLE "class_session" NO FORCE ROW LEVEL SECURITY;
UPDATE "class_session" SET "slot_date" = "session_date" WHERE "origin" = 'GENERATED';
ALTER TABLE "class_session" FORCE ROW LEVEL SECURITY;

DROP INDEX "class_session_tenant_id_schedule_rule_id_session_date_key";
CREATE UNIQUE INDEX "class_session_tenant_id_schedule_rule_id_slot_date_key" ON "class_session"("tenant_id", "schedule_rule_id", "slot_date");
