import { PermissionState } from '@academybee/ui/components/feedback';
import { Box, Stack } from '@academybee/ui/components/layout';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ImportWorkspace } from '@/components/people/import-page.server';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { homeFor } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('people.import');
  return { title: t('metaTitle') };
}

/** Students → Import (G-02): bring an existing register in from CSV or Excel. */
export default async function ImportStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const [{ me, academy }, params, t, studentsT, shellT] = await Promise.all([
    signedInMember({ experience: 'manage' }),
    searchParams,
    getTranslations('people.import'),
    getTranslations('people.students'),
    getTranslations('shell.permission'),
  ]);
  if (!holds(me, 'student.import'))
    return (
      <PermissionState
        title={t('permission.title')}
        body={t('permission.body', { academy })}
        action={{ label: shellT('action'), href: homeFor(me) }}
      />
    );
  return (
    <Stack spacing={6}>
      <Box component="a" href="/students" sx={{ color: 'ab.textSecondary', fontSize: 14 }}>
        {studentsT('title')}
      </Box>
      <PageHeader title={t('title')} body={t('body')} />
      <ImportWorkspace jobId={params.job} doneHref="/students" />
    </Stack>
  );
}
