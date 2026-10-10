// Loaded lazily by students-lazy.tsx (no 'use client', C-80).
import type { Messages } from '@academybee/i18n';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { useToast } from '@academybee/ui/components/feedback';
import { TextAreaInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { fill } from '@/components/shell-labels';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { type PeopleErrorLabels, peopleErrorMessage } from './errors';

type Note = { notes: string; version: number; updatedAt: string } | null;

/** The page's language (set from the user's locale on <html>), Intl formatting (ADR-031). */
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
    dateStyle: 'medium',
  }).format(new Date(iso));

/**
 * Medical and allergy notes (G-05, C-90): hidden until someone with access asks to see them, and
 * every view is recorded by the API (audit). Never cached, never in the page HTML.
 */
export function HealthNote({
  studentId,
  exists,
  canManage,
  labels,
}: {
  studentId: string;
  exists: boolean;
  canManage: boolean;
  labels: {
    health: Messages['people']['health'];
    form: Messages['people']['form'];
    errors: PeopleErrorLabels;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [note, setNote] = useState<Note | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const h = labels.health;

  async function show(): Promise<Note | undefined> {
    setBusy(true);
    setError(undefined);
    const res = await api<{ note: Note }>(`/students/${studentId}/health-note`);
    setBusy(false);
    if (!res.ok) {
      setError(peopleErrorMessage(res.error, labels.errors));
      return undefined;
    }
    setNote(res.data.note);
    return res.data.note;
  }

  async function startEdit() {
    let current = note;
    if (current === undefined) {
      const loaded = await show();
      if (loaded === undefined) return; // couldn't load: the error is shown
      current = loaded;
    }
    setText(current?.notes ?? '');
    setEditing(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const res = await api<{ note: Note }>(`/students/${studentId}/health-note`, {
      method: 'PUT',
      body: { notes: text.trim(), ...(note ? { version: note.version } : {}) },
    });
    setBusy(false);
    if (!res.ok) return setError(peopleErrorMessage(res.error, labels.errors));
    setNote(res.data.note);
    setEditing(false);
    toast(res.data.note ? h.saved : h.cleared);
    router.refresh();
  }

  if (editing)
    return (
      <Stack component="form" spacing={3} onSubmit={(e: FormEvent) => void save(e)}>
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <TextAreaInput
          name="healthNote"
          label={h.field}
          helperText={h.fieldHint}
          value={text}
          rows={5}
          maxLength={2000}
          onChange={setText}
        />
        <Stack direction="row" spacing={2}>
          <Button type="submit" loading={busy} disabled={!online}>
            {h.save}
          </Button>
          <Button variant="secondary" onClick={() => setEditing(false)}>
            {labels.form.cancel}
          </Button>
        </Stack>
      </Stack>
    );

  return (
    <Stack spacing={2}>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {note !== undefined && (
        <Box
          sx={{ padding: 3, borderRadius: 2, bgcolor: 'ab.surfaceRaised', whiteSpace: 'pre-wrap' }}
        >
          {note ? (
            <>
              <Text>{note.notes}</Text>
              <Text variant="meta" tone="secondary">
                {fill(h.updated, { date: shortDate(note.updatedAt) })}
              </Text>
            </>
          ) : (
            <Text tone="secondary">{h.none}</Text>
          )}
        </Box>
      )}
      {!exists && note === undefined && <Text tone="secondary">{h.none}</Text>}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {exists && (
          <PlainButton
            variant="secondary"
            busy={busy && !editing}
            onClick={() => (note === undefined ? void show() : setNote(undefined))}
          >
            {note === undefined ? h.show : h.hide}
          </PlainButton>
        )}
        {canManage && (
          <PlainButton variant="ghost" onClick={() => void startEdit()} disabled={!online}>
            {exists || note ? h.edit : h.add}
          </PlainButton>
        )}
      </Box>
    </Stack>
  );
}
