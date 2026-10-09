'use client';

import { Button } from '@academybee/ui/components/actions';
import { Select, TextField } from '@academybee/ui/components/inputs';
import { Box, Stack } from '@academybee/ui/components/layout';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

const STATUSES = ['SETUP', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const;

/** Search by name or address and filter by status; the list itself is rendered on the server. */
export function AcademyFilters({ q, status }: { q: string; status: string }) {
  const t = useTranslations('console');
  const router = useRouter();
  const [query, setQuery] = useState(q);
  const [state, setState] = useState(status);

  const go = (next: { q: string; status: string }) => {
    const params = new URLSearchParams();
    if (next.q.trim()) params.set('q', next.q.trim());
    if (next.status) params.set('status', next.status);
    const qs = params.toString();
    router.push(qs ? `/academies?${qs}` : '/academies');
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    go({ q: query, status: state });
  };

  return (
    <Box component="form" role="search" onSubmit={submit} noValidate>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        sx={{ gap: 3, alignItems: { md: 'flex-end' } }}
      >
        <Box sx={{ flex: 2, minInlineSize: 0 }}>
          <TextField
            label={t('academies.search.label')}
            placeholder={t('academies.search.placeholder')}
            type="search"
            inputMode="search"
            name="q"
            value={query}
            onChange={setQuery}
          />
        </Box>
        <Box sx={{ flex: 1, minInlineSize: 0 }}>
          <Select
            label={t('academies.search.status')}
            value={state}
            onChange={(v) => {
              setState(v);
              go({ q: query, status: v });
            }}
            options={[
              { value: '', label: t('academies.search.anyStatus') },
              ...STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
            ]}
          />
        </Box>
        <Stack direction="row" spacing={2}>
          <Button type="submit">{t('academies.search.submit')}</Button>
          {(q || status) && (
            <Button
              variant="ghost"
              onClick={() => {
                setQuery('');
                setState('');
                go({ q: '', status: '' });
              }}
            >
              {t('academies.search.clear')}
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}
