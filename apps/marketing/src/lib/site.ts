import { createServerTranslator } from '@academybee/i18n';

/** Public site facts (C-74). The canonical host is the apex; www redirects to it. */
export const SITE_URL = 'https://academybees.com';
export const CONTACT_EMAIL = 'hello@academybees.com';
/** When the legal drafts were prepared (shown on the draft pages). */
export const LEGAL_DRAFT_DATE = new Date('2026-10-03T00:00:00+05:30');

/**
 * Site copy from the shared catalogue (`marketing` namespace, G-32): translated at build time,
 * so the static pages ship no translation runtime.
 */
export const t = createServerTranslator('marketing');

/** The early-access request as a mailto link with a short form prefilled (no backend, C-74). */
export function earlyAccessHref(): string {
  const params = new URLSearchParams({
    subject: t('earlyAccess.mailSubject'),
    body: t('earlyAccess.mailBody'),
  });
  // mailto wants %20, not +, for spaces.
  return `mailto:${CONTACT_EMAIL}?${params.toString().replace(/\+/g, '%20')}`;
}

/** Ordered `{ title, p1, p2, … }` sections of a legal draft. */
export type LegalSection = { title: string; paragraphs: string[] };

export function legalSections(page: 'privacy' | 'terms' | 'dpa'): LegalSection[] {
  const raw = (t.raw as (key: string) => unknown)(`${page}.sections`) as Record<
    string,
    Record<string, string>
  >;
  return Object.values(raw).map(({ title = '', ...rest }) => ({
    title,
    paragraphs: Object.keys(rest)
      .sort()
      .map((k) => rest[k] ?? ''),
  }));
}
