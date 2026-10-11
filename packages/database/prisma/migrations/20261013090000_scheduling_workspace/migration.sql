-- CreateEnum
CREATE TYPE "session_cancel_reason" AS ENUM ('TEACHER_UNAVAILABLE', 'HOLIDAY', 'OTHER');

-- CreateEnum
CREATE TYPE "holiday_kind" AS ENUM ('HOLIDAY', 'CLOSURE');

-- CreateEnum
CREATE TYPE "notification_intent_kind" AS ENUM ('SESSION_CANCELLED_HOLIDAY');

-- CreateEnum
CREATE TYPE "notification_intent_status" AS ENUM ('PENDING', 'DELIVERED', 'VOID');

-- AlterTable
ALTER TABLE "batch_enrolment" ADD COLUMN     "weekdays" SMALLINT[] DEFAULT ARRAY[]::SMALLINT[];

-- AlterTable
ALTER TABLE "class_session" ADD COLUMN     "cancel_reason" "session_cancel_reason",
ADD COLUMN     "cancelled_at" TIMESTAMPTZ(3),
ADD COLUMN     "cancelled_by_id" UUID,
ADD COLUMN     "holiday_id" UUID,
ADD COLUMN     "makeup_for_session_id" UUID,
ADD COLUMN     "modified_at" TIMESTAMPTZ(3),
ADD COLUMN     "note" VARCHAR(500);

-- CreateTable
CREATE TABLE "holiday" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "kind" "holiday_kind" NOT NULL DEFAULT 'HOLIDAY',
    "created_by_id" UUID,
    "removed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_intent" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" "notification_intent_kind" NOT NULL,
    "student_id" UUID NOT NULL,
    "holiday_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "notification_intent_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_intent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "holiday_tenant_id_start_date_idx" ON "holiday"("tenant_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "holiday_tenant_id_id_key" ON "holiday"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "notification_intent_tenant_id_status_created_at_idx" ON "notification_intent"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_intent_tenant_id_kind_holiday_id_student_id_key" ON "notification_intent"("tenant_id", "kind", "holiday_id", "student_id");

-- CreateIndex
CREATE INDEX "class_session_tenant_id_teacher_id_session_date_idx" ON "class_session"("tenant_id", "teacher_id", "session_date");

-- CreateIndex
CREATE INDEX "class_session_tenant_id_holiday_id_idx" ON "class_session"("tenant_id", "holiday_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_session_tenant_id_id_key" ON "class_session"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_tenant_id_makeup_for_session_id_fkey" FOREIGN KEY ("tenant_id", "makeup_for_session_id") REFERENCES "class_session"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_tenant_id_holiday_id_fkey" FOREIGN KEY ("tenant_id", "holiday_id") REFERENCES "holiday"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday" ADD CONSTRAINT "holiday_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday" ADD CONSTRAINT "holiday_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_intent" ADD CONSTRAINT "notification_intent_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_intent" ADD CONSTRAINT "notification_intent_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_intent" ADD CONSTRAINT "notification_intent_tenant_id_holiday_id_fkey" FOREIGN KEY ("tenant_id", "holiday_id") REFERENCES "holiday"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

