import type { AttendanceCounts } from '@academybee/contracts';
import { StatusBadge } from '@academybee/ui/components/display';
import { Box, Stack } from '@academybee/ui/components/layout';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { getTranslations } from 'next-intl/server';

export type RollRow = {
  sessionId: string;
  title: string;
  when: string;
  state: 'taken' | 'due' | 'later' | 'cancelled';
  counts: AttendanceCounts;
  /** Shown as Take / Edit when the viewer may mark it and it is on a device's window. */
  markable: boolean;
};

const TONE = { taken: 'success', due: 'warning', later: 'neutral', cancelled: 'neutral' } as const;

/**
 * Classes with their roll call state and counts (UX §10: what needs attention, what to do now).
 * State is text with an icon, never colour alone. Server-rendered; no client JS.
 */
export async function SessionRows({ rows }: { rows: RollRow[] }) {
  const t = await getTranslations('teach.staff');
  return (
    <Stack component="ul" spacing={2} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {rows.map((r) => (
        <Box
          component="li"
          key={r.sessionId}
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
          }}
        >
          <Stack spacing={0.5} sx={{ flex: '1 1 220px', minInlineSize: 0 }}>
            <Box sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{r.title}</Box>
            <Text variant="meta" tone="secondary" as="span">
              {r.when}
            </Text>
            {r.state !== 'cancelled' && (
              <Text variant="meta" tone="secondary" as="span">
                {t('counts', {
                  present: r.counts.PRESENT,
                  absent: r.counts.ABSENT,
                  late: r.counts.LATE,
                  leave: r.counts.LEAVE,
                  unmarked: r.counts.unmarked,
                })}
              </Text>
            )}
          </Stack>
          <StatusBadge tone={TONE[r.state]} label={t(`states.${r.state}`)} />
          {r.markable && r.state !== 'cancelled' && (
            <PlainButton
              variant={r.state === 'due' ? 'primary' : 'secondary'}
              href={`/attendance/take?session=${r.sessionId}`}
            >
              {r.state === 'taken' ? t('edit') : t('take')}
            </PlainButton>
          )}
        </Box>
      ))}
    </Stack>
  );
}
