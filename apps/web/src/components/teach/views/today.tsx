// Part of the Teacher PWA's lazy chunk.
import { addDays } from '@academybee/contracts';
import { Card } from '@academybee/ui/components/display';
import { Box, Stack } from '@academybee/ui/components/layout';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';

import { fill } from '@/lib/fill';

import { useTeach } from '../teach-app';
import { useLive, useNow } from '../use-live';
import { ClassRow, classState } from './class-row';

/**
 * Teacher Today (UX §10, §14; Tier 1): the next class with Take attendance first, then the
 * rest of today. Read from this device, so it opens offline.
 */
export function TodayView() {
  const { engine, labels, name, today, time, day } = useTeach();
  const now = useNow();
  const t = labels.teach;
  const date = today();
  const data = useLive(async () => {
    const classes = await engine.local.classes(date, addDays(date, 7));
    const batches = (await engine.db.batches.toArray()).sort((x, y) =>
      x.name.localeCompare(y.name),
    );
    const marked = new Set(
      (
        await engine.db.attendance
          .where('sessionId')
          .anyOf(classes.map((c) => c.id))
          .toArray()
      ).map((a) => a.sessionId),
    );
    return { classes, marked, batches };
  }, [engine, date]);
  if (!data) return <Text tone="secondary">{t.loading}</Text>;
  const todays = data.classes.filter((c) => c.date === date);
  const later = data.classes.filter((c) => c.date > date);
  const next =
    todays.find(
      (c) => c.status !== 'CANCELLED' && !data.marked.has(c.id) && Date.parse(c.endsAt) > now,
    ) ?? todays.find((c) => c.status !== 'CANCELLED' && !data.marked.has(c.id));
  return (
    <Stack spacing={4}>
      <Stack spacing={0.5}>
        <Text variant="title" as="h1">
          {fill(t.greeting, { name })}
        </Text>
        <Text tone="secondary">{day(date)}</Text>
      </Stack>
      {next && (
        <Card>
          <Stack spacing={2}>
            <Text variant="meta" tone="secondary" as="span">
              {t.today.next}
            </Text>
            <Text variant="section" as="h2">
              {next.batchName}
            </Text>
            <Text tone="secondary">
              {time(next.startsAt)}–{time(next.endsAt)}
            </Text>
            <Box>
              <PlainButton variant="primary" href={`/teach/attendance?session=${next.id}`}>
                {t.today.takeAttendance}
              </PlainButton>
            </Box>
          </Stack>
        </Card>
      )}
      <Stack spacing={2} component="section" aria-labelledby="teach-today">
        <Text variant="section" as="h2" id="teach-today">
          {t.today.title}
        </Text>
        {todays.length === 0 ? (
          <Text tone="secondary">{t.today.none}</Text>
        ) : (
          todays.map((c) => (
            <ClassRow key={c.id} c={c} state={classState(c, data.marked.has(c.id), now)} />
          ))
        )}
      </Stack>
      <Stack spacing={2} component="section" aria-labelledby="teach-week">
        <Text variant="section" as="h2" id="teach-week">
          {t.today.week}
        </Text>
        {later.length === 0 ? (
          <Text tone="secondary">{t.classes.empty}</Text>
        ) : (
          later.map((c) => (
            <ClassRow key={c.id} c={c} state={classState(c, data.marked.has(c.id), now)} showDate />
          ))
        )}
      </Stack>
      <Stack spacing={2} component="section" aria-labelledby="teach-batches">
        <Text variant="section" as="h2" id="teach-batches">
          {t.today.batches}
        </Text>
        {data.batches.length === 0 ? (
          <Text tone="secondary">{t.today.noBatches}</Text>
        ) : (
          <Stack component="ul" spacing={1} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {data.batches.map((b) => (
              <li key={b.id}>
                {/* The read-only Batch Workspace (C-117) is an online page. */}
                <Box
                  component="a"
                  href={`/batches/${b.id}`}
                  sx={{ fontWeight: 600, color: 'ab.textPrimary' }}
                >
                  {b.name}
                </Box>
              </li>
            ))}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}
