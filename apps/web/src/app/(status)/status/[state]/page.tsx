import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { StatusPage, type StatusTone } from '@/components/status-page';
import { academyColor, academyName, hostContext } from '@/lib/host-context.server';

/**
 * Academy host states (UX v1.1 §7), reached only through a rewrite from `proxy.ts` — typing
 * `/status/...` is refused there. The proxy sets the HTTP status (unknown 404, suspended 503,
 * archived 410, unavailable 503).
 */
const STATES = {
  unknown: { key: 'unknown', tone: 'info' },
  suspended: { key: 'suspended', tone: 'warning' },
  archived: { key: 'archived', tone: 'info' },
  setup: { key: 'setup', tone: 'info' },
  unavailable: { key: 'unavailable', tone: 'offline' },
} as const satisfies Record<string, { key: string; tone: StatusTone }>;

type State = keyof typeof STATES;
const isState = (s: string): s is State => s in STATES;

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string }>;
}): Promise<Metadata> {
  const { state } = await params;
  const t = await getTranslations('tenant.status');
  return {
    title: t(`${isState(state) ? STATES[state].key : 'unknown'}.metaTitle`),
    robots: { index: false, follow: false },
  };
}

export default async function StatusRoute({ params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  if (!isState(state)) notFound();
  const [{ context, apexUrl }, t] = await Promise.all([
    hostContext(),
    getTranslations('tenant.status'),
  ]);
  const name = academyName(context);
  const { key, tone } = STATES[state];
  // Without a name (e.g. archived) the copy still reads naturally.
  const academy = name ?? t('fallbackAcademy');
  return (
    <StatusPage
      academyName={name}
      academyColor={academyColor(context)}
      tone={tone}
      title={t(`${key}.title`, { academy })}
      body={t(`${key}.body`, { academy })}
      action={
        state === 'unavailable'
          ? { label: t(`${key}.action`), reload: true }
          : { label: t(`${key}.action`), href: apexUrl }
      }
    />
  );
}
