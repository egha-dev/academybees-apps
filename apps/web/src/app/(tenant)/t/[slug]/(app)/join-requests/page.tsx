import { JoinRequestListSchema } from '@academybee/contracts';
import { formatDate } from '@academybee/i18n';
import { StatusBadge } from '@academybee/ui/components/display';
import { EmptyState, PermissionState } from '@academybee/ui/components/feedback';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { getMessages, getTranslations } from 'next-intl/server';

import { JoinRequestActionsLazy } from '@/components/people/join-requests-lazy';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { apiServerGet } from '@/lib/api.server';
import { academyTimeZone, hostContext } from '@/lib/host-context.server';
import { homeFor } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('people.joinRequests');
  return { title: t('metaTitle') };
}

const TONE = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'neutral' } as const;

/** Join requests (G-31 §3): parents who asked from the Family Hub; approve by linking a child. */
export default async function JoinRequestsPage() {
  const [{ me, academy }, { context }, t, shellT, messages] = await Promise.all([
    signedInMember({ experience: 'manage' }),
    hostContext(),
    getTranslations('people.joinRequests'),
    getTranslations('shell.permission'),
    getMessages(),
  ]);
  if (!holds(me, 'parent.manage'))
    return (
      <PermissionState
        title={t('permission.title')}
        body={t('permission.body', { academy })}
        action={{ label: shellT('action'), href: homeFor(me) }}
      />
    );
  const res = await apiServerGet('/join-requests');
  if (!res.ok) throw new Error(`join requests ${res.status}`);
  const { items } = JoinRequestListSchema.parse(await res.json());
  const timeZone = academyTimeZone(context);
  const date = (v: string) => formatDate(v, { ...(timeZone ? { timeZone } : {}) });
  const pending = items.filter((r) => r.status === 'PENDING');
  const decided = items.filter((r) => r.status !== 'PENDING');
  const p = messages.people;

  const list = (rows: typeof items) => (
    <Stack component="ul" spacing={3} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {rows.map((r) => (
        <Box
          component="li"
          key={r.id}
          sx={{ padding: 3, borderRadius: 2, border: '1px solid', borderColor: 'ab.border' }}
        >
          <Stack spacing={1}>
            <Stack
              direction="row"
              sx={{
                gap: 2,
                alignItems: 'center',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
              }}
            >
              <Text>
                <strong>{r.parentName}</strong>
              </Text>
              <StatusBadge tone={TONE[r.status]} label={t(`status.${r.status}`)} />
            </Stack>
            <Text variant="bodySmall">{t('child', { name: r.childName })}</Text>
            {r.phone && (
              <Text variant="bodySmall" tone="secondary">
                {t('contact', { phone: r.phone })}
              </Text>
            )}
            {r.email && (
              <Text variant="bodySmall" tone="secondary">
                {t('email', { email: r.email })}
              </Text>
            )}
            {r.message && (
              <Text variant="bodySmall" tone="secondary">
                {t('message', { message: r.message })}
              </Text>
            )}
            <Text variant="meta" tone="secondary">
              {date(r.reviewedAt ?? r.createdAt)}
            </Text>
            {r.status === 'PENDING' && (
              <JoinRequestActionsLazy
                request={r}
                labels={{
                  join: p.joinRequests,
                  relationship: p.relationship,
                  form: p.form,
                  status: p.status,
                  errors: { ...p.errors, offline: p.form.offline },
                }}
              />
            )}
          </Stack>
        </Box>
      ))}
    </Stack>
  );

  return (
    <Stack spacing={6}>
      <PageHeader title={t('title')} body={t('body', { academy })} />
      {items.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          body={t('emptyBody')}
          action={{ label: p.parentApp.tab, href: '/settings/parent-app' }}
        />
      ) : (
        <>
          {pending.length > 0 && (
            <Stack spacing={3} component="section" aria-labelledby="jr-pending">
              <Text variant="section" as="h2" id="jr-pending">
                {t('pending')}
              </Text>
              {list(pending)}
            </Stack>
          )}
          {decided.length > 0 && (
            <Stack spacing={3} component="section" aria-labelledby="jr-decided">
              <Text variant="section" as="h2" id="jr-decided">
                {t('decided')}
              </Text>
              {list(decided)}
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
