import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { loadOnboarding, onboardingOwner } from '@/components/onboarding/owner.server';
import { ImportWorkspace } from '@/components/people/import-page.server';
import { holds } from '@/components/shell/signed-in.server';
import { homeFor } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('people.import');
  return { title: t('metaTitle') };
}

/**
 * Guided setup → First students → "Import from spreadsheet" (G-02): the same import as Students,
 * inside the setup frame (its own route, so the step page stays within its budget, G-24). When it
 * is done, the owner goes back to the Students step to continue.
 */
export default async function OnboardingImportPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const [owner, params, t] = await Promise.all([
    onboardingOwner(),
    searchParams,
    getTranslations('people.import'),
  ]);
  if (owner.state !== 'signed-in') return null;
  const state = await loadOnboarding();
  if (state.completed) redirect(homeFor(owner.me));
  if (!holds(owner.me, 'student.import')) redirect('/onboarding/students');
  return (
    <Stack spacing={5}>
      <Box
        component="a"
        href="/onboarding/students"
        sx={{ color: 'ab.textSecondary', fontSize: 14 }}
      >
        {t('backToSetup')}
      </Box>
      <Stack spacing={1}>
        <Text variant="title" as="h1">
          {t('title')}
        </Text>
        <Text tone="secondary">{t('body')}</Text>
      </Stack>
      <ImportWorkspace jobId={params.job} doneHref="/onboarding/students" />
    </Stack>
  );
}
