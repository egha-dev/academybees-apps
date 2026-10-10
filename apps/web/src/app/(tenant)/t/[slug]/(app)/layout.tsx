import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { notFound, redirect } from 'next/navigation';
import { getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { AcademyIdentity } from '@/components/academy-identity';
import { sessionGuardLabels } from '@/components/auth/labels.server';
import { SessionGuard } from '@/components/auth/session-guard';
import { AccountPanel } from '@/components/shell/account-panel';
import { AcademyShell } from '@/components/shell/academy-shell';
import { PaletteTrigger } from '@/components/palette/palette-trigger';
import { GlobalAdd } from '@/components/shell/global-add';
import { experienceFor, navigationFor } from '@/components/shell/navigation.server';
import { ThemeToggle } from '@/components/theme-toggle';
import { apiServerGet } from '@/lib/api.server';
import { peopleEnabled, roleHomesEnabled } from '@/lib/flags.server';
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
  // ADR-034): checked here, once per page, only for owners.
  if (me.academy.capabilities['academy.onboarding.manage'] && (await legalOutdated()))
    redirect(`/legal?next=${encodeURIComponent(path)}`);

  const experience = experienceFor(path, me);
  const [roleHomes, people, guard] = await Promise.all([
    roleHomesEnabled(),
    peopleEnabled(),
    sessionGuardLabels(),
  ]);
  const nav = await navigationFor(me, experience, roleHomes, people);
  const caps = me.academy.capabilities as Record<string, string | undefined>;
  const messages = await getMessages();
  return (
    <AcademyShell
      brand={<AcademyIdentity name={academy} primaryColor={primaryColor} logoUrl={logoUrl} />}
      navLabel={t('label')}
      groups={nav.groups}
      bottom={nav.bottom}
      topbarActions={
        <>
          {experience === 'manage' && people && (
            <>
              <PaletteTrigger
                labels={messages.people.palette}
                actions={[
                  ...(caps['student.create']
                    ? [{ key: 'addStudent', href: '/students?add=1' } as const]
                    : []),
                  ...(caps['teacher.manage']
                    ? [{ key: 'addTeacher', href: '/teachers?add=1' } as const]
                    : []),
                  ...(caps['student.read']
                    ? [{ key: 'students', href: '/students' } as const]
                    : []),
                  ...(caps['teacher.read']
                    ? [{ key: 'teachers', href: '/teachers' } as const]
                    : []),
                ]}
              />
              <GlobalAdd
                items={[
                  ...(caps['student.create'] ? [{ key: 'student', href: '/students?add=1' }] : []),
                  ...(caps['parent.manage']
                    ? [{ key: 'parent', href: '/students?pick=parent' }]
                    : []),
                  ...(caps['teacher.manage'] ? [{ key: 'teacher', href: '/teachers?add=1' }] : []),
                ]}
              />
            </>
          )}
          <ThemeToggle compact />
        </>
      }
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
