import { formatDate } from '@academybee/i18n';
import Link from 'next/link';

import { SiteFooter, SiteHeader } from './site-chrome';
import { LEGAL_DRAFT_DATE, legalSections, t } from '@/lib/site';

/** A legal draft for the PO to review (C-74): marked as a draft, never indexed. */
export function LegalPage({ page }: { page: 'privacy' | 'terms' }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="wrap legal">
        <p className="draft" role="note">
          {t('legal.draftBanner')}
        </p>
        <h1>{t(`${page}.title`)}</h1>
        <p className="muted">
          {t('legal.updated', {
            date: formatDate(LEGAL_DRAFT_DATE, { style: 'long', timeZone: 'Asia/Kolkata' }),
          })}
        </p>
        <p className="lead">{t(`${page}.intro`)}</p>
        {legalSections(page).map((s) => (
          <section key={s.title}>
            <h2>{s.title}</h2>
            {s.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </section>
        ))}
        <p>
          <Link href="/">{t('legal.back')}</Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
