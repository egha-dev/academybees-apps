import type { Session, Terminology } from '@academybee/contracts';
import { formatTime } from '@academybee/i18n';
import { StatusBadge } from '@academybee/ui/components/display';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { getTranslations } from 'next-intl/server';

const TONE = { SCHEDULED: 'info', CANCELLED: 'warning', COMPLETED: 'success' } as const;

/**
 * Classes as a chronological list (UX §11.6 mobile timeline): time, batch, teacher and status as
 * text with an icon — never colour alone. Server-rendered; no client JS.
 */
export async function SessionList({
  sessions,
  timeZone,
  terms,
  showBatch = true,
}: {
  sessions: Session[];
  timeZone: string | undefined;
  terms: Terminology;
  showBatch?: boolean;
}) {
  const t = await getTranslations('scheduling.session');
  const time = (iso: string) => formatTime(iso, { ...(timeZone ? { timeZone } : {}) });
  return (
    <Stack component="ul" spacing={2} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {sessions.map((s) => (
        <Box
          component="li"
          key={s.id}
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            alignItems: 'center',
            padding: 3,
            border: '1px solid',
            borderColor: 'ab.border',
            borderRadius: 2,
            bgcolor: 'ab.surface',
            opacity: s.status === 'CANCELLED' ? 0.85 : 1,
          }}
        >
          <Box sx={{ minInlineSize: 120, fontWeight: 600 }}>
            {t('time', { start: time(s.startsAt), end: time(s.endsAt) })}
          </Box>
          <Stack spacing={0.5} sx={{ flex: '1 1 200px', minInlineSize: 0 }}>
            {showBatch && <Text>{s.batchName}</Text>}
            <Text variant="meta" tone="secondary">
              {s.teacherName ?? t('noTeacher', { term: terms.teacher })}
              {s.makeupForSessionId
                ? ` · ${t('makeup')}`
                : s.origin === 'MANUAL'
                  ? ` · ${t('extra')}`
                  : ''}
            </Text>
            {s.holidayName && (
              <Text variant="meta" tone="secondary">
                {t('holiday', { name: s.holidayName })}
              </Text>
            )}
          </Stack>
          <StatusBadge tone={TONE[s.status]} label={t(`status.${s.status}`)} />
        </Box>
      ))}
    </Stack>
  );
}
