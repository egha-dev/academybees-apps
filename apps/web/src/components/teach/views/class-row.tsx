// Part of the Teacher PWA's lazy chunk.
import type { LocalClass } from '@academybee/sync';
import { StatusBadge } from '@academybee/ui/components/display';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';

import { fill } from '@/lib/fill';

import { useTeach } from '../teach-app';

/** Taken: a roll call is on this device or the class is completed. */
export type ClassState = 'taken' | 'notTaken' | 'cancelled' | 'later';

export function classState(c: LocalClass, marked: boolean, now = Date.now()): ClassState {
  if (c.status === 'CANCELLED') return 'cancelled';
  if (marked || c.status === 'COMPLETED') return 'taken';
  return Date.parse(c.endsAt) < now ? 'notTaken' : 'later';
}

/**
 * One class as a large link to its roll call (UX §12: tap targets ≥ 48 px). Status is text and
 * icon, never colour alone. A plain link: it opens offline from the cached screen (C-124).
 */
export function ClassRow({
  c,
  state,
  showDate,
}: {
  c: LocalClass;
  state: ClassState;
  showDate?: boolean;
}) {
  const { labels, time, day } = useTeach();
  const t = labels.teach;
  return (
    <Box
      component="a"
      href={`/teach/attendance?session=${c.id}`}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 2,
        minBlockSize: 64,
        padding: 3,
        border: '1px solid',
        borderColor: 'ab.border',
        borderRadius: 2,
        bgcolor: 'ab.surface',
        color: 'ab.textPrimary',
        textDecoration: 'none',
        '&:hover': { bgcolor: 'ab.surfaceRaised' },
      }}
    >
      <Stack spacing={0.5} sx={{ flex: '1 1 200px', minInlineSize: 0 }}>
        <Box sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{c.batchName}</Box>
        <Text variant="meta" tone="secondary" as="span">
          {showDate ? `${day(c.date, 'short')} · ` : ''}
          {time(c.startsAt)}–{time(c.endsAt)}
        </Text>
        {c.holidayName && (
          <Text variant="meta" tone="secondary" as="span">
            {fill(t.today.holiday, { name: c.holidayName })}
          </Text>
        )}
      </Stack>
      {state === 'taken' && <StatusBadge tone="success" label={t.classes.taken} />}
      {state === 'notTaken' && <StatusBadge tone="warning" label={t.classes.notTaken} />}
      {state === 'cancelled' && <StatusBadge tone="neutral" label={t.classes.cancelled} />}
    </Box>
  );
}
