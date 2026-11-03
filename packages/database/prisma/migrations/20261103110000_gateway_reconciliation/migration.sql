-- CreateEnum
CREATE TYPE "reconciliation_kind" AS ENUM ('UNKNOWN_ORDER', 'AMOUNT_MISMATCH', 'PAID_AFTER_FAILED', 'STUCK_PENDING', 'SETTLEMENT_MISMATCH');

-- CreateEnum
CREATE TYPE "reconciliation_status" AS ENUM ('OPEN', 'RESOLVED');

-- DropIndex
DROP INDEX "gateway_event_provider_provider_event_id_key";

-- CreateTable
CREATE TABLE "reconciliation_exception" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "payment_id" UUID,
    "kind" "reconciliation_kind" NOT NULL,
    "reference" VARCHAR(100) NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "dedupe_key" VARCHAR(200) NOT NULL,
    "status" "reconciliation_status" NOT NULL DEFAULT 'OPEN',
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "resolution" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_exception_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reconciliation_exception_tenant_id_status_id_idx" ON "reconciliation_exception"("tenant_id", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_exception_tenant_id_dedupe_key_key" ON "reconciliation_exception"("tenant_id", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_event_tenant_id_provider_provider_event_id_key" ON "gateway_event"("tenant_id", "provider", "provider_event_id");

-- AddForeignKey
ALTER TABLE "reconciliation_exception" ADD CONSTRAINT "reconciliation_exception_tenant_id_account_id_fkey" FOREIGN KEY ("tenant_id", "account_id") REFERENCES "tenant_payment_account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_exception" ADD CONSTRAINT "reconciliation_exception_tenant_id_payment_id_fkey" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payment"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

