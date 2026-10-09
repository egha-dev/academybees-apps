import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { AuthFrame } from '@/components/auth/auth-frame';
import { loginLabels, mfaLabels } from '@/components/auth/labels.server';
import { TwoStepSignIn } from '@/components/auth/two-step-sign-in';
import {
  academyColor,
  academyLogo,
  academyName,
  hostContext,
  hubOrigin,
} from '@/lib/host-context.server';
import { safeNext } from '@/lib/safe-next';
import { getSession, homeFor } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.login');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/** Academy-branded staff sign-in (UX Tier 1 Login, UX v1.1 §8). */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const [{ context, apexUrl }, session, params, t] = await Promise.all([
    hostContext(),
    getSession(),
    searchParams,
    getTranslations('auth.login'),
  ]);
  const academy = academyName(context);
  if (!academy) notFound();
  const next = safeNext(typeof params.next === 'string' ? params.next : undefined);
  if (session.state === 'signed-in') redirect(next ?? homeFor(session.me));
  return (
    <AuthFrame
      academy={academy}
      primaryColor={academyColor(context)}
      logoUrl={academyLogo(context)}
      title={t('title', { academy })}
      body={t('body')}
    >
      <TwoStepSignIn
        labels={{ login: await loginLabels(), mfa: await mfaLabels(academy) }}
        next={next}
        hubOrigin={hubOrigin(apexUrl)}
      />
    </AuthFrame>
  );
}
