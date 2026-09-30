/**
 * Locales (ADR-040, G-32). English-only launch: `en-IN` is the only user-facing locale until
 * Phase L. `en-XA` (accented pseudo-locale) and `en-LONG` (+40 % text) exist only for CI
 * builds that catch hard-coded strings and layouts that break when text grows.
 */
export const DEFAULT_LOCALE = 'en-IN';
export const SUPPORTED_LOCALES = ['en-IN'] as const;
export const PSEUDO_LOCALES = ['en-XA', 'en-LONG'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type PseudoLocale = (typeof PSEUDO_LOCALES)[number];
export type AppLocale = SupportedLocale | PseudoLocale;

export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

export function isPseudoLocale(value: string | undefined): value is PseudoLocale {
  return (PSEUDO_LOCALES as readonly string[]).includes(value ?? '');
}

/**
 * Resolution chain (ADR-040): user preference → academy default → browser → en-IN.
 * Only en-IN is supported today, so every step falls through to it; the chain is kept so
 * Phase L only adds languages, not plumbing.
 */
export function resolveLocale(candidates: {
  user?: string | null;
  tenant?: string | null;
  browser?: readonly string[];
}): SupportedLocale {
  const all = [candidates.user, candidates.tenant, ...(candidates.browser ?? [])];
  for (const c of all) {
    if (c && (SUPPORTED_LOCALES as readonly string[]).includes(c)) return c as SupportedLocale;
  }
  return DEFAULT_LOCALE;
}

/** The Intl locale used for formatting (pseudo-locales format like en-IN). */
export function intlLocale(locale: AppLocale): SupportedLocale {
  return isPseudoLocale(locale) ? DEFAULT_LOCALE : locale;
}
