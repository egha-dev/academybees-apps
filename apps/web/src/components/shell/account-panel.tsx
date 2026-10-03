import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { getTranslations } from 'next-intl/server';

import { signOutLabels } from '@/components/auth/labels.server';
import { SignOutButton } from '@/components/auth/sign-out-button';

import { type Experience } from './navigation.server';

/**
 * Who is signed in, a switch between Manage and Teacher for users with both, and sign-out
 * (sidebar footer on wide screens, the More page on phones). The switch is a full page load:
 * each experience has its own shell.
 */
export async function AccountPanel({
  name,
  experience,
  experiences,
}: {
  name: string;
  experience: Experience;
  experiences: readonly string[];
}) {
  const [t, signOut] = await Promise.all([getTranslations('shell.account'), signOutLabels()]);
  const other: Experience | undefined =
    experience === 'manage' && experiences.includes('teach')
      ? 'teach'
      : experience === 'teach' && experiences.includes('manage')
        ? 'manage'
        : undefined;
  return (
    <Stack spacing={3}>
      <Text variant="bodySmall" tone="secondary">
        {t('signedInAs', { name })}
      </Text>
      {other && (
        <Box
          component="a"
          href={other === 'teach' ? '/teach' : '/today'}
          sx={{
            color: 'ab.textPrimary',
            fontWeight: 600,
            minBlockSize: 48,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {other === 'teach' ? t('switchToTeach') : t('switchToManage')}
        </Box>
      )}
      <SignOutButton labels={{ ...signOut, signOut: t('signOut') }} variant="ghost" />
    </Stack>
  );
}
