// Part of the Teacher PWA's lazy chunk.
import { addDays } from '@academybee/contracts';
import type { LocalClass } from '@academybee/sync';
import { Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';

import { useTeach } from '../teach-app';
import { useLive, useNow } from '../use-live';
import { ClassRow, classState } from './class-row';

/** Classes (UX §14): today, the next week and the last 7 days, with roll calls not taken. */
export function ClassesView() {
  const { engine, labels, today } = useTeach();
  const now = useNow();
  const t = labels.teach.classes;
  const date = today();
  const data = useLive(async () => {
    const classes = await engine.local.classes(addDays(date, -7), addDays(date, 14));
    const marked = new Set(
      (
        await engine.db.attendance
          .where('sessionId')
          .anyOf(classes.map((c) => c.id))
          .toArray()
      ).map((a) => a.sessionId),
    );
    return { classes, marked };
  }, [engine, date]);
  if (!data) return <Text tone="secondary">{labels.teach.loading}</Text>;
  const section = (id: string, title: string, rows: LocalClass[], showDate: boolean) => (
    <Stack spacing={2} component="section" aria-labelledby={id}>
      <Text variant="section" as="h2" id={id}>
        {title}
      </Text>
      {rows.length === 0 ? (
        <Text tone="secondary">{t.empty}</Text>
      ) : (
        rows.map((c) => (
          <ClassRow
            key={c.id}
            c={c}
            state={classState(c, data.marked.has(c.id), now)}
            showDate={showDate}
          />
        ))
      )}
    </Stack>
  );
  return (
    <Stack spacing={5}>
      <Stack spacing={0.5}>
        <Text variant="title" as="h1">
          {t.title}
        </Text>
        <Text tone="secondary">{t.body}</Text>
      </Stack>
      {section(
        'classes-today',
        t.today,
        data.classes.filter((c) => c.date === date),
        false,
      )}
      {section(
        'classes-upcoming',
        t.upcoming,
        data.classes.filter((c) => c.date > date && c.date <= addDays(date, 7)),
        true,
      )}
      {section('classes-past', t.past, data.classes.filter((c) => c.date < date).reverse(), true)}
    </Stack>
  );
}
