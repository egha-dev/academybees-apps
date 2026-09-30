import { type AppLocale, DEFAULT_LOCALE, DEFAULT_TIME_ZONE, intlLocale } from './locale.js';

/**
 * Money, date and time formatting — the only way UI, emails, PDFs and notifications format
 * these values (ADR-031, G-08). Indian digit grouping comes from Intl for en-IN.
 */
export type MoneyFormatOptions = {
  locale?: AppLocale;
  /** Drop `.00` for whole amounts (dashboards, summaries) — C-40. Finance screens keep 2 decimals. */
  compact?: boolean;
};

const numberFormats = new Map<string, Intl.NumberFormat>();

function currencyFormat(locale: string, currency: string, digits: number): Intl.NumberFormat {
  const key = `${locale}|${currency}|${digits}`;
  let f = numberFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    numberFormats.set(key, f);
  }
  return f;
}

/** Number of minor-unit digits for a currency (INR 2, JPY 0 …). */
export function currencyDigits(currency: string): number {
  return (
    new Intl.NumberFormat(DEFAULT_LOCALE, { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

/**
 * Format integer minor units (ADR-010). `formatMoney(10000000, 'INR')` → `₹1,00,000.00`;
 * with `{ compact: true }` → `₹1,00,000`.
 */
export function formatMoney(
  amountMinor: number | bigint,
  currency: string,
  options: MoneyFormatOptions = {},
): string {
  const locale = intlLocale(options.locale ?? DEFAULT_LOCALE);
  const digits = currencyDigits(currency);
  const minor = BigInt(amountMinor);
  const scale = 10n ** BigInt(digits);
  const whole = minor % scale === 0n;
  const shown = options.compact && whole ? 0 : digits;
  // Exact for amounts up to 2^53 minor units (₹90 trillion) — far beyond any academy total.
  const major = Number(minor) / Number(scale);
  return currencyFormat(locale, currency, shown).format(major);
}

export type DateStyle = 'short' | 'medium' | 'long' | 'full';

/**
 * Format a calendar date. Accepts a `YYYY-MM-DD` calendar date (tenant-local fact, ADR-011 —
 * never shifted by time zone) or an instant (shown in `timeZone`).
 */
export function formatDate(
  value: string | Date,
  options: { locale?: AppLocale; timeZone?: string; style?: DateStyle } = {},
): string {
  const locale = intlLocale(options.locale ?? DEFAULT_LOCALE);
  const style = options.style ?? 'medium';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number];
    return new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: 'UTC' }).format(
      new Date(Date.UTC(y, m - 1, d)),
    );
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: style,
    timeZone: options.timeZone ?? DEFAULT_TIME_ZONE,
  }).format(typeof value === 'string' ? new Date(value) : value);
}

/** Format the time of an instant in the tenant time zone, e.g. `5:30 pm`. */
export function formatTime(
  value: string | Date,
  options: { locale?: AppLocale; timeZone?: string } = {},
): string {
  return new Intl.DateTimeFormat(intlLocale(options.locale ?? DEFAULT_LOCALE), {
    timeStyle: 'short',
    timeZone: options.timeZone ?? DEFAULT_TIME_ZONE,
  }).format(typeof value === 'string' ? new Date(value) : value);
}

/** Plain numbers with locale grouping (`1,00,000`). */
export function formatNumber(value: number, options: { locale?: AppLocale } = {}): string {
  return new Intl.NumberFormat(intlLocale(options.locale ?? DEFAULT_LOCALE)).format(value);
}
