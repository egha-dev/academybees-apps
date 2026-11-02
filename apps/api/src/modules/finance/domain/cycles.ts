import { addDays } from '@academybee/contracts';

import { type Discount, discountOn, prorate, splitByWeights, splitInstalments } from './money.js';

/**
 * Billing cycles and what one cycle charges (C-139, C-140, C-147). Pure: dates are academy-local
 * `YYYY-MM-DD`, amounts integer minor units.
 */

export type CycleRule = {
  cycle: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUAL' | 'CUSTOM';
  cycleMonths: number | null;
};
export type Cycle = { start: string; end: string };

const MONTHS = { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, ANNUAL: 12 } as const;

export const monthsPerCycle = (rule: CycleRule): number =>
  rule.cycle === 'CUSTOM' ? (rule.cycleMonths ?? 1) : MONTHS[rule.cycle];

/** The same day `n` months on, or the last day of a shorter month. */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const index = y * 12 + (m - 1) + n;
  const year = Math.floor(index / 12);
  const month = index - year * 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${year}-${pad(month + 1)}-${pad(Math.min(d, last))}`;
}

/** Days from `from` to `to`, both counted. */
export const daysInclusive = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/**
 * The cycle holding `date` (C-139). Fixed cycles start on the 1st and line up with April (the
 * fiscal year): quarters from Apr/Jul/Oct/Jan, half-years from Apr/Oct, years from Apr. Custom
 * cycles run from the assignment's own start date.
 */
export function cycleAt(date: string, rule: CycleRule, anchor: string): Cycle {
  const months = monthsPerCycle(rule);
  let start: string;
  if (rule.cycle === 'CUSTOM') {
    let k = 0;
    while (addMonths(anchor, (k + 1) * months) <= date) k += 1;
    start = addMonths(anchor, k * months);
    return { start, end: addDays(addMonths(anchor, (k + 1) * months), -1) };
  }
  const month = Number(date.slice(5, 7));
  const back = ((month - 4 + 12) % 12) % months;
  start = addMonths(`${date.slice(0, 7)}-01`, -back);
  return { start, end: addDays(addMonths(start, months), -1) };
}

/**
 * Cycles to bill today: the one running now and any starting within `daysBefore`, once the
 * assignment has begun and before it ended. Cycles already over are never back-billed (C-147):
 * old dues come in as opening balances or manual invoices.
 */
export function dueCycles(input: {
  rule: CycleRule;
  startsOn: string;
  endsOn: string | null;
  today: string;
  daysBefore: number;
}): Cycle[] {
  const { rule, startsOn, endsOn, today, daysBefore } = input;
  const out: Cycle[] = [];
  const horizon = addDays(today, daysBefore);
  let cycle = cycleAt(today > startsOn ? today : startsOn, rule, startsOn);
  while (cycle.start <= horizon && (endsOn === null || cycle.start <= endsOn)) {
    if (endsOn === null || endsOn >= startsOn) out.push(cycle);
    const next = addDays(cycle.end, 1);
    cycle = cycleAt(next, rule, startsOn);
  }
  return out;
}

/** Due on day `dueDay` of the cycle (C-139); never before the student starts or today. */
export function dueDateFor(cycle: Cycle, dueDay: number, startsOn: string, today: string): string {
  return [addDays(cycle.start, dueDay - 1), startsOn, today].reduce((a, b) => (a > b ? a : b));
}

/** When each instalment falls due: spaced through the cycle from the first due date (G-04). */
export function instalmentDueDates(firstDue: string, cycle: Cycle, count: number): string[] {
  const months = Math.max(1, Math.round((daysInclusive(cycle.start, cycle.end) + 1) / 30));
  const span = Math.max(0, daysInclusive(firstDue, cycle.end) - 1);
  return Array.from({ length: count }, (_, i) =>
    months >= count
      ? addMonths(firstDue, Math.floor((i * months) / count))
      : addDays(firstDue, Math.floor((i * span) / count)),
  );
}

export type MidCycleRule = 'FULL' | 'PRORATE_DAYS' | 'PRORATE_SESSIONS' | 'NEXT_CYCLE';

/**
 * How much of a cycle a student who began on `joined` pays for (G-04): `null` = all of it,
 * `'skip'` = nothing, otherwise a share. Without class counts, sessions fall back to days.
 */
export function cycleShare(input: {
  cycle: Cycle;
  joined: string;
  rule: MidCycleRule;
  sessions: { used: number; of: number } | null;
}): { used: number; of: number } | 'skip' | null {
  const { cycle, joined, rule, sessions } = input;
  if (joined <= cycle.start || rule === 'FULL') return null;
  if (rule === 'NEXT_CYCLE') return 'skip';
  if (rule === 'PRORATE_SESSIONS' && sessions && sessions.of > 0) return sessions;
  return { used: daysInclusive(joined, cycle.end), of: daysInclusive(cycle.start, cycle.end) };
}

export type FeeComponentInput = { name: string; amountMinor: number; taxable: boolean };
export type CycleInvoice = {
  charges: { label: string; amountMinor: number; quantity: number; taxable: boolean }[];
  discounts: { label: string; amountMinor: number }[];
};

/**
 * One cycle's invoices (G-04): components (prorated if asked) less the student's own discount and
 * the sibling discount, on one invoice or split into instalments. Every split adds back up
 * exactly; nothing to charge means no invoices.
 */
export function cycleInvoices(input: {
  components: FeeComponentInput[];
  share: { used: number; of: number } | null;
  own: { discount: Discount | null; label: string };
  sibling: { discount: Discount | null; label: string };
  instalments: number | null;
}): CycleInvoice[] {
  const { components, share, own, sibling } = input;
  const count = Math.max(input.instalments ?? 1, 1);
  const amounts = components.map((c) =>
    share ? prorate(c.amountMinor, share.used, share.of) : c.amountMinor,
  );
  const gross = amounts.reduce((a, b) => a + b, 0);
  if (gross <= 0) return [];
  const ownMinor = discountOn(gross, own.discount);
  const siblingMinor = discountOn(gross - ownMinor, sibling.discount);
  const parts = amounts.map((a) => splitInstalments(a, count));
  const grosses = Array.from({ length: count }, (_, i) => parts.reduce((sum, p) => sum + p[i]!, 0));
  const totals = splitByWeights(ownMinor + siblingMinor, grosses);
  const owns = splitByWeights(ownMinor, totals);
  return grosses.map((_, i) => ({
    charges: components
      .map((c, j) => ({
        label: c.name,
        amountMinor: parts[j]![i]!,
        quantity: 1,
        taxable: c.taxable,
      }))
      .filter((c) => c.amountMinor > 0),
    discounts: [
      { label: own.label, amountMinor: owns[i]! },
      { label: sibling.label, amountMinor: totals[i]! - owns[i]! },
    ].filter((d) => d.amountMinor > 0),
  }));
}

/** Everyone after the first child of each parent, by admission (C-138). */
export function laterChildren(
  links: { parentId: string; studentId: string; admissionDate: string }[],
): Set<string> {
  const byParent = new Map<string, typeof links>();
  for (const l of links) byParent.set(l.parentId, [...(byParent.get(l.parentId) ?? []), l]);
  const later = new Set<string>();
  for (const group of byParent.values()) {
    const sorted = [...group].sort(
      (a, b) =>
        a.admissionDate.localeCompare(b.admissionDate) || a.studentId.localeCompare(b.studentId),
    );
    for (const l of sorted.slice(1)) later.add(l.studentId);
  }
  return later;
}
