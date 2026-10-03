import type { Metadata } from 'next';

import { LegalPage } from '@/components/legal-page';
import { t } from '@/lib/site';

export const metadata: Metadata = {
  title: t('terms.metaTitle'),
  // A draft for review: never indexed (C-74).
  robots: { index: false, follow: false },
  alternates: { canonical: '/terms/' },
};

export default function TermsPage() {
  return <LegalPage page="terms" />;
}
