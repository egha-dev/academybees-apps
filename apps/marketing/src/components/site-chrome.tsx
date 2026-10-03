import Link from 'next/link';

import { BeeMark } from './bee-mark';
import { ThemeToggle } from './theme-toggle';
import { CONTACT_EMAIL, earlyAccessHref, t } from '@/lib/site';

/** Brand, section links, theme switch and the early-access call to action. */
export function SiteHeader({ home = false }: { home?: boolean }) {
  // On the legal pages the section links point back to the home page.
  const base = home ? '' : '/';
  return (
    <header className="site-header">
      <a className="skip" href="#main">
        {t('nav.skip')}
      </a>
      <div className="wrap header-row">
        <Link className="brand" href="/" aria-label={t('nav.home')}>
          <BeeMark size={32} />
          <span>{t('meta.brand')}</span>
        </Link>
        <nav aria-label={t('nav.features')} className="header-nav">
          <Link href={`${base}#features`}>{t('nav.features')}</Link>
          <Link href={`${base}#how`}>{t('nav.how')}</Link>
          <Link href={`${base}#faq`}>{t('nav.faq')}</Link>
        </nav>
        <div className="header-actions">
          <ThemeToggle
            labels={{
              label: t('nav.theme.label'),
              light: t('nav.theme.light'),
              dark: t('nav.theme.dark'),
              system: t('nav.theme.system'),
            }}
          />
          <a className="button button-small" href={home ? '#early-access' : earlyAccessHref()}>
            {t('nav.cta')}
          </a>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-row">
        <div className="footer-brand">
          <BeeMark size={28} />
          <p>{t('footer.tagline')}</p>
        </div>
        <div>
          <p className="footer-label">{t('footer.contact')}</p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </div>
        <nav aria-label={t('footer.contact')} className="footer-links">
          <Link href="/privacy/">{t('footer.privacy')}</Link>
          <Link href="/terms/">{t('footer.terms')}</Link>
        </nav>
      </div>
      <p className="wrap copyright">{t('footer.copyright', { year: new Date().getFullYear() })}</p>
    </footer>
  );
}
