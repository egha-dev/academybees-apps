import { type AcademySummary, AcademyPageSchema, TenantStatusSchema } from '@academybee/contracts';
import { formatDate } from '@academybee/i18n';
import { Button, TextLink } from '@academybee/ui/components/actions';
import { StatusBadge } from '@academybee/ui/components/display';
import { EmptyState, ErrorState } from '@academybee/ui/components/feedback';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AcademyFilters } from '@/components/console/academy-filters';
import { consoleStaff } from '@/components/console/staff.server';
import { STATUS_TONE } from '@/components/console/status-tone';
import { PageHeader } from '@/components/shell/page-header';
import { apiServerGet } from '@/lib/api.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('console.academies');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

const first = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

/**
 * Academies (C-02, UX §21): every academy with its address, status, plan and setup progress.
 * Dense but calm on desktop; on phones each academy is a card (read-mostly, UX §21).
 */
export default async function AcademiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [staff, params, t] = await Promise.all([
    consoleStaff(),
    searchParams,
    getTranslations('console'),
  ]);
  if (staff.state !== 'signed-in') return null;

  const q = first(params.q).slice(0, 80);
  const status = TenantStatusSchema.safeParse(first(params.status)).data ?? '';
  const after = first(params.after);
  const query = new URLSearchParams({ limit: '25' });
  if (q) query.set('q', q);
  if (status) query.set('status', status);
  if (after) query.set('cursor', after);

  const res = await apiServerGet(`/platform/tenants?${query.toString()}`);
  const create = staff.can('platform.tenant.create') ? (
    <Button href="/academies/new">{t('academies.create')}</Button>
  ) : undefined;
  if (!res.ok) {
    if (res.status === 400 && after) return <Stale label={t('academies.loadMore')} />;
    return (
      <ErrorState
        title={t('errors.loadTitle')}
        body={res.status === 503 ? t('errors.unavailable') : t('errors.loadBody')}
        retry={{ label: t('academies.search.submit'), href: '/academies' }}
      />
    );
  }
  const page = AcademyPageSchema.parse(await res.json());
  const date = (iso: string) => formatDate(iso, { timeZone: 'Asia/Kolkata' });
  const filtered = Boolean(q || status);
  const more = new URLSearchParams(query);
  more.delete('limit');
  more.delete('cursor');
  if (page.nextCursor) more.set('after', page.nextCursor);

  return (
    <Stack spacing={6}>
      <PageHeader title={t('academies.title')} body={t('academies.body')} action={create} />
      <AcademyFilters q={q} status={status} />
      {page.items.length === 0 ? (
        filtered ? (
          <EmptyState
            title={t('academies.noResults.title')}
            body={t('academies.noResults.body')}
            action={{ label: t('academies.search.clear'), href: '/academies' }}
          />
        ) : (
          <EmptyState
            title={t('academies.empty.title')}
            body={t('academies.empty.body')}
            action={{ label: t('academies.create'), href: '/academies/new' }}
          />
        )
      ) : (
        <Box
          component="ul"
          aria-label={t('academies.listLabel')}
          sx={{
            margin: 0,
            padding: 0,
            border: '1px solid',
            borderColor: 'ab.border',
            borderRadius: 3,
            bgcolor: 'ab.surface',
          }}
        >
          {page.items.map((a: AcademySummary) => (
            <Box
              component="li"
              key={a.id}
              sx={{
                listStyle: 'none',
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  md: 'minmax(0,2.2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)',
                },
                gap: { xs: 1.5, md: 4 },
                alignItems: 'center',
                paddingInline: 5,
                paddingBlock: 4,
                '&:not(:last-of-type)': { borderBlockEnd: '1px solid', borderColor: 'ab.border' },
              }}
            >
              <Stack spacing={0.5} sx={{ minInlineSize: 0 }}>
                <TextLink href={`/academies/${a.id}/overview`}>
                  <strong data-i18n-exempt>{a.name}</strong>
                </TextLink>
                <Text variant="bodySmall" tone="secondary">
                  <span data-i18n-exempt>{a.host}</span>
                </Text>
              </Stack>
              <Box>
                <StatusBadge
                  tone={STATUS_TONE[a.status] ?? 'neutral'}
                  label={t(`status.${a.status}`)}
                />
              </Box>
              <Stack spacing={0.5}>
                <Text variant="bodySmall">{t(`plans.${(a.planKey ?? 'none') as 'trial'}`)}</Text>
                <Text variant="meta" tone="secondary">
                  {a.onboardingCompleted ? t('academies.setupDone') : t('academies.setupPending')}
                </Text>
              </Stack>
              <Text variant="meta" tone="secondary">
                {t('academies.columns.created')}: {date(a.createdAt)}
              </Text>
            </Box>
          ))}
        </Box>
      )}
      {page.nextCursor && (
        <Stack direction="row">
          <Button variant="secondary" href={`/academies?${more.toString()}`}>
            {t('academies.loadMore')}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

/** A paging link that no longer works (bad or outdated cursor): start from the top. */
function Stale({ label }: { label: string }) {
  return (
    <Stack direction="row">
      <Button variant="secondary" href="/academies">
        {label}
      </Button>
    </Stack>
  );
}
