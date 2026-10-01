import { Box, Container, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { Brand } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { flagEnabled } from '@/lib/flags.server';
import { hostContext } from '@/lib/host-context.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('tenant.hub');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/**
 * Family Hub host `app.` (G-31, ADR-039): reserved and classified in Phase 1. Placeholder behind
 * release flag `p1-hub-placeholder` until Parent Core ships in Phase 7P; with the flag off the
 * host sends visitors to the marketing site (no "coming soon" pages in production).
 */
export default async function FamilyHub() {
  const [h, { apexUrl }, t] = await Promise.all([
    headers(),
    hostContext(),
    getTranslations('tenant.hub'),
  ]);
  if (!(await flagEnabled('p1-hub-placeholder', h.get('host') ?? ''))) redirect(apexUrl);
  return (
    <Container maxWidth="sm" sx={{ paddingBlock: { xs: 6, md: 12 } }}>
      <Stack spacing={10}>
        <Stack
          component="header"
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
        >
          <Brand />
          <ThemeToggle compact />
        </Stack>
        <Stack component="main" spacing={4}>
          <Box
            aria-hidden
            sx={{ inlineSize: 48, blockSize: 4, borderRadius: 2, backgroundColor: 'ab.accent' }}
          />
          <Text variant="title" as="h1">
            {t('title')}
          </Text>
          <Text tone="secondary">{t('body')}</Text>
        </Stack>
      </Stack>
    </Container>
  );
}
