import { AmountMinorSchema } from '@academybee/contracts';

/**
 * A spreadsheet's amount in minor units, or null: `12500`, `12,500.50`, `₹ 1,00,000`. No more
 * than two decimals, above zero; never parsed through a float.
 */
export function parseAmountMinor(value: string): number | null {
  const plain = value.replace(/[₹,\s]/g, '').replace(/^(rs\.?|inr)/i, '');
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(plain);
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return minor > 0 && AmountMinorSchema.safeParse(minor).success ? minor : null;
}
