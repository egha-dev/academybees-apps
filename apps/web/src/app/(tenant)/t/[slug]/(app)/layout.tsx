import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { AcademyIdentity } from '@/components/academy-identity';
import { sessionGuardLabels } from '@/components/auth/labels.server';
import { SessionGuard } from '@/components/auth/session-guard';
import { AccountPanel } from '@/components/shell/account-panel';
import { AcademyShell } from '@/components/shell/academy-shell';
import { experienceFor, navigationFor } from '@/components/shell/navigation.server';
import { ThemeToggle } from '@/components/theme-toggle';
import { apiServerGet } from '@/lib/api.server';
import { flagEnabled, roleHomesEnabled } from '@/lib/flags.server';
import {
  academyColor,
  academyLogo,
  academyName,
  hostContext,
  requestPath,
} from '@/lib/host-context.server';
import { getSession } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

/** Has a legal document the owner must accept changed since they last did? Errors → no. */
async function legalOutdated(): Promise<boolean> {
  if (!(await flagEnabled('p3-onboarding', (await headers()).get('host') ?? ''))) return false;
  const res = await apiServerGet('/legal/current');
  if (!res.ok) return false;
  const body = (await res.json().catch(() => null)) as { complete?: unknown } | null;
  return body?.complete === false;
}

/**
 * Every signed-in academy page (plan 2.17). Signed-out visitors go to sign-in and come back
 * afterwards; an expired access token is refreshed on the client; members get the shell of the
 * experience the page belongs to, with navigation filtered by their capabilities.
 */
export default async function SignedInLayout({ children }: { children: ReactNode }) {
  const [{ context }, session, path, t] = await Promise.all([
    hostContext(),
    getSession(),
    requestPath(),
    getTranslations('shell.nav'),
  ]);
  const academy = academyName(context);
  if (!academy) notFound();
  const primaryColor = academyColor(context);
  const logoUrl = academyLogo(context);

  if (session.state === 'signed-out') redirect(`/login?next=${encodeURIComponent(path)}`);
  if (session.state === 'expired') {
    const labels = await sessionGuardLabels();
    // A moment while the token refreshes; kept to Stack/Text so every signed-in page stays light.
    return (
      <Stack spacing={4} sx={{ padding: 6, minBlockSize: '100dvh' }}>
        <AcademyIdentity name={academy} primaryColor={primaryColor} logoUrl={logoUrl} />
        <Box role="status">
          <Text tone="secondary">{labels.restoring}</Text>
        </Box>
        <SessionGuard labels={labels} identifier="" expired />
      </Stack>
    );
  }
  const { me } = session;
  if (!me.academy) redirect('/login');
  // The owner accepts new versions of the Terms, Privacy policy and DPA before going on (G-06,
  // ADR-034): checked here, once per page, only for owners and while the guided setup is live.
  if (me.academy.capabilities['academy.onboarding.manage'] && (await legalOutdated()))
    redirect(`/legal?next=${encodeURIComponent(path)}`);

  const experience = experienceFor(path, me);
  const [roleHomes, guard] = await Promise.all([roleHomesEnabled(), sessionGuardLabels()]);
  const nav = await navigationFor(me, experience, roleHomes);
  return (
    <AcademyShell
      brand={<AcademyIdentity name={academy} primaryColor={primaryColor} logoUrl={logoUrl} />}
      navLabel={t('label')}
      groups={nav.groups}
      bottom={nav.bottom}
      topbarActions={<ThemeToggle compact />}
      sidebarFooter={
        <AccountPanel
          name={me.user.name}
          experience={experience}
          experiences={me.academy.experiences}
        />
      }
    >
      {children}
      <SessionGuard labels={guard} identifier={me.user.email ?? me.user.phone ?? ''} />
    </AcademyShell>
  );
}
