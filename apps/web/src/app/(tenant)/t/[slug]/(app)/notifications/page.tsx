import { NotificationPageSchema } from '@academybee/contracts';
import { formatDate, formatTime } from '@academybee/i18n';
import { InlineAlert } from '@academybee/ui/components/alert';
import { StatusBadge } from '@academybee/ui/components/display';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { MarkAllRead } from '@/components/notifications/mark-all-read';
import { PageHeader } from '@/components/shell/page-header';
import { signedInMember } from '@/components/shell/signed-in.server';
import { apiServerGet } from '@/lib/api.server';
import { academyTimeZone, hostContext } from '@/lib/host-context.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('teach.notifications');
  return { title: t('metaTitle') };
}

/** My notifications at this academy (C-04): newest first, unread marked "New". */
export default async function NotificationsPage() {
  const [{ me, academy }, { context }, t] = await Promise.all([
    signedInMember(),
    hostContext(),
    getTranslations('teach.notifications'),
  ]);
  const res = await apiServerGet('/notifications?limit=50');
  if (!res.ok)
    return (
      <Stack spacing={4}>
        <PageHeader title={t('title')} body={t('body', { academy })} />
        <InlineAlert tone="danger">{t('loadFailed')}</InlineAlert>
      </Stack>
    );
  const page = NotificationPageSchema.parse(await res.json());
  // Owners and admins who also teach take attendance in Manage: `/teach/*` is the teachers'
  // experience (C-133, review P6-4 M5).
  const teaches = me.academy.experiences.includes('teach');
  const hrefOf = (link: string) =>
    !teaches && link.startsWith('/teach/attendance?')
      ? link.replace('/teach/attendance?', '/attendance/take?')
      : link;
  const timeZone = academyTimeZone(context) ?? 'Asia/Kolkata';
  const unread = page.items.some((n) => !n.readAt);
  return (
    <Stack spacing={4}>
      <PageHeader
        title={t('title')}
        body={t('body', { academy })}
        action={
          unread ? (
            <MarkAllRead labels={{ markAll: t('markAll'), marked: t('marked') }} />
          ) : undefined
        }
      />
      {page.items.length === 0 ? (
        <Text tone="secondary">{t('empty')}</Text>
      ) : (
        <Stack component="ul" spacing={2} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {page.items.map((n) => {
            const p = n.params as Record<string, string>;
            const text = t(`kinds.${n.kind}`, {
              batch: p.batch ?? '',
              start: p.start ?? '',
              date: p.date ? formatDate(p.date, { style: 'medium' }) : '',
            });
            return (
              <Box
                component="li"
                key={n.id}
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 2,
                  alignItems: 'center',
                  padding: 3,
                  border: '1px solid',
                  borderColor: n.readAt ? 'ab.border' : 'ab.accent',
                  borderRadius: 2,
                  bgcolor: 'ab.surface',
                }}
              >
                <Stack spacing={0.5} sx={{ flex: '1 1 240px', minInlineSize: 0 }}>
                  {n.link ? (
                    <Box
                      component="a"
                      href={hrefOf(n.link)}
                      sx={{ color: 'ab.textPrimary', fontWeight: 600 }}
                    >
                      {text}
                    </Box>
                  ) : (
                    <Text>{text}</Text>
                  )}
                  <Text variant="meta" tone="secondary" as="span">
                    {formatTime(n.createdAt, { timeZone })} ·{' '}
                    {formatDate(n.createdAt, { style: 'medium', timeZone })}
                  </Text>
                </Stack>
                {!n.readAt && <StatusBadge tone="info" label={t('unread')} />}
              </Box>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
