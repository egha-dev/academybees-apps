import { Container, EmptyState } from '@academybee/ui';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { flagEnabled } from '@/lib/flags.server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/**
 * Release-flag probe (Phase 0 exit gate, ADR-041): visible only while `p0-flag-probe` is on.
 * Owner: PO. Remove in Phase 1.
 */
export default async function FlagProbePage() {
  const host = (await headers()).get('host') ?? '';
  if (!(await flagEnabled('p0-flag-probe', host))) notFound();
  const t = await getTranslations();
  return (
    <Container maxWidth="sm">
      <EmptyState
        title={t('shell.flagProbe.title')}
        body={t('shell.flagProbe.body')}
        action={{ label: t('common.actions.goHome'), href: '/' }}
      />
    </Container>
  );
}
