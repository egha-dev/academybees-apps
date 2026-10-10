-- Phase 4 S2 (C-105, C-102, ADR-027): name search, activity timeline, teacher subjects, parent
-- invitations. Expand-only. pg_trgm is a trusted extension: the schema owner can create it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- AlterTable
ALTER TABLE "invitation" ADD COLUMN     "parent_id" UUID;

-- AlterTable
ALTER TABLE "teacher" ADD COLUMN     "subjects" VARCHAR(60)[] DEFAULT ARRAY[]::VARCHAR(60)[];

-- CreateTable
CREATE TABLE "activity_event" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entity_type" VARCHAR(20) NOT NULL,
    "entity_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "actor_membership_id" UUID,
    "data" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_event_tenant_id_entity_type_entity_id_at_id_idx" ON "activity_event"("tenant_id", "entity_type", "entity_id", "at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "invitation_tenant_id_parent_id_idx" ON "invitation"("tenant_id", "parent_id");

-- CreateIndex
CREATE INDEX "parent_full_name_trgm" ON "parent" USING GIN ("full_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "student_tenant_id_full_name_id_idx" ON "student"("tenant_id", "full_name", "id");

-- CreateIndex
CREATE INDEX "student_full_name_trgm" ON "student" USING GIN ("full_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "teacher_full_name_trgm" ON "teacher" USING GIN ("full_name" gin_trgm_ops);

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_tenant_id_parent_id_fkey" FOREIGN KEY ("tenant_id", "parent_id") REFERENCES "parent"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

