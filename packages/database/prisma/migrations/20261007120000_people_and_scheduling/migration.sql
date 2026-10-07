-- CreateEnum
CREATE TYPE "student_status" AS ENUM ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'LEFT');

-- CreateEnum
CREATE TYPE "gender" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "person_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "consent_action" AS ENUM ('GRANT', 'WITHDRAW');

-- CreateEnum
CREATE TYPE "consent_channel" AS ENUM ('FAMILY_HUB', 'ACADEMY_STAFF', 'PAPER');

-- CreateEnum
CREATE TYPE "custom_field_type" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT');

-- CreateEnum
CREATE TYPE "schedule_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "session_origin" AS ENUM ('GENERATED', 'MANUAL');

-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "student" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "admission_no" VARCHAR(30) NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "preferred_name" VARCHAR(60),
    "date_of_birth" DATE,
    "gender" "gender",
    "school_name" VARCHAR(120),
    "grade" VARCHAR(40),
    "admission_date" DATE NOT NULL,
    "address" JSONB,
    "emergency_contact" JSONB,
    "photo_media_id" UUID,
    "user_id" UUID,
    "tags" VARCHAR(40)[] DEFAULT ARRAY[]::VARCHAR(40)[],
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "status" "student_status" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_health_note" (
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "notes" VARCHAR(2000) NOT NULL,
    "updated_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_health_note_pkey" PRIMARY KEY ("tenant_id","student_id")
);

-- CreateTable
CREATE TABLE "parent" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(16),
    "whatsapp_capable" BOOLEAN NOT NULL DEFAULT false,
    "email" VARCHAR(320),
    "preferred_locale" VARCHAR(20),
    "occupation" VARCHAR(80),
    "user_id" UUID,
    "status" "person_status" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "parent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_student" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "relationship" VARCHAR(20) NOT NULL,
    "is_primary_contact" BOOLEAN NOT NULL DEFAULT false,
    "pickup_authorised" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "membership_id" UUID,
    "invitation_id" UUID,
    "full_name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(16),
    "status" "person_status" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_record" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "action" "consent_action" NOT NULL,
    "purposes" VARCHAR(40)[],
    "notice_version" VARCHAR(20) NOT NULL,
    "channel" "consent_channel" NOT NULL,
    "recorded_by_id" UUID,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_definition" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entity" VARCHAR(20) NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "label" JSONB NOT NULL,
    "type" "custom_field_type" NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "custom_field_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_sequence" (
    "tenant_id" UUID NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "next_value" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_sequence_pkey" PRIMARY KEY ("tenant_id","key")
);

-- CreateTable
CREATE TABLE "course" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000),
    "status" "schedule_status" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_level" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "course_level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "level_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "capacity" INTEGER,
    "starts_on" DATE,
    "ends_on" DATE,
    "status" "schedule_status" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_teacher" (
    "tenant_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_teacher_pkey" PRIMARY KEY ("batch_id","teacher_id")
);

-- CreateTable
CREATE TABLE "batch_enrolment" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "started_on" DATE NOT NULL,
    "ended_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "batch_enrolment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_rule" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "teacher_id" UUID,
    "weekday" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schedule_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_session" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "schedule_rule_id" UUID,
    "teacher_id" UUID,
    "session_date" DATE NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "origin" "session_origin" NOT NULL,
    "status" "session_status" NOT NULL DEFAULT 'SCHEDULED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "class_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_onboarding" (
    "tenant_id" UUID NOT NULL,
    "current_step" VARCHAR(20) NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '{}',
    "completed_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_onboarding_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateIndex
CREATE INDEX "student_tenant_id_user_id_idx" ON "student"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "student_tenant_id_branch_id_status_idx" ON "student"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_tenant_id_admission_no_key" ON "student"("tenant_id", "admission_no");

-- CreateIndex
CREATE UNIQUE INDEX "student_tenant_id_id_key" ON "student"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "parent_tenant_id_phone_idx" ON "parent"("tenant_id", "phone");

-- CreateIndex
CREATE INDEX "parent_tenant_id_email_idx" ON "parent"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "parent_tenant_id_user_id_idx" ON "parent"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "parent_tenant_id_id_key" ON "parent"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "parent_student_tenant_id_student_id_idx" ON "parent_student"("tenant_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "parent_student_tenant_id_parent_id_student_id_key" ON "parent_student"("tenant_id", "parent_id", "student_id");

-- CreateIndex
CREATE INDEX "teacher_tenant_id_status_idx" ON "teacher"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_tenant_id_id_key" ON "teacher"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_tenant_id_membership_id_key" ON "teacher"("tenant_id", "membership_id");

-- CreateIndex
CREATE INDEX "consent_record_tenant_id_parent_id_student_id_recorded_at_idx" ON "consent_record"("tenant_id", "parent_id", "student_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_definition_tenant_id_entity_key_key" ON "custom_field_definition"("tenant_id", "entity", "key");

-- CreateIndex
CREATE INDEX "course_tenant_id_status_idx" ON "course"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "course_tenant_id_id_key" ON "course"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "course_level_tenant_id_course_id_idx" ON "course_level"("tenant_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_level_tenant_id_id_key" ON "course_level"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "batch_tenant_id_branch_id_status_idx" ON "batch"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "batch_tenant_id_id_key" ON "batch"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "batch_teacher_tenant_id_teacher_id_idx" ON "batch_teacher"("tenant_id", "teacher_id");

-- CreateIndex
CREATE INDEX "batch_enrolment_tenant_id_student_id_idx" ON "batch_enrolment"("tenant_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "batch_enrolment_one_open" ON "batch_enrolment"("tenant_id", "batch_id", "student_id") WHERE (ended_on IS NULL);

-- CreateIndex
CREATE INDEX "schedule_rule_tenant_id_batch_id_idx" ON "schedule_rule"("tenant_id", "batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_rule_tenant_id_id_key" ON "schedule_rule"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "class_session_tenant_id_session_date_idx" ON "class_session"("tenant_id", "session_date");

-- CreateIndex
CREATE INDEX "class_session_tenant_id_batch_id_session_date_idx" ON "class_session"("tenant_id", "batch_id", "session_date");

-- CreateIndex
CREATE UNIQUE INDEX "class_session_tenant_id_schedule_rule_id_session_date_key" ON "class_session"("tenant_id", "schedule_rule_id", "session_date");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_tenant_id_id_key" ON "invitation"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "student" ADD CONSTRAINT "student_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_health_note" ADD CONSTRAINT "student_health_note_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent" ADD CONSTRAINT "parent_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_student" ADD CONSTRAINT "parent_student_tenant_id_parent_id_fkey" FOREIGN KEY ("tenant_id", "parent_id") REFERENCES "parent"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_student" ADD CONSTRAINT "parent_student_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "membership"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_tenant_id_invitation_id_fkey" FOREIGN KEY ("tenant_id", "invitation_id") REFERENCES "invitation"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_tenant_id_parent_id_fkey" FOREIGN KEY ("tenant_id", "parent_id") REFERENCES "parent"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_definition" ADD CONSTRAINT "custom_field_definition_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_sequence" ADD CONSTRAINT "tenant_sequence_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course" ADD CONSTRAINT "course_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_level" ADD CONSTRAINT "course_level_tenant_id_course_id_fkey" FOREIGN KEY ("tenant_id", "course_id") REFERENCES "course"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch" ADD CONSTRAINT "batch_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch" ADD CONSTRAINT "batch_tenant_id_course_id_fkey" FOREIGN KEY ("tenant_id", "course_id") REFERENCES "course"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch" ADD CONSTRAINT "batch_tenant_id_level_id_fkey" FOREIGN KEY ("tenant_id", "level_id") REFERENCES "course_level"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_teacher" ADD CONSTRAINT "batch_teacher_tenant_id_batch_id_fkey" FOREIGN KEY ("tenant_id", "batch_id") REFERENCES "batch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_teacher" ADD CONSTRAINT "batch_teacher_tenant_id_teacher_id_fkey" FOREIGN KEY ("tenant_id", "teacher_id") REFERENCES "teacher"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_enrolment" ADD CONSTRAINT "batch_enrolment_tenant_id_batch_id_fkey" FOREIGN KEY ("tenant_id", "batch_id") REFERENCES "batch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_enrolment" ADD CONSTRAINT "batch_enrolment_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_rule" ADD CONSTRAINT "schedule_rule_tenant_id_batch_id_fkey" FOREIGN KEY ("tenant_id", "batch_id") REFERENCES "batch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_rule" ADD CONSTRAINT "schedule_rule_tenant_id_teacher_id_fkey" FOREIGN KEY ("tenant_id", "teacher_id") REFERENCES "teacher"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_tenant_id_batch_id_fkey" FOREIGN KEY ("tenant_id", "batch_id") REFERENCES "batch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_tenant_id_schedule_rule_id_fkey" FOREIGN KEY ("tenant_id", "schedule_rule_id") REFERENCES "schedule_rule"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_tenant_id_teacher_id_fkey" FOREIGN KEY ("tenant_id", "teacher_id") REFERENCES "teacher"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_onboarding" ADD CONSTRAINT "tenant_onboarding_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

