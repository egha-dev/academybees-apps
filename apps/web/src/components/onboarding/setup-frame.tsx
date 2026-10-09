import { Box, Container, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { ReactNode } from 'react';

import { AcademyIdentity } from '@/components/academy-identity';
import { SignOutButton, type SignOutLabels } from '@/components/auth/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * The guided setup's own frame (UX v1.1 §4–5): the academy's identity, a calm single column,
 * phone-first, outside the Manage shell (the academy isn't open yet). "Finish later" signs out;
 * progress is already saved.
 */
export function SetupFrame({
  academy,
  primaryColor,
  logoUrl,
  signOut,
  saved,
  children,
}: {
  academy: string;
  primaryColor: string | null;
  logoUrl: string | null;
  signOut: SignOutLabels;
  saved?: string;
  children: ReactNode;
}) {
  return (
    <Container maxWidth="sm" sx={{ paddingBlock: { xs: 4, md: 8 }, minBlockSize: '100dvh' }}>
      <Stack spacing={{ xs: 5, md: 7 }}>
        <Stack
          component="header"
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
        >
          <Box sx={{ minInlineSize: 0 }} data-i18n-exempt>
            <AcademyIdentity name={academy} primaryColor={primaryColor} logoUrl={logoUrl} />
          </Box>
          <ThemeToggle compact />
        </Stack>
        <Box component="main">{children}</Box>
        <Stack
          component="footer"
          spacing={2}
          sx={{
            alignItems: 'flex-start',
            paddingBlockStart: 4,
            borderBlockStart: '1px solid',
            borderColor: 'ab.border',
          }}
        >
          {saved && (
            <Text variant="bodySmall" tone="secondary">
              {saved}
            </Text>
          )}
          <SignOutButton labels={signOut} />
        </Stack>
      </Stack>
    </Container>
  );
}
