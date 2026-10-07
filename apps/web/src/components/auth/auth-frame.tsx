import { Box, Container, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { getTranslations } from 'next-intl/server';
import { type ReactNode } from 'react';

import { AcademyIdentity } from '@/components/academy-identity';
import { BeeMark } from '@/components/bee-mark';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * Frame of the academy's own sign-in screens (UX Tier 1 Login, UX v1.1 §8): the academy's
 * identity first, one focused task, "Powered by AcademyBee" last. Phone-first; it grows to a
 * centred column on larger screens.
 */
export async function AuthFrame({
  academy,
  primaryColor,
  title,
  body,
  children,
}: {
  academy: string;
  primaryColor: string | null;
  title: string;
  body?: string | undefined;
  children?: ReactNode;
}) {
  const t = await getTranslations('tenant');
  return (
    <Container
      maxWidth="sm"
      sx={{ paddingBlock: { xs: 4, md: 10 }, minBlockSize: '100dvh', display: 'flex' }}
    >
      <Stack spacing={{ xs: 6, md: 8 }} sx={{ flex: 1, minInlineSize: 0 }}>
        <Stack
          component="header"
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
        >
          <AcademyIdentity name={academy} primaryColor={primaryColor} />
          <ThemeToggle compact />
        </Stack>
        <Stack component="main" spacing={5} sx={{ inlineSize: '100%', maxInlineSize: 440 }}>
          <Stack spacing={2}>
            <Box
              aria-hidden
              sx={{ inlineSize: 40, blockSize: 4, borderRadius: 2, backgroundColor: 'ab.accent' }}
            />
            <Text variant="title" as="h1">
              {title}
            </Text>
            {body && <Text tone="secondary">{body}</Text>}
          </Stack>
          {children}
        </Stack>
        <Stack
          component="footer"
          direction="row"
          spacing={1.5}
          sx={{ alignItems: 'center', marginBlockStart: 'auto' }}
        >
          <BeeMark size={20} />
          <Text variant="meta" tone="secondary">
            {t('poweredBy')}
          </Text>
        </Stack>
      </Stack>
    </Container>
  );
}
