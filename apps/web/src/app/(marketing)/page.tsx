import { Box, Container, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { color } from '@academybee/ui/tokens';
import { getTranslations } from 'next-intl/server';

import { Brand } from '@/components/brand';

/** Marketing root (apex host). Phase 0 placeholder in the AcademyBee design language. */
export default async function HomePage() {
  const t = await getTranslations();
  return (
    <Container maxWidth="md" sx={{ paddingBlock: { xs: 8, md: 16 } }}>
      <Stack spacing={10}>
        <Brand />
        <Stack spacing={4} component="main">
          <Box
            sx={{ inlineSize: 48, blockSize: 4, borderRadius: 2, backgroundColor: color.gold }}
            aria-hidden
          />
          <Text variant="display" as="h1">
            {t('shell.home.title')}
          </Text>
          <Text tone="secondary">{t('shell.home.body')}</Text>
          <Text variant="meta" tone="secondary">
            {t('common.tagline')}
          </Text>
        </Stack>
      </Stack>
    </Container>
  );
}
