import { Box, Container, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { AcademyIdentity } from '@/components/academy-identity';
import { BeeMark } from '@/components/bee-mark';
import { ThemeToggle } from '@/components/theme-toggle';
import { flagEnabled } from '@/lib/flags.server';
import { academyColor, academyName, hostContext } from '@/lib/host-context.server';

export const dynamic = 'force-dynamic';

/**
 * Academy home (`/` on an academy host). Phase 1: a branded placeholder behind release flag
 * `p1-tenant-home` (UX v1.1 §1, §4); Phase 2 replaces it with sign-in and the staff home.
 * With the flag off it shows the academy identity without promising features.
 */
export default async function AcademyHome() {
  const [{ context }, h, t] = await Promise.all([
    hostContext(),
    headers(),
    getTranslations('tenant'),
  ]);
  const name = academyName(context);
  if (!name) notFound();
  const showHome = await flagEnabled('p1-tenant-home', h.get('host') ?? '');
  const copy = showHome
    ? { title: t('home.title', { academy: name }), body: t('home.body', { academy: name }) }
    : {
        title: t('home.preparing.title', { academy: name }),
        body: t('home.preparing.body'),
      };
  return (
    <Container maxWidth="md" sx={{ paddingBlock: { xs: 6, md: 12 }, minBlockSize: '100dvh' }}>
      <Stack spacing={{ xs: 8, md: 12 }} sx={{ minBlockSize: '100%' }}>
        <Stack
          component="header"
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
        >
          <AcademyIdentity name={name} primaryColor={academyColor(context)} />
          <ThemeToggle compact />
        </Stack>
        <Stack component="main" spacing={4}>
          <Box
            aria-hidden
            sx={{ inlineSize: 48, blockSize: 4, borderRadius: 2, backgroundColor: 'ab.accent' }}
          />
          <Text variant="display" as="h1">
            {copy.title}
          </Text>
          <Text tone="secondary">{copy.body}</Text>
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
