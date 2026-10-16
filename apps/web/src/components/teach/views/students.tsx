// Part of the Teacher PWA's lazy chunk.
import { StatusBadge } from '@academybee/ui/components/display';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { useState } from 'react';

import { useTeach } from '../teach-app';
import { useLive } from '../use-live';

const TONE = { PRESENT: 'success', ABSENT: 'danger', LATE: 'warning', LEAVE: 'info' } as const;

/** Students in the teacher's batches with their recent attendance, all from this device. */
export function StudentsView() {
  const { engine, labels, day } = useTeach();
  const t = labels.teach;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const data = useLive(async () => {
    const [students, batches] = await Promise.all([
      engine.local.students(),
      engine.db.batches.toArray(),
    ]);
    return { students, batchNames: new Map(batches.map((b) => [b.id, b.name])) };
  }, [engine]);
  const marks = useLive(async () => (open ? engine.local.marksOf(open) : []), [engine, open]);
  if (!data) return <Text tone="secondary">{t.loading}</Text>;
  const q = query.trim().toLocaleLowerCase();
  const shown = data.students.filter(
    (s) =>
      !q ||
      s.fullName.toLocaleLowerCase().includes(q) ||
      (s.admissionNo ?? '').toLocaleLowerCase().includes(q),
  );
  return (
    <Stack spacing={4}>
      <Stack spacing={0.5}>
        <Text variant="title" as="h1">
          {t.students.title}
        </Text>
        <Text tone="secondary">{t.students.body}</Text>
      </Stack>
      <Box
        component="label"
        sx={{ display: 'flex', flexDirection: 'column', gap: 1, fontWeight: 600, fontSize: 14 }}
      >
        {t.students.search}
        <Box
          component="input"
          type="search"
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          sx={{
            minBlockSize: 48,
            paddingInline: '12px',
            font: 'inherit',
            fontSize: 16,
            color: 'ab.textPrimary',
            bgcolor: 'ab.surface',
            border: '1px solid',
            borderColor: 'ab.borderStrong',
            borderRadius: 2,
          }}
        />
      </Box>
      {data.students.length === 0 ? (
        <Text tone="secondary">{t.students.empty}</Text>
      ) : shown.length === 0 ? (
        <Text tone="secondary">{t.students.noMatch}</Text>
      ) : (
        <Stack component="ul" spacing={2} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {shown.map((s) => (
            <Box
              component="li"
              key={s.id}
              sx={{
                border: '1px solid',
                borderColor: 'ab.border',
                borderRadius: 2,
                bgcolor: 'ab.surface',
              }}
            >
              <Box
                component="button"
                type="button"
                aria-expanded={open === s.id}
                onClick={() => setOpen(open === s.id ? null : s.id)}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 0.5,
                  inlineSize: '100%',
                  minBlockSize: 56,
                  padding: 2,
                  font: 'inherit',
                  textAlign: 'start',
                  color: 'ab.textPrimary',
                  bgcolor: 'transparent',
                  border: 0,
                  cursor: 'pointer',
                }}
              >
                <Box sx={{ fontWeight: 600 }}>{s.fullName}</Box>
                <Text variant="meta" tone="secondary" as="span">
                  {s.batchIds
                    .map((id) => data.batchNames.get(id))
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </Box>
              {open === s.id && (
                <Stack spacing={1} sx={{ paddingInline: 2, paddingBlockEnd: 2 }}>
                  <Text variant="meta" tone="secondary">
                    {t.students.recent}
                  </Text>
                  {!marks || marks.length === 0 ? (
                    <Text tone="secondary">{t.students.noMarks}</Text>
                  ) : (
                    marks.slice(0, 10).map((m) => (
                      <Box
                        key={m.key}
                        sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}
                      >
                        <Text as="span">{m.date ? day(m.date, 'short') : ''}</Text>
                        <StatusBadge tone={TONE[m.status]} label={t.status[m.status]} />
                      </Box>
                    ))
                  )}
                </Stack>
              )}
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
