-- Phase 7 academy finance (ADR-010, ADR-018, ADR-038, C-137…C-146). Idempotent; applied as
-- ab_migrator after migrations. Tenant isolation itself comes from 010 (every tenant_id table).

-- Money history is never rewritten: allocations, refunds, credit entries and gateway events are
-- append-only; invoices and payments change status in place (versioned) but are never deleted.
REVOKE UPDATE, DELETE, TRUNCATE ON payment_allocation, refund, credit_entry, gateway_event FROM ab_app;
GRANT SELECT, INSERT ON payment_allocation, refund, credit_entry, gateway_event TO ab_app;
-- Gateway events are processed once: only processed_at and payment_id are ever set later.
GRANT UPDATE (processed_at, payment_id) ON gateway_event TO ab_app;
REVOKE DELETE, TRUNCATE ON payment, number_sequence, finance_document, share_link FROM ab_app;
REVOKE TRUNCATE ON invoice, invoice_line FROM ab_app;
-- Only draft invoices (and their lines) can be deleted (ARCHITECTURE §12.1).
DROP POLICY IF EXISTS invoice_delete_drafts ON invoice;
CREATE POLICY invoice_delete_drafts ON invoice AS RESTRICTIVE FOR DELETE TO ab_app
  USING (tenant_id = ab_current_tenant() AND status = 'DRAFT');
DROP POLICY IF EXISTS invoice_line_delete_drafts ON invoice_line;
CREATE POLICY invoice_line_delete_drafts ON invoice_line AS RESTRICTIVE FOR DELETE TO ab_app
  USING (tenant_id = ab_current_tenant() AND EXISTS (
    SELECT 1 FROM invoice i
     WHERE i.tenant_id = invoice_line.tenant_id AND i.id = invoice_line.invoice_id
       AND i.status = 'DRAFT'
  ));

ALTER TABLE fee_component DROP CONSTRAINT IF EXISTS fee_component_shape;
ALTER TABLE fee_component ADD CONSTRAINT fee_component_shape CHECK (amount_minor >= 0);

ALTER TABLE fee_plan DROP CONSTRAINT IF EXISTS fee_plan_shape;
ALTER TABLE fee_plan ADD CONSTRAINT fee_plan_shape CHECK (
  (cycle = 'CUSTOM') = (cycle_months IS NOT NULL) AND (cycle_months IS NULL OR cycle_months BETWEEN 1 AND 36)
);

ALTER TABLE fee_assignment DROP CONSTRAINT IF EXISTS fee_assignment_shape;
ALTER TABLE fee_assignment ADD CONSTRAINT fee_assignment_shape CHECK (
  (ends_on IS NULL OR ends_on >= starts_on)
  AND ((discount_kind IS NULL) = (discount_value IS NULL))
  AND (discount_kind IS DISTINCT FROM 'PERCENT' OR discount_value BETWEEN 1 AND 10000)
  AND (discount_kind IS DISTINCT FROM 'FIXED' OR discount_value > 0)
  AND (instalments IS NULL OR instalments BETWEEN 2 AND 12)
);

-- Totals add up, payments never exceed the total, and a numbered invoice has an issue date.
ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_shape;
ALTER TABLE invoice ADD CONSTRAINT invoice_shape CHECK (
  subtotal_minor >= 0 AND discount_minor >= 0 AND tax_minor >= 0 AND total_minor >= 0
  AND total_minor = subtotal_minor - discount_minor + tax_minor
  AND paid_minor >= 0 AND credit_applied_minor >= 0 AND written_off_minor >= 0
  AND paid_minor + credit_applied_minor + written_off_minor <= total_minor
  AND (status = 'DRAFT') = (number IS NULL)
  AND (number IS NULL OR issue_date IS NOT NULL)
  AND (instalment_no IS NULL OR (instalment_of IS NOT NULL AND instalment_no BETWEEN 1 AND instalment_of))
  AND version >= 1
);
-- Generation is idempotent (C-139): one live invoice per assignment, cycle and instalment.
DROP INDEX IF EXISTS invoice_one_per_cycle;
CREATE UNIQUE INDEX invoice_one_per_cycle ON invoice
  (tenant_id, assignment_id, cycle_start, COALESCE(instalment_no, 0))
  WHERE assignment_id IS NOT NULL AND cycle_start IS NOT NULL AND status <> 'CANCELLED';
DROP INDEX IF EXISTS invoice_overdue;
CREATE INDEX invoice_overdue ON invoice (tenant_id, overdue_since)
  WHERE overdue_since IS NOT NULL;

ALTER TABLE invoice_line DROP CONSTRAINT IF EXISTS invoice_line_shape;
ALTER TABLE invoice_line ADD CONSTRAINT invoice_line_shape CHECK (
  quantity >= 1
  AND (amount_minor = 0 OR (kind = 'DISCOUNT') = (amount_minor < 0))
);

ALTER TABLE payment DROP CONSTRAINT IF EXISTS payment_shape;
ALTER TABLE payment ADD CONSTRAINT payment_shape CHECK (
  amount_minor > 0
  AND refunded_minor BETWEEN 0 AND amount_minor
  AND (status IN ('CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED')) = (confirmed_at IS NOT NULL)
  AND (receipt_number IS NULL OR confirmed_at IS NOT NULL)
  AND (method <> 'CHEQUE' OR reference IS NOT NULL)
  AND (method NOT IN ('UPI', 'BANK_TRANSFER', 'CARD_POS') OR reference IS NOT NULL OR source = 'GATEWAY')
  AND (source <> 'PARENT_REPORTED' OR reported_by_user_id IS NOT NULL)
  AND version >= 1
);
-- ADR-038: the same reference (UTR, cheque number…) can't be recorded twice for one method,
-- unless the earlier payment failed (rejected or bounced).
DROP INDEX IF EXISTS payment_unique_reference;
CREATE UNIQUE INDEX payment_unique_reference ON payment (tenant_id, method, reference)
  WHERE reference IS NOT NULL AND status <> 'FAILED';

ALTER TABLE payment_allocation DROP CONSTRAINT IF EXISTS payment_allocation_shape;
ALTER TABLE payment_allocation ADD CONSTRAINT payment_allocation_shape CHECK (amount_minor > 0);

ALTER TABLE refund DROP CONSTRAINT IF EXISTS refund_shape;
ALTER TABLE refund ADD CONSTRAINT refund_shape CHECK (amount_minor > 0);

ALTER TABLE credit_entry DROP CONSTRAINT IF EXISTS credit_entry_shape;
ALTER TABLE credit_entry ADD CONSTRAINT credit_entry_shape CHECK (
  amount_minor <> 0
  AND (kind <> 'OVERPAYMENT' OR (amount_minor > 0 AND payment_id IS NOT NULL))
  AND (kind NOT IN ('APPLIED', 'REFUNDED') OR amount_minor < 0)
  AND (kind <> 'APPLIED' OR invoice_id IS NOT NULL)
);

ALTER TABLE number_sequence DROP CONSTRAINT IF EXISTS number_sequence_shape;
ALTER TABLE number_sequence ADD CONSTRAINT number_sequence_shape CHECK (
  last_value >= 0 AND fiscal_year ~ '^[0-9]{4}-[0-9]{2}$' AND prefix ~ '^[A-Z0-9-]{1,12}$'
);

ALTER TABLE finance_document DROP CONSTRAINT IF EXISTS finance_document_shape;
ALTER TABLE finance_document ADD CONSTRAINT finance_document_shape CHECK (
  ((kind = 'INVOICE') = (invoice_id IS NOT NULL))
  AND ((kind = 'RECEIPT') = (payment_id IS NOT NULL))
  AND layout IN ('A4', 'MOBILE')
  AND ((status = 'READY') = (storage_key IS NOT NULL))
);
DROP INDEX IF EXISTS finance_document_one;
CREATE UNIQUE INDEX finance_document_one ON finance_document
  (tenant_id, kind, COALESCE(invoice_id, payment_id), layout);
