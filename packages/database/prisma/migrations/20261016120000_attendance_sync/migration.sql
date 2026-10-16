-- CreateEnum
CREATE TYPE "attendance_status" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'LEAVE');

-- CreateEnum
CREATE TYPE "sync_operation_status" AS ENUM ('APPLIED', 'REJECTED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "notification_kind" AS ENUM ('ATTENDANCE_NOT_TAKEN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notification_intent_kind" ADD VALUE 'ATTENDANCE_ABSENT';
ALTER TYPE "notification_intent_kind" ADD VALUE 'ATTENDANCE_LATE';

-- AlterTable
ALTER TABLE "notification_intent" ADD COLUMN     "session_id" UUID;

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "session_date" DATE NOT NULL,
    "status" "attendance_status" NOT NULL,
    "note" VARCHAR(500),
    "marked_by_id" UUID NOT NULL,
    "marked_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_change" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "attendance_id" UUID NOT NULL,
    "from_status" "attendance_status",
    "to_status" "attendance_status" NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "op_id" UUID,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_operation" (
    "tenant_id" UUID NOT NULL,
    "op_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "entity_key" VARCHAR(200) NOT NULL,
    "status" "sync_operation_status" NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_operation_pkey" PRIMARY KEY ("tenant_id","op_id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "kind" "notification_kind" NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "link" VARCHAR(300),
    "dedupe_key" VARCHAR(200) NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_tenant_id_student_id_session_date_idx" ON "attendance"("tenant_id", "student_id", "session_date");

-- CreateIndex
CREATE INDEX "attendance_tenant_id_batch_id_session_date_idx" ON "attendance"("tenant_id", "batch_id", "session_date");

-- CreateIndex
CREATE INDEX "attendance_tenant_id_updated_at_id_idx" ON "attendance"("tenant_id", "updated_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_tenant_id_id_key" ON "attendance"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_tenant_id_session_id_student_id_key" ON "attendance"("tenant_id", "session_id", "student_id");

-- CreateIndex
CREATE INDEX "attendance_change_tenant_id_attendance_id_changed_at_idx" ON "attendance_change"("tenant_id", "attendance_id", "changed_at");

-- CreateIndex
CREATE INDEX "sync_operation_tenant_id_membership_id_created_at_idx" ON "sync_operation"("tenant_id", "membership_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_tenant_id_recipient_id_created_at_idx" ON "notification"("tenant_id", "recipient_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_tenant_id_dedupe_key_key" ON "notification"("tenant_id", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "notification_intent_tenant_id_kind_session_id_student_id_key" ON "notification_intent"("tenant_id", "kind", "session_id", "student_id");

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_tenant_id_batch_id_fkey" FOREIGN KEY ("tenant_id", "batch_id") REFERENCES "batch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_tenant_id_session_id_fkey" FOREIGN KEY ("tenant_id", "session_id") REFERENCES "class_session"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_tenant_id_marked_by_id_fkey" FOREIGN KEY ("tenant_id", "marked_by_id") REFERENCES "membership"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_change" ADD CONSTRAINT "attendance_change_tenant_id_attendance_id_fkey" FOREIGN KEY ("tenant_id", "attendance_id") REFERENCES "attendance"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_change" ADD CONSTRAINT "attendance_change_tenant_id_changed_by_id_fkey" FOREIGN KEY ("tenant_id", "changed_by_id") REFERENCES "membership"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_operation" ADD CONSTRAINT "sync_operation_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "membership"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_tenant_id_recipient_id_fkey" FOREIGN KEY ("tenant_id", "recipient_id") REFERENCES "membership"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_intent" ADD CONSTRAINT "notification_intent_tenant_id_session_id_fkey" FOREIGN KEY ("tenant_id", "session_id") REFERENCES "class_session"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

