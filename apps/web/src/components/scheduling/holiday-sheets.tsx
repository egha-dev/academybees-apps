// Loaded lazily by timetable-lazy.tsx (no 'use client', C-80).
import type { Messages } from '@academybee/i18n';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { useToast } from '@academybee/ui/components/feedback';
import { DateInput, SelectInput, TextInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { ConfirmDialog, Sheet } from '@academybee/ui/components/overlays';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { type PeopleErrorLabels, peopleErrorMessage } from '@/components/people/errors';
import { plurals } from '@/components/scheduling/plural';
import { fill } from '@/components/shell-labels';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

type Labels = {
  holidays: Messages['scheduling']['holidays'];
  common: Messages['people']['form'];
  errors: PeopleErrorLabels;
};
type Preview = {
  days: { date: string; sessions: { id: string }[]; students: number }[];
  totals: { sessions: number; batches: number; students: number };
};

/**
 * Add a holiday (G-03, C-115): name and days → the exact classes it cancels, day by day →
 * confirm. Nothing is cancelled before the confirm; parents' notices are recorded, not sent.
 */
export function AddHolidaySheet({ today, labels }: { today: string; labels: Labels }) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const h = labels.holidays;
  const c = labels.common;
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState({ name: '', startDate: '', endDate: '', kind: 'HOLIDAY' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<Preview>();
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof draft) => (v: string) => {
    setPreview(undefined);
    setDraft((d) => ({ ...d, [k]: v }));
  };
  const body = () => ({
    name: draft.name.trim(),
    startDate: draft.startDate,
    endDate: draft.endDate || draft.startDate,
    kind: draft.kind,
  });
  function fail(e: Parameters<typeof peopleErrorMessage>[0]) {
    const issue = e.details?.[0]?.issue;
    // The classes changed since the preview: show the preview button again to look afresh.
    if (issue === 'preview_changed') setPreview(undefined);
    setError(
      issue === 'too_many_sessions'
        ? h.tooMany
        : issue === 'preview_changed'
          ? h.previewChanged
          : issue === 'in_past'
            ? h.inPast
            : peopleErrorMessage(e, labels.errors),
    );
  }
  function close() {
    setOpen(false);
    setPreview(undefined);
    setError(undefined);
    setErrors({});
    setDraft({ name: '', startDate: '', endDate: '', kind: 'HOLIDAY' });
    setKey(crypto.randomUUID());
  }

  async function check(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!draft.name.trim()) local.name = c.required;
    if (!draft.startDate) local.startDate = c.required;
    else if (draft.startDate < today) local.startDate = h.inPast;
    if (draft.endDate && draft.endDate < draft.startDate) local.endDate = c.dateInvalid;
    setErrors(local);
    if (Object.keys(local).length) return setError(c.checkFields);
    setBusy(true);
    setError(undefined);
    const res = await api<Preview>('/holidays/preview', { method: 'POST', body: body() });
    setBusy(false);
    if (!res.ok) return fail(res.error);
    setPreview(res.data);
  }
  async function confirm() {
    setBusy(true);
    setError(undefined);
    const res = await api<{ cancelled: number }>('/holidays', {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      // Exactly the classes the preview showed (C-115); a change since is refused, not guessed.
      body: {
        ...body(),
        previewedSessionIds: (preview?.days ?? []).flatMap((d) => d.sessions.map((x) => x.id)),
      },
    });
    setBusy(false);
    if (!res.ok) return fail(res.error);
    toast(plurals(h.added, { name: draft.name.trim(), count: res.data.cancelled }));
    close();
    router.refresh();
  }

  // Academy-local calendar dates: formatted as dates, never shifted by the browser's timezone.
  const label = (d: string) =>
    new Intl.DateTimeFormat(document.documentElement.lang || 'en-IN', {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(new Date(`${d}T00:00:00Z`));
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!online}>
        {h.add}
      </Button>
      <Sheet open={open} onClose={close} title={h.add} closeLabel={c.close}>
        <Stack spacing={4}>
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <Stack component="form" spacing={3} noValidate onSubmit={(e: FormEvent) => void check(e)}>
            <TextInput
              name="name"
              label={h.name}
              helperText={h.nameHint}
              required
              value={draft.name}
              onChange={set('name')}
              error={errors.name}
            />
            <DateInput
              name="startDate"
              label={h.start}
              required
              value={draft.startDate}
              onChange={set('startDate')}
              error={errors.startDate}
            />
            <DateInput
              name="endDate"
              label={h.end}
              value={draft.endDate}
              onChange={set('endDate')}
              error={errors.endDate}
            />
            <SelectInput
              name="kind"
              label={h.kind}
              value={draft.kind}
              onChange={set('kind')}
              options={(['HOLIDAY', 'CLOSURE'] as const).map((k) => ({
                value: k,
                label: h.kinds[k],
              }))}
            />
            {!preview && (
              <Box>
                <Button type="submit" variant="secondary" loading={busy} disabled={!online}>
                  {h.preview}
                </Button>
              </Box>
            )}
          </Stack>
          {preview && (
            <Stack
              spacing={2}
              component="section"
              aria-label={fill(h.previewTitle, { name: draft.name.trim() })}
            >
              <Text variant="section" as="h3">
                {fill(h.previewTitle, { name: draft.name.trim() })}
              </Text>
              {preview.totals.sessions === 0 ? (
                <Text>{h.nothing}</Text>
              ) : (
                <>
                  <Text>{plurals(h.previewTotals, preview.totals)}</Text>
                  <Stack component="ul" spacing={1} sx={{ margin: 0, paddingInlineStart: 3 }}>
                    {preview.days
                      .filter((d) => d.sessions.length > 0)
                      .map((d) => (
                        <li key={d.date}>
                          {plurals(h.previewDay, {
                            date: label(d.date),
                            sessions: d.sessions.length,
                            students: d.students,
                          })}
                        </li>
                      ))}
                  </Stack>
                  <Text variant="meta" tone="secondary">
                    {h.noticeNote}
                  </Text>
                </>
              )}
              <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 2 }}>
                <Button loading={busy} disabled={!online} onClick={() => void confirm()}>
                  {plurals(h.confirm, { count: preview.totals.sessions })}
                </Button>
                <Button variant="secondary" onClick={close}>
                  {c.cancel}
                </Button>
              </Stack>
            </Stack>
          )}
        </Stack>
      </Sheet>
    </>
  );
}

/** Remove a future holiday: its classes come back unless they were changed since (C-115). */
export function RemoveHoliday({ id, name, labels }: { id: string; name: string; labels: Labels }) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const h = labels.holidays;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    const res = await api(`/holidays/${id}`, { method: 'DELETE' });
    setBusy(false);
    setOpen(false);
    if (!res.ok) return toast(peopleErrorMessage(res.error, labels.errors), 'error');
    toast(fill(h.removed, { name }));
    router.refresh();
  }
  return (
    <>
      <PlainButton variant="ghost" disabled={!online} onClick={() => setOpen(true)}>
        {h.remove}
      </PlainButton>
      <ConfirmDialog
        open={open}
        title={fill(h.removeTitle, { name })}
        body={h.removeBody}
        confirmLabel={h.remove}
        cancelLabel={labels.common.cancel}
        tone="danger"
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={() => void remove()}
      />
    </>
  );
}
