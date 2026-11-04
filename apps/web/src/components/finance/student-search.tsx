// Reached only through lazily loaded sheets (no 'use client', C-80).
import type { CursorPage, StudentListItem } from '@academybee/contracts';
import { SelectInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { type ChangeEvent, useEffect, useId, useState } from 'react';

import { api } from '@/lib/api';

type Labels = Record<'search' | 'searchHint' | 'noMatch' | 'student' | 'selectNone', string>;

/** Find one student by name or admission number; a choice no longer shown is dropped. */
export function StudentSearch({
  value,
  onChange,
  error,
  labels,
}: {
  value: string;
  onChange: (id: string) => void;
  error?: string | undefined;
  labels: Labels;
}) {
  const id = useId();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<StudentListItem[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void api<CursorPage<StudentListItem>>(
        `/students?limit=10&q=${encodeURIComponent(q.trim())}`,
      ).then((res) => {
        if (cancelled || !res.ok) return;
        setFound(res.data.items);
        if (!res.data.items.some((s) => s.id === value)) onChange('');
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `value` and `onChange` only matter when the results change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <Stack spacing={2}>
      <Stack spacing={1}>
        <Box component="label" htmlFor={id} sx={{ fontSize: 14, fontWeight: 600 }}>
          {labels.search}
        </Box>
        <Box
          component="input"
          id={id}
          type="search"
          value={q}
          aria-describedby={`${id}-hint`}
          onChange={(ev: ChangeEvent<HTMLInputElement>) => setQ(ev.target.value)}
          sx={{
            minBlockSize: 48,
            paddingInline: '14px',
            font: 'inherit',
            fontSize: 16,
            color: 'ab.textPrimary',
            bgcolor: 'ab.surface',
            border: '1px solid',
            borderColor: 'ab.borderStrong',
            borderRadius: 2,
          }}
        />
        <Text id={`${id}-hint`} variant="meta" tone="secondary">
          {labels.searchHint}
        </Text>
      </Stack>
      {q.trim().length >= 2 &&
        (found.length === 0 ? (
          <Text tone="secondary">{labels.noMatch}</Text>
        ) : (
          <SelectInput
            name="student"
            label={labels.student}
            value={value}
            onChange={onChange}
            error={error}
            options={[
              { value: '', label: labels.selectNone },
              ...found.map((s) => ({ value: s.id, label: `${s.fullName} (${s.admissionNo})` })),
            ]}
          />
        ))}
    </Stack>
  );
}
