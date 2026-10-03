import { Card } from '@academybee/ui/components/display';
import { Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { ExpiredRefresh } from '@/components/auth/expired-refresh';
import { signOutLabels } from '@/components/auth/labels.server';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { PlatformFrame } from '@/components/platform/platform-frame';
import { getSession } from '@/lib/session.server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.hub.home');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/**
 * Family Hub home (G-31, ADR-039): signed-in placeholder behind `p1-hub-placeholder` until Parent
 * Core (Phase 7P). Lists the academies where the user is an ACTIVE parent or student — read by the
 * API per academy, never across academies.
 */
export default async function FamilyHub() {
  const [session, t, roles, signOut, locale] = await Promise.all([
    getSession(),
    getTranslations('auth.hub.home'),
    getTranslations('auth.roles'),
    signOutLabels(),
    getLocale(),
  ]);
  const list = new Intl.ListFormat(locale, { type: 'conjunction' });
  if (session.state === 'signed-out') redirect('/login');
  if (session.state === 'expired') return <ExpiredRefresh />;
  const academies = session.me.hub?.academies ?? [];
  return (
    <PlatformFrame title={t('title', { name: session.me.user.name })} body={t('body')}>
      <Stack component="section" spacing={3} aria-labelledby="hub-academies">
        <Text variant="section" as="h2" id="hub-academies">
          {t('academiesTitle')}
        </Text>
        {academies.length ? (
          <Stack component="ul" spacing={2} sx={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {academies.map((academy) => (
              <li key={academy.slug}>
                <Card
                  title={academy.name}
                  subtitle={list.format(academy.roles.map((r) => roles(r)))}
                />
              </li>
            ))}
          </Stack>
        ) : (
          <Text tone="secondary">{t('empty')}</Text>
        )}
      </Stack>
      <SignOutButton labels={signOut} />
    </PlatformFrame>
  );
}
