import 'server-only';

import { type PrivacyNotice, PrivacyNoticeSchema } from '@academybee/contracts';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { getTranslations } from 'next-intl/server';

import { apiServerGet } from '@/lib/api.server';

/** The academy's notice data (public API), or null if it can't be read. */
export async function loadPrivacyNotice(): Promise<PrivacyNotice | null> {
  const res = await apiServerGet('/academy/privacy-notice');
  return res.ok ? PrivacyNoticeSchema.parse(await res.json()) : null;
}

const SECTIONS = ['who', 'what', 'why', 'share', 'keep', 'rights'] as const;

/**
 * The academy privacy notice (G-06): AcademyBee's template (catalogue text, versioned with the
 * ACADEMY_PRIVACY_TEMPLATE legal document) filled with the academy's name and contact.
 */
export async function PrivacyNoticeBody({ notice }: { notice: PrivacyNotice }) {
  const t = await getTranslations('people.privacy');
  const academy = notice.academy;
  return (
    <Stack spacing={4}>
      {SECTIONS.map((key) => (
        <Stack key={key} component="section" spacing={1} aria-labelledby={`notice-${key}`}>
          <Text variant="section" as="h2" id={`notice-${key}`}>
            {t(`sections.${key}.title`)}
          </Text>
          <Text>{t(`sections.${key}.body`, { academy })}</Text>
        </Stack>
      ))}
      <Stack component="section" spacing={1} aria-labelledby="notice-contact">
        <Text variant="section" as="h2" id="notice-contact">
          {t('sections.contact.title')}
        </Text>
        <Text>{t('sections.contact.body', { academy })}</Text>
        {notice.email && <Text>{t('sections.contact.email', { email: notice.email })}</Text>}
        {notice.phone && <Text>{t('sections.contact.phone', { phone: notice.phone })}</Text>}
        {notice.address && (
          <Text>{t('sections.contact.address', { address: notice.address })}</Text>
        )}
      </Stack>
      <Box>
        <Text variant="meta" tone="secondary">
          {t('version', { version: notice.version })} · {t('draft')}
        </Text>
      </Box>
    </Stack>
  );
}
