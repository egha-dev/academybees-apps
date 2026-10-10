import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AccountPanel } from '@/components/shell/account-panel';
import { experienceFor, navigationFor } from '@/components/shell/navigation.server';
import { PageHeader } from '@/components/shell/page-header';
import { signedInMember } from '@/components/shell/signed-in.server';
import { peopleEnabled, roleHomesEnabled } from '@/lib/flags.server';
import { requestPath } from '@/lib/host-context.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell.account');
  return { title: t('moreTitle') };
}

/**
 * "More" on phones (UX §25): every section that doesn't fit the bottom bar, and the account
 * (switch experience, sign out). Shows exactly what the sidebar shows on wide screens.
 */
export default async function MorePage() {
  const [{ me, academy }, path, roleHomes, people, t] = await Promise.all([
    signedInMember(),
    requestPath(),
    roleHomesEnabled(),
    peopleEnabled(),
    getTranslations('shell.account'),
  ]);
  const experience = experienceFor(path, me);
  const nav = await navigationFor(me, experience, roleHomes, people);
  return (
    <Stack spacing={6}>
      <PageHeader title={t('moreTitle')} body={t('moreBody', { academy })} />
      {nav.groups
        .filter((g) => g.items.length > 0)
        .map((group) => (
          <Stack key={group.key} component="section" spacing={1} aria-label={group.label}>
            <Text variant="meta" tone="secondary">
              {group.label}
            </Text>
            {group.items.map((item) => (
              <Box
                key={item.key}
                component="a"
                href={item.href}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  minBlockSize: 48,
                  paddingInline: 3,
                  borderRadius: 2,
                  color: 'ab.textPrimary',
                  textDecoration: 'none',
                  fontWeight: 600,
                  bgcolor: 'ab.surface',
                  border: '1px solid',
                  borderColor: 'ab.border',
                }}
              >
                {item.label}
              </Box>
            ))}
          </Stack>
        ))}
      <AccountPanel
        name={me.user.name}
        experience={experience}
        experiences={me.academy.experiences}
      />
    </Stack>
  );
}
