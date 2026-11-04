/**
 * Typed amounts ↔ minor units (ADR-010). Written by hand, with no floats on the way in: "1,500.50"
 * is 150050. Indian and Western grouping both read the same.
 */
export function minorFromText(text: string, digits = 2): number | null {
  const clean = text.trim().replace(/[₹,\s]/g, '');
  const match = /^(\d{1,10})(?:\.(\d*))?$/.exec(clean);
  if (!match) return null;
  const fraction = match[2] ?? '';
  if (fraction.length > digits) return null;
  return Number(match[1]) * 10 ** digits + Number(fraction.padEnd(digits, '0') || 0);
}

/** The amount as it should sit in a field: no grouping, and no `.00` for whole amounts. */
export function majorText(minor: number, digits = 2): string {
  const scale = 10 ** digits;
  const whole = Math.trunc(minor / scale);
  const rest = minor % scale;
  return rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(digits, '0')}`;
}
