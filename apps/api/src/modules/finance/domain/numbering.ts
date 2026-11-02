/**
 * Invoice and receipt numbers (ADR-018, C-142): `{prefix}/{FY}/{seq:05}`, with the Indian fiscal
 * year April–March taken from the academy-local date. The sequence itself is a row lock in the
 * database; this only decides which year and how the number reads.
 */

/** `2026-11-02` → `2026-27`; `2027-03-31` → `2026-27`; `2027-04-01` → `2027-28`. */
export function fiscalYearOf(localDate: string): string {
  const [y, m] = localDate.split('-').map(Number) as [number, number];
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function formatNumber(prefix: string, fiscalYear: string, seq: number): string {
  return `${prefix}/${fiscalYear}/${String(seq).padStart(5, '0')}`;
}

export const DEFAULT_PREFIXES = { INVOICE: 'INV', RECEIPT: 'RCT' } as const;

/** Prefixes: capitals, digits and hyphens, 1–12 characters (the database checks it too). */
export const isValidPrefix = (prefix: string) => /^[A-Z0-9-]{1,12}$/.test(prefix);
