-- CreateEnum
CREATE TYPE "legal_document_kind" AS ENUM ('TERMS', 'PRIVACY', 'DPA', 'ACADEMY_PRIVACY_TEMPLATE');

-- CreateEnum
CREATE TYPE "entitlement_kind" AS ENUM ('LIMIT', 'FEATURE');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('TRIAL');

-- CreateTable
CREATE TABLE "legal_document" (
    "id" UUID NOT NULL,
    "kind" "legal_document_kind" NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL,
    "variants" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_acceptance" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID,
    "document_id" UUID NOT NULL,
    "locale" VARCHAR(20) NOT NULL,
    "ip" VARCHAR(64),
    "accepted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_acceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan" (
    "key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "trial_days" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "plan_entitlement" (
    "plan_key" VARCHAR(40) NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "kind" "entitlement_kind" NOT NULL,
    "limit" INTEGER,
    "enabled" BOOLEAN,

    CONSTRAINT "plan_entitlement_pkey" PRIMARY KEY ("plan_key","key")
);

-- CreateTable
CREATE TABLE "subscription" (
    "tenant_id" UUID NOT NULL,
    "plan_key" VARCHAR(40) NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'TRIAL',
    "trial_ends_at" TIMESTAMPTZ(3),
    "entitlements" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "subscription_override" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "kind" "entitlement_kind" NOT NULL,
    "limit" INTEGER,
    "enabled" BOOLEAN,
    "reason" VARCHAR(500) NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_override_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legal_document_kind_version_key" ON "legal_document"("kind", "version");

-- CreateIndex
CREATE INDEX "legal_acceptance_tenant_id_idx" ON "legal_acceptance"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "legal_acceptance_user_id_document_id_key" ON "legal_acceptance"("user_id", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_override_tenant_id_key_key" ON "subscription_override"("tenant_id", "key");

-- AddForeignKey
ALTER TABLE "legal_acceptance" ADD CONSTRAINT "legal_acceptance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_acceptance" ADD CONSTRAINT "legal_acceptance_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_entitlement" ADD CONSTRAINT "plan_entitlement_plan_key_fkey" FOREIGN KEY ("plan_key") REFERENCES "plan"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_plan_key_fkey" FOREIGN KEY ("plan_key") REFERENCES "plan"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_override" ADD CONSTRAINT "subscription_override_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
