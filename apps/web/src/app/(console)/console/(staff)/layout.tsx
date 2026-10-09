import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { type ReactNode } from 'react';

import { ExpiredRefresh } from '@/components/auth/expired-refresh';
import { signOutLabels } from '@/components/auth/labels.server';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { Brand } from '@/components/brand';
import { ConsoleShell } from '@/components/console/console-shell';
import { consoleStaff } from '@/components/console/staff.server';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * Signed-in console (C-02): platform staff only. The console's own strings go to the client
 * (it has no route budget: staff use it on desktops, UX §21), so its forms use `useTranslations`.
 */
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const staff = await consoleStaff();
  if (staff.state === 'expired') return <ExpiredRefresh />;
  const [t, messages, signOut] = await Promise.all([
    getTranslations('console.shell'),
    getMessages(),
    signOutLabels(),
  ]);
  return (
    <NextIntlClientProvider messages={{ console: messages.console }}>
      <ConsoleShell
        brand={
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Brand />
            <Text variant="meta" tone="secondary">
              {t('product')}
            </Text>
          </Stack>
        }
        navLabel={t('navLabel')}
        items={[{ key: 'academies', label: t('nav.academies'), href: '/academies' }]}
        topbarActions={
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            {/* Phones have no sidebar: sign-out lives in the top bar there. */}
            <Box sx={{ display: { xs: 'block', md: 'none' } }}>
              <SignOutButton labels={signOut} />
            </Box>
            <ThemeToggle compact />
          </Stack>
        }
        sidebarFooter={
          <Stack spacing={2}>
            <Text variant="bodySmall">
              <strong data-i18n-exempt>{staff.me.user.name}</strong>
            </Text>
            <Text variant="meta" tone="secondary">
              {t(`roles.${staff.role}`)}
            </Text>
            <SignOutButton labels={signOut} />
          </Stack>
        }
      >
        {children}
      </ConsoleShell>
    </NextIntlClientProvider>
  );
}
