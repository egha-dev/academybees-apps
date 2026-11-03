-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notification_intent_kind" ADD VALUE 'PAYMENT_CONFIRMED';
ALTER TYPE "notification_intent_kind" ADD VALUE 'PAYMENT_REJECTED';

-- AlterEnum
ALTER TYPE "notification_kind" ADD VALUE 'PAYMENT_REPORTED';

-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "allocate_to" UUID[] DEFAULT ARRAY[]::UUID[];

-- AlterTable
ALTER TABLE "payment_allocation" ADD COLUMN     "refund_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "refund_tenant_id_id_key" ON "refund"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_tenant_id_refund_id_fkey" FOREIGN KEY ("tenant_id", "refund_id") REFERENCES "refund"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

