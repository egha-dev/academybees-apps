-- CreateEnum
CREATE TYPE "audit_actor_type" AS ENUM ('USER', 'PLATFORM_STAFF', 'SYSTEM');

-- CreateEnum
CREATE TYPE "idempotency_status" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "actor_type" "audit_actor_type" NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(60),
    "entity_id" VARCHAR(100),
    "request_id" VARCHAR(100),
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(300),
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_record" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "scope" VARCHAR(300) NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "status" "idempotency_status" NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_event" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "request_id" VARCHAR(100),
    "actor" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatched_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(1000),

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag" (
    "key" VARCHAR(80) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "owner" VARCHAR(80) NOT NULL,
    "expires_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "feature_flag_override" (
    "id" UUID NOT NULL,
    "flag_key" VARCHAR(80) NOT NULL,
    "environment" VARCHAR(20),
    "tenant_id" UUID,
    "enabled" BOOLEAN NOT NULL,
    "reason" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "feature_flag_override_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_created_at_idx" ON "audit_log"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idempotency_record_expires_at_idx" ON "idempotency_record"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_record_scope_key_key" ON "idempotency_record"("scope", "key");

-- CreateIndex
CREATE INDEX "outbox_event_tenant_id_created_at_idx" ON "outbox_event"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "outbox_event_undispatched_idx" ON "outbox_event"("available_at", "id") WHERE (dispatched_at IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "ffo_env_tenant_key" ON "feature_flag_override"("flag_key", "environment", "tenant_id") WHERE (environment IS NOT NULL AND tenant_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "ffo_tenant_key" ON "feature_flag_override"("flag_key", "tenant_id") WHERE (environment IS NULL AND tenant_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "ffo_env_key" ON "feature_flag_override"("flag_key", "environment") WHERE (environment IS NOT NULL AND tenant_id IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "ffo_global_key" ON "feature_flag_override"("flag_key") WHERE (environment IS NULL AND tenant_id IS NULL);

-- AddForeignKey
ALTER TABLE "feature_flag_override" ADD CONSTRAINT "feature_flag_override_flag_key_fkey" FOREIGN KEY ("flag_key") REFERENCES "feature_flag"("key") ON DELETE CASCADE ON UPDATE CASCADE;
