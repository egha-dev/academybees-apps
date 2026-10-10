-- Phase 4 S6 (G-31, ADR-039, C-107): join requests (tenant RLS) and link attempts (user-owned RLS, 050-family-link.sql). Expand-only.
-- CreateEnum
CREATE TYPE "join_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "join_request" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "parent_name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(16),
    "email" VARCHAR(320),
    "child_name" VARCHAR(120) NOT NULL,
    "message" VARCHAR(500),
    "status" "join_request_status" NOT NULL DEFAULT 'PENDING',
    "parent_id" UUID,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "join_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_link_attempt" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "code_hash" CHAR(64),
    "parent_id" UUID,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academy_link_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "join_request_tenant_id_status_created_at_idx" ON "join_request"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "join_request_tenant_id_user_id_idx" ON "join_request"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "academy_link_attempt_user_id_tenant_id_created_at_idx" ON "academy_link_attempt"("user_id", "tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "join_request" ADD CONSTRAINT "join_request_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

