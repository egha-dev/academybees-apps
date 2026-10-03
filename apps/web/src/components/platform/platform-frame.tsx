import { Box, Container, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { type ReactNode } from 'react';

import { Brand } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * Frame of AcademyBee's own surfaces — the Family Hub on `app.` and the console on `console.`
 * (G-31, C-02): the AcademyBee identity, one focused task. Phone-first, a centred column on
 * larger screens.
 */
export function PlatformFrame({
  title,
  body,
  children,
}: {
  title: string;
  body?: string | undefined;
  children: ReactNode;
}) {
  return (
    <Container maxWidth="sm" sx={{ paddingBlock: { xs: 4, md: 10 }, minBlockSize: '100dvh' }}>
      <Stack spacing={{ xs: 6, md: 8 }}>
        <Stack
          component="header"
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
        >
          <Brand />
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
      </Stack>
    </Container>
  );
}
