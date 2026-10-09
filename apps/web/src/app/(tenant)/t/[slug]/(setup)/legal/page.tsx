import { LegalCurrentResponseSchema } from '@academybee/contracts';
import { TextLink } from '@academybee/ui/components/actions';
import { StatusBadge } from '@academybee/ui/components/display';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { LegalAccept } from '@/components/onboarding/legal-accept';
import { onboardingOwner } from '@/components/onboarding/owner.server';
import { apiServerGet } from '@/lib/api.server';
import { academyName, hostContext } from '@/lib/host-context.server';
import { safeNext } from '@/lib/safe-next';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding.legal');
  return { title: t('metaTitle') };
}

/**
 * Terms, Privacy policy and DPA (G-06, ADR-034): accepted once before the setup, and again when a
 * new version is published (owners of open academies are sent here then).
 */
export default async function LegalPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const owner = await onboardingOwner();
  if (owner.state !== 'signed-in') return null;
  const [params, t, { context }] = await Promise.all([
    searchParams,
    getTranslations('onboarding'),
    hostContext(),
  ]);
  const next = safeNext(typeof params.next === 'string' ? params.next : undefined) ?? '/welcome';
  const res = await apiServerGet('/legal/current');
  if (!res.ok) throw new Error(`legal ${res.status}`);
  const legal = LegalCurrentResponseSchema.parse(await res.json());
  if (legal.complete) redirect(next);
  const academy = academyName(context) ?? '';
  const updated = legal.documents.some((d) => d.accepted);
  return (
    <Stack spacing={6}>
      <Stack spacing={2}>
        <Text variant="title" as="h1">
          {updated ? t('legal.updatedTitle') : t('legal.title')}
        </Text>
        <Text tone="secondary">
          {updated ? t('legal.updatedBody') : t('legal.body', { academy })}
        </Text>
      </Stack>
      <Box component="ul" sx={{ margin: 0, padding: 0 }}>
        {legal.documents.map((d) => (
          <Box
            component="li"
            key={d.id}
            sx={{
              listStyle: 'none',
              paddingBlock: 4,
              borderBlockEnd: '1px solid',
              borderColor: 'ab.border',
            }}
          >
            <Stack spacing={1}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Text as="h2" variant="section">
                  {d.title}
                </Text>
                {d.accepted && <StatusBadge tone="success" label={t('legal.accepted')} />}
              </Stack>
              <Text variant="bodySmall" tone="secondary">
                {d.summary}
              </Text>
              <Text variant="meta" tone="secondary">
                {t('legal.version', { version: d.version })}
              </Text>
              <Box>
                <TextLink href={d.url}>
                  {t('legal.read', { title: d.title.toLowerCase() })}
                </TextLink>
              </Box>
            </Stack>
          </Box>
        ))}
      </Box>
      <LegalAccept
        documentIds={legal.documents.filter((d) => !d.accepted).map((d) => d.id)}
        next={next}
        labels={{
          agree: t('legal.agree', { academy }),
          continue: t('legal.continue'),
          mustAgree: t('legal.mustAgree'),
          offline: t('errors.offline'),
          generic: t('errors.generic'),
        }}
      />
    </Stack>
  );
}
