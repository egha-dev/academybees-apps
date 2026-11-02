-- CreateEnum
CREATE TYPE "fee_cycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "fee_record_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "discount_kind" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "invoice_kind" AS ENUM ('REGULAR', 'ONE_TIME', 'OPENING_BALANCE', 'LATE_FEE', 'INSTALMENT');

-- CreateEnum
CREATE TYPE "invoice_line_kind" AS ENUM ('CHARGE', 'DISCOUNT', 'TAX');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD_POS', 'ONLINE_GATEWAY');

-- CreateEnum
CREATE TYPE "payment_source" AS ENUM ('STAFF_RECORDED', 'PARENT_REPORTED', 'GATEWAY');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('INITIATED', 'PENDING', 'CONFIRMED', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "credit_entry_kind" AS ENUM ('OVERPAYMENT', 'APPLIED', 'REFUNDED', 'MANUAL');

-- CreateEnum
CREATE TYPE "number_kind" AS ENUM ('INVOICE', 'RECEIPT');

-- CreateEnum
CREATE TYPE "gateway_mode" AS ENUM ('TEST', 'LIVE');

-- CreateEnum
CREATE TYPE "gateway_account_status" AS ENUM ('PENDING', 'CONNECTED', 'DISABLED');

-- CreateEnum
CREATE TYPE "document_kind" AS ENUM ('INVOICE', 'RECEIPT');

-- CreateEnum
CREATE TYPE "document_status" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "fee_plan" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "cycle" "fee_cycle" NOT NULL,
    "cycle_months" SMALLINT,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "status" "fee_record_status" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fee_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_component" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_assignment" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "batch_id" UUID,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "discount_kind" "discount_kind",
    "discount_value" INTEGER,
    "discount_reason" VARCHAR(200),
    "instalments" SMALLINT,
    "status" "fee_record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fee_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "assignment_id" UUID,
    "kind" "invoice_kind" NOT NULL,
    "status" "invoice_status" NOT NULL DEFAULT 'DRAFT',
    "number" VARCHAR(40),
    "cycle_start" DATE,
    "cycle_end" DATE,
    "instalment_no" SMALLINT,
    "instalment_of" SMALLINT,
    "issue_date" DATE,
    "due_date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "subtotal_minor" INTEGER NOT NULL DEFAULT 0,
    "discount_minor" INTEGER NOT NULL DEFAULT 0,
    "tax_minor" INTEGER NOT NULL DEFAULT 0,
    "total_minor" INTEGER NOT NULL DEFAULT 0,
    "paid_minor" INTEGER NOT NULL DEFAULT 0,
    "credit_applied_minor" INTEGER NOT NULL DEFAULT 0,
    "written_off_minor" INTEGER NOT NULL DEFAULT 0,
    "overdue_since" DATE,
    "snapshot" JSONB,
    "note" VARCHAR(500),
    "close_reason" VARCHAR(500),
    "closed_at" TIMESTAMPTZ(3),
    "closed_by_id" UUID,
    "created_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "kind" "invoice_line_kind" NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "quantity" SMALLINT NOT NULL DEFAULT 1,
    "unit_minor" INTEGER NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "method" "payment_method" NOT NULL,
    "source" "payment_source" NOT NULL,
    "status" "payment_status" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "refunded_minor" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "reference" VARCHAR(80),
    "cheque_bank" VARCHAR(80),
    "cheque_date" DATE,
    "paid_on" DATE NOT NULL,
    "receipt_number" VARCHAR(40),
    "evidence_key" VARCHAR(300),
    "note" VARCHAR(500),
    "client_ref" UUID,
    "duplicate_flag" BOOLEAN NOT NULL DEFAULT false,
    "recorded_by_id" UUID,
    "reported_by_user_id" UUID,
    "verified_by_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "rejection_reason" VARCHAR(500),
    "confirmed_at" TIMESTAMPTZ(3),
    "provider_account_id" UUID,
    "provider_order_id" VARCHAR(100),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocation" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "method" "payment_method" NOT NULL,
    "reference" VARCHAR(80),
    "reason" VARCHAR(500) NOT NULL,
    "refunded_on" DATE NOT NULL,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_entry" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "kind" "credit_entry_kind" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "payment_id" UUID,
    "invoice_id" UUID,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "note" VARCHAR(500),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequence" (
    "tenant_id" UUID NOT NULL,
    "kind" "number_kind" NOT NULL,
    "fiscal_year" VARCHAR(9) NOT NULL,
    "prefix" VARCHAR(12) NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "number_sequence_pkey" PRIMARY KEY ("tenant_id","kind","fiscal_year")
);

-- CreateTable
CREATE TABLE "tenant_payment_account" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "account_ref" VARCHAR(64) NOT NULL,
    "mode" "gateway_mode" NOT NULL,
    "status" "gateway_account_status" NOT NULL DEFAULT 'PENDING',
    "credentials_cipher" TEXT NOT NULL,
    "webhook_cipher" TEXT NOT NULL,
    "connected_at" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_payment_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_event" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "provider_event_id" VARCHAR(100) NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "payload" JSONB NOT NULL,
    "payment_id" UUID,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "gateway_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_document" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" "document_kind" NOT NULL,
    "invoice_id" UUID,
    "payment_id" UUID,
    "layout" VARCHAR(10) NOT NULL,
    "status" "document_status" NOT NULL DEFAULT 'PENDING',
    "storage_key" VARCHAR(300),
    "error" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMPTZ(3),

    CONSTRAINT "finance_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_link" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_by_id" UUID NOT NULL,
    "open_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_plan_tenant_id_status_name_idx" ON "fee_plan"("tenant_id", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "fee_plan_tenant_id_id_key" ON "fee_plan"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "fee_component_tenant_id_plan_id_sort_order_idx" ON "fee_component"("tenant_id", "plan_id", "sort_order");

-- CreateIndex
CREATE INDEX "fee_assignment_tenant_id_student_id_status_idx" ON "fee_assignment"("tenant_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "fee_assignment_tenant_id_plan_id_idx" ON "fee_assignment"("tenant_id", "plan_id");

-- CreateIndex
CREATE INDEX "fee_assignment_tenant_id_batch_id_idx" ON "fee_assignment"("tenant_id", "batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_assignment_tenant_id_id_key" ON "fee_assignment"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "invoice_tenant_id_status_due_date_idx" ON "invoice"("tenant_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "invoice_tenant_id_student_id_due_date_idx" ON "invoice"("tenant_id", "student_id", "due_date");

-- CreateIndex
CREATE INDEX "invoice_tenant_id_assignment_id_cycle_start_idx" ON "invoice"("tenant_id", "assignment_id", "cycle_start");

-- CreateIndex
CREATE INDEX "invoice_tenant_id_created_at_id_idx" ON "invoice"("tenant_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_tenant_id_id_key" ON "invoice"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_tenant_id_number_key" ON "invoice"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "invoice_line_tenant_id_invoice_id_sort_order_idx" ON "invoice_line"("tenant_id", "invoice_id", "sort_order");

-- CreateIndex
CREATE INDEX "payment_tenant_id_status_created_at_idx" ON "payment"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "payment_tenant_id_student_id_paid_on_idx" ON "payment"("tenant_id", "student_id", "paid_on");

-- CreateIndex
CREATE INDEX "payment_tenant_id_reference_idx" ON "payment"("tenant_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_tenant_id_id_key" ON "payment"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_tenant_id_receipt_number_key" ON "payment"("tenant_id", "receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "payment_tenant_id_client_ref_key" ON "payment"("tenant_id", "client_ref");

-- CreateIndex
CREATE INDEX "payment_allocation_tenant_id_payment_id_idx" ON "payment_allocation"("tenant_id", "payment_id");

-- CreateIndex
CREATE INDEX "payment_allocation_tenant_id_invoice_id_idx" ON "payment_allocation"("tenant_id", "invoice_id");

-- CreateIndex
CREATE INDEX "refund_tenant_id_payment_id_idx" ON "refund"("tenant_id", "payment_id");

-- CreateIndex
CREATE INDEX "credit_entry_tenant_id_student_id_created_at_idx" ON "credit_entry"("tenant_id", "student_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_payment_account_account_ref_key" ON "tenant_payment_account"("account_ref");

-- CreateIndex
CREATE INDEX "tenant_payment_account_tenant_id_status_idx" ON "tenant_payment_account"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_payment_account_tenant_id_id_key" ON "tenant_payment_account"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "gateway_event_tenant_id_received_at_idx" ON "gateway_event"("tenant_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_event_provider_provider_event_id_key" ON "gateway_event"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "finance_document_tenant_id_invoice_id_idx" ON "finance_document"("tenant_id", "invoice_id");

-- CreateIndex
CREATE INDEX "finance_document_tenant_id_payment_id_idx" ON "finance_document"("tenant_id", "payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_document_tenant_id_id_key" ON "finance_document"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "share_link_token_hash_key" ON "share_link"("token_hash");

-- CreateIndex
CREATE INDEX "share_link_tenant_id_document_id_idx" ON "share_link"("tenant_id", "document_id");

-- AddForeignKey
ALTER TABLE "fee_plan" ADD CONSTRAINT "fee_plan_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_component" ADD CONSTRAINT "fee_component_tenant_id_plan_id_fkey" FOREIGN KEY ("tenant_id", "plan_id") REFERENCES "fee_plan"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_assignment" ADD CONSTRAINT "fee_assignment_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_assignment" ADD CONSTRAINT "fee_assignment_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_assignment" ADD CONSTRAINT "fee_assignment_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_assignment" ADD CONSTRAINT "fee_assignment_tenant_id_plan_id_fkey" FOREIGN KEY ("tenant_id", "plan_id") REFERENCES "fee_plan"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_assignment" ADD CONSTRAINT "fee_assignment_tenant_id_batch_id_fkey" FOREIGN KEY ("tenant_id", "batch_id") REFERENCES "batch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id", "assignment_id") REFERENCES "fee_assignment"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_tenant_id_invoice_id_fkey" FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "invoice"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_tenant_id_payment_id_fkey" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payment"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_tenant_id_invoice_id_fkey" FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "invoice"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_tenant_id_payment_id_fkey" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payment"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entry" ADD CONSTRAINT "credit_entry_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entry" ADD CONSTRAINT "credit_entry_tenant_id_payment_id_fkey" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payment"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entry" ADD CONSTRAINT "credit_entry_tenant_id_invoice_id_fkey" FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "invoice"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_sequence" ADD CONSTRAINT "number_sequence_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_payment_account" ADD CONSTRAINT "tenant_payment_account_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_event" ADD CONSTRAINT "gateway_event_tenant_id_account_id_fkey" FOREIGN KEY ("tenant_id", "account_id") REFERENCES "tenant_payment_account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_document" ADD CONSTRAINT "finance_document_tenant_id_invoice_id_fkey" FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "invoice"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_document" ADD CONSTRAINT "finance_document_tenant_id_payment_id_fkey" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payment"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id", "document_id") REFERENCES "finance_document"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

