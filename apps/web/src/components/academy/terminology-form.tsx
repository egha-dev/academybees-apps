// Reached only through lazy() (academy-lazy.tsx): no 'use client' boundary (G-24).

import {
  type AcademySettings,
  TERM_OPTIONS,
  type Terminology,
  type TermKey,
} from '@academybee/contracts';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { useToast } from '@academybee/ui/components/feedback';
import { SelectInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { academyErrorMessage, type AcademyErrorLabels } from './labels';

export type TerminologyLabels = {
  title: string;
  body: string;
  batch: string;
  course: string;
  teacher: string;
  options: { [K in TermKey]: Record<(typeof TERM_OPTIONS)[K][number], string> };
  save: string;
  saved: string;
  errors: AcademyErrorLabels;
};

const KEYS: TermKey[] = ['batch', 'course', 'teacher'];

/**
 * "Words your academy uses" (ADR-029, C-118): Batch/Class/Group, Course/Program,
 * Teacher/Coach/Instructor/Trainer. Every screen and message follows the choice.
 */
export function TerminologyForm({
  value,
  canManage,
  labels,
}: {
  value: AcademySettings;
  canManage: boolean;
  labels: TerminologyLabels;
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [terms, setTerms] = useState<Terminology>(value.terminology);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const res = await api<AcademySettings>('/academy/terminology', {
      method: 'PATCH',
      body: { version: value.version, terminology: terms },
    });
    setBusy(false);
    if (!res.ok) return setError(academyErrorMessage(res.error, labels.errors));
    setTerms(res.data.terminology);
    toast(labels.saved);
    router.refresh();
  }

  return (
    <Box
      component="form"
      noValidate
      aria-labelledby="terminology-title"
      onSubmit={(e: FormEvent) => void submit(e)}
      sx={{ maxInlineSize: 560 }}
    >
      <Stack spacing={4}>
        <Stack spacing={1}>
          <Text variant="section" id="terminology-title">
            {labels.title}
          </Text>
          <Text tone="secondary">{labels.body}</Text>
        </Stack>
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        {KEYS.map((key) => (
          <SelectInput
            key={key}
            name={`term-${key}`}
            label={labels[key]}
            value={terms[key]}
            onChange={(v) => setTerms((t) => ({ ...t, [key]: v }))}
            disabled={!canManage}
            options={TERM_OPTIONS[key].map((o) => ({
              value: o,
              label: (labels.options[key] as Record<string, string>)[o]!,
            }))}
          />
        ))}
        {canManage && (
          <Button type="submit" loading={busy} disabled={!online}>
            {labels.save}
          </Button>
        )}
      </Stack>
    </Box>
  );
}
