-- AlterTable
ALTER TABLE "tenant" ADD COLUMN     "previous_status" "tenant_status",
ADD COLUMN     "status_changed_at" TIMESTAMPTZ(3),
ADD COLUMN     "status_reason" VARCHAR(500);

-- AlterTable
ALTER TABLE "invitation" ADD COLUMN     "invitee_name" VARCHAR(120);


-- Backfill (C-89, C-92): every academy has a subscription and an onboarding state from
-- provisioning on. Academies created before Phase 3 (staging's demo academies) get a Trial on the
-- `trial` plan with its current entitlements, and a finished onboarding unless still setting up.
-- The schema owner is subject to FORCE RLS, so it is lifted for these statements only;
-- 010-tenant-rls.sql forces it again after every migration run. A fresh database has no academies
-- (and no plans yet), so this does nothing there.
ALTER TABLE "tenant" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "subscription" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "tenant_onboarding" NO FORCE ROW LEVEL SECURITY;

INSERT INTO "subscription" ("tenant_id", "plan_key", "status", "trial_ends_at", "entitlements", "updated_at")
SELECT t."id", 'trial', 'TRIAL', now() + interval '30 days',
       jsonb_build_object(
         'limits', (SELECT jsonb_object_agg(e."key", e."limit") FROM "plan_entitlement" e
                     WHERE e."plan_key" = 'trial' AND e."kind" = 'LIMIT'),
         'features', (SELECT jsonb_object_agg(e."key", e."enabled") FROM "plan_entitlement" e
                       WHERE e."plan_key" = 'trial' AND e."kind" = 'FEATURE')),
       now()
  FROM "tenant" t
 WHERE EXISTS (SELECT 1 FROM "plan" WHERE "key" = 'trial')
   AND NOT EXISTS (SELECT 1 FROM "subscription" s WHERE s."tenant_id" = t."id");

INSERT INTO "tenant_onboarding" ("tenant_id", "current_step", "completed_at", "updated_at")
SELECT t."id",
       CASE WHEN t."status" IN ('SETUP', 'PENDING_APPROVAL') THEN 'profile' ELSE 'ready' END,
       CASE WHEN t."status" IN ('SETUP', 'PENDING_APPROVAL') THEN NULL ELSE now() END,
       now()
  FROM "tenant" t
 WHERE NOT EXISTS (SELECT 1 FROM "tenant_onboarding" o WHERE o."tenant_id" = t."id");

ALTER TABLE "tenant" FORCE ROW LEVEL SECURITY;
ALTER TABLE "subscription" FORCE ROW LEVEL SECURITY;
ALTER TABLE "tenant_onboarding" FORCE ROW LEVEL SECURITY;
