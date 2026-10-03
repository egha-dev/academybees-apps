import Link from 'next/link';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { t } from '@/lib/site';

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="wrap section">
        <h1>{t('notFound.title')}</h1>
        <p className="lead">{t('notFound.body')}</p>
        <Link className="button" href="/">
          {t('notFound.home')}
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
