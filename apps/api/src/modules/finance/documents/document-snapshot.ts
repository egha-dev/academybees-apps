import type { TransactionClient } from '@academybee/database';
import { z } from 'zod';

const AcademySchema = z.object({
  name: z.string(),
  logoKey: z.string().nullish(),
  primaryColor: z.string().nullish(),
});
const StudentSchema = z.object({ name: z.string(), admissionNo: z.string().nullish() });

/**
 * What an invoice says, frozen at issue. Snapshots from before S6 have no branding or payment
 * details; those parts just don't print.
 */
export const InvoiceSnapshotSchema = z.object({
  academy: AcademySchema,
  student: StudentSchema,
  tax: z
    .object({
      gstin: z.string(),
      rateBps: z.number(),
      mode: z.enum(['INCLUSIVE', 'EXCLUSIVE']),
      label: z.string().optional(),
    })
    .nullish(),
  payTo: z
    .object({
      upi: z.object({ vpa: z.string(), payeeName: z.string() }).nullable(),
      bank: z
        .object({
          accountName: z.string(),
          accountNumber: z.string(),
          ifsc: z.string(),
          bankName: z.string(),
        })
        .nullable(),
    })
    .nullish(),
  lines: z.array(
    z.object({
      kind: z.string(),
      label: z.string(),
      quantity: z.number(),
      unitMinor: z.number(),
      amountMinor: z.number(),
    }),
  ),
  totals: z.object({
    subtotalMinor: z.number(),
    discountMinor: z.number(),
    taxMinor: z.number(),
    totalMinor: z.number(),
  }),
});
export type InvoiceSnapshot = z.infer<typeof InvoiceSnapshotSchema>;

/** What a receipt says, frozen at confirmation with its number. */
export const ReceiptSnapshotSchema = z.object({
  academy: AcademySchema,
  gstin: z.string().nullable(),
  student: StudentSchema,
  method: z.string(),
  reference: z.string().nullable(),
  paidOn: z.string(),
  currency: z.string(),
  amountMinor: z.number(),
  creditMinor: z.number(),
  allocations: z.array(
    z.object({
      invoiceNumber: z.string(),
      amountMinor: z.number(),
      balanceAfterMinor: z.number(),
    }),
  ),
});
export type ReceiptSnapshot = z.infer<typeof ReceiptSnapshotSchema>;

/** The academy as its documents show it today; the caller freezes this into a snapshot. */
export async function academyOnDocuments(
  tx: Pick<TransactionClient, 'tenantBranding'>,
  fallbackName: string,
): Promise<z.infer<typeof AcademySchema>> {
  const branding = await tx.tenantBranding.findFirst({
    select: { displayName: true, logoKey: true, primaryColor: true },
  });
  return {
    name: branding?.displayName ?? fallbackName,
    logoKey: branding?.logoKey ?? null,
    primaryColor: branding?.primaryColor ?? null,
  };
}
