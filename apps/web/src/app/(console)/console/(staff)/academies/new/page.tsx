import { TextLink } from '@academybee/ui/components/actions';
import { PermissionState } from '@academybee/ui/components/feedback';
import { Stack } from '@academybee/ui/components/layout';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { CreateAcademyForm } from '@/components/console/create-academy-form';
import { consoleStaff } from '@/components/console/staff.server';
import { PageHeader } from '@/components/shell/page-header';
import { hostContext } from '@/lib/host-context.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('console.create');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/** Create Academy (C-02, UX v1.1 §2). */
export default async function NewAcademyPage() {
  const [staff, t, { apexUrl }] = await Promise.all([
    consoleStaff(),
    getTranslations('console'),
    hostContext(),
  ]);
  if (staff.state !== 'signed-in') return null;
  if (!staff.can('platform.tenant.create'))
    return (
      <PermissionState
        title={t('permission.title')}
        body={t('permission.body')}
        action={{ label: t('permission.action'), href: '/academies' }}
      />
    );
  let rootDomain = 'academybees.com';
  try {
    rootDomain = new URL(apexUrl).host;
  } catch {
    // keep the default
  }
  return (
    <Stack spacing={6}>
      <TextLink href="/academies">{t('create.back')}</TextLink>
      <PageHeader title={t('create.title')} body={t('create.body')} />
      <CreateAcademyForm rootDomain={rootDomain} />
    </Stack>
  );
}
