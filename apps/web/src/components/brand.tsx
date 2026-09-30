import { Stack, Text } from '@academybee/ui';
import { getTranslations } from 'next-intl/server';

import { BeeMark } from './bee-mark';

/** AcademyBee identity for platform surfaces (academies get their own branding in Phase 1). */
export async function Brand() {
  const t = await getTranslations('common');
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
      <BeeMark size={32} />
      <Text variant="section" as="span">
        {t('appName')}
      </Text>
    </Stack>
  );
}
