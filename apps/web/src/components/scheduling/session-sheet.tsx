// Loaded lazily by timetable-lazy.tsx (no 'use client', C-80).
import type { Messages } from '@academybee/i18n';
import type { Session } from '@academybee/contracts';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { useToast } from '@academybee/ui/components/feedback';
import { DateInput, SelectInput, TextInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Sheet } from '@academybee/ui/components/overlays';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { type PeopleErrorLabels, peopleErrorMessage } from '@/components/people/errors';
import { fill } from '@/components/shell-labels';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

type Labels = {
  sheet: Messages['scheduling']['sessionSheet'];
  status: Messages['scheduling']['session']['status'];
  common: Messages['people']['form'];
  errors: PeopleErrorLabels;
};
type DoubleBooking = { teacherName: string; start: string; end: string; otherBatchName: string };
type Result = { session: Session; doubleBookings: DoubleBooking[] };
type Mode = 'view' | 'cancel' | 'move' | 'makeup';

function TimeField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Box component="label" sx={{ flex: '1 1 120px', fontSize: 14, fontWeight: 600 }}>
      {label}
      <Box
        component="input"
        type="time"
        name={name}
        value={value}
        step={300}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        sx={{
          display: 'block',
          marginBlockStart: 0.5,
          inlineSize: '100%',
          minBlockSize: 48,
          boxSizing: 'border-box',
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
  );
}

/**
 * One class on the timetable (UX §11.6, C-115, C-116): cancel with a reason or bring it back,
 * move it or change its teacher, add a make-up for a cancelled class, open its batch. A class
 * that has started can't be changed; a holiday's classes come back only by removing the holiday.
 */
export function SessionSheet({
  session,
  now,
  closeHref,
  teachers,
  canManage,
  dateLabel,
  timeLabel,
  labels,
}: {
  session: Session;
  now: string;
  closeHref: string;
  teachers: { id: string; fullName: string }[];
  canManage: boolean;
  dateLabel: string;
  timeLabel: string;
  labels: Labels;
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const s = labels.sheet;
  const c = labels.common;
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<Mode>('view');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [warnings, setWarnings] = useState<DoubleBooking[]>([]);
  const [reason, setReason] = useState<'TEACHER_UNAVAILABLE' | 'OTHER'>('TEACHER_UNAVAILABLE');
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState({
    date: mode === 'makeup' ? '' : session.date,
    start: session.start,
    end: session.end,
    teacherId: session.teacherId ?? '',
  });
  const started = session.startsAt <= now;
  const title = fill(s.title, { batch: session.batchName, date: dateLabel });

  function close() {
    setOpen(false);
    router.replace(closeHref, { scroll: false });
  }
  function go(next: Mode) {
    setError(undefined);
    setWarnings([]);
    setKey(crypto.randomUUID());
    if (next === 'move' || next === 'makeup')
      setDraft({
        date: next === 'makeup' ? '' : session.date,
        start: session.start,
        end: session.end,
        teacherId: session.teacherId ?? '',
      });
    setMode(next);
  }
  function fail(error: Parameters<typeof peopleErrorMessage>[0]) {
    const issue = error.details?.[0]?.issue;
    setError(
      issue === 'in_past'
        ? s.inPast
        : issue === 'started'
          ? s.started
          : issue === 'end_before_start'
            ? c.dateInvalid
            : peopleErrorMessage(error, labels.errors),
    );
  }
  function done(message: string, result?: Result) {
    toast(message);
    if (result?.doubleBookings.length) {
      setWarnings(result.doubleBookings);
      setMode('view');
      router.refresh();
      return;
    }
    close();
    router.refresh();
  }

  async function cancel(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const res = await api(`/sessions/${session.id}/cancel`, {
      method: 'POST',
      body: { version: session.version, reason, ...(note.trim() ? { note: note.trim() } : {}) },
    });
    setBusy(false);
    if (!res.ok) return fail(res.error);
    done(s.cancelled);
  }
  async function restore() {
    setBusy(true);
    setError(undefined);
    const res = await api(`/sessions/${session.id}/restore`, {
      method: 'POST',
      body: { version: session.version },
    });
    setBusy(false);
    if (!res.ok) return fail(res.error);
    done(s.restored);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft.date) return setError(c.checkFields);
    if (draft.end <= draft.start) return setError(c.dateInvalid);
    setBusy(true);
    setError(undefined);
    const teacherId = draft.teacherId || null;
    const res =
      mode === 'makeup'
        ? await api<Result>('/sessions', {
            method: 'POST',
            headers: { 'Idempotency-Key': key },
            body: {
              batchId: session.batchId,
              date: draft.date,
              start: draft.start,
              end: draft.end,
              teacherId,
              makeupForSessionId: session.id,
            },
          })
        : await api<Result>(`/sessions/${session.id}`, {
            method: 'PATCH',
            body: {
              version: session.version,
              ...(draft.date !== session.date ? { date: draft.date } : {}),
              ...(draft.start !== session.start ? { start: draft.start } : {}),
              ...(draft.end !== session.end ? { end: draft.end } : {}),
              ...(teacherId !== session.teacherId ? { teacherId } : {}),
            },
          });
    setBusy(false);
    if (!res.ok) return fail(res.error);
    done(mode === 'makeup' ? s.makeupAdded : s.moved, res.data);
  }

  const timesForm = (submitLabel: string) => (
    <Stack component="form" spacing={3} noValidate onSubmit={(e: FormEvent) => void save(e)}>
      <DateInput
        name="date"
        label={s.date}
        required
        value={draft.date}
        onChange={(v) => setDraft((d) => ({ ...d, date: v }))}
      />
      <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
        <TimeField
          label={s.start}
          name="start"
          value={draft.start}
          onChange={(v) => setDraft((d) => ({ ...d, start: v }))}
        />
        <TimeField
          label={s.end}
          name="end"
          value={draft.end}
          onChange={(v) => setDraft((d) => ({ ...d, end: v }))}
        />
      </Stack>
      {teachers.length > 0 && (
        <SelectInput
          name="teacher"
          label={s.teacher}
          value={draft.teacherId}
          onChange={(v) => setDraft((d) => ({ ...d, teacherId: v }))}
          options={[
            { value: '', label: s.noTeacher },
            ...teachers.map((x) => ({ value: x.id, label: x.fullName })),
          ]}
        />
      )}
      <Stack direction="row" spacing={2}>
        <Button type="submit" loading={busy} disabled={!online}>
          {submitLabel}
        </Button>
        <Button variant="secondary" onClick={() => go('view')}>
          {c.cancel}
        </Button>
      </Stack>
    </Stack>
  );

  return (
    <Sheet open={open} onClose={close} title={title} closeLabel={s.close}>
      <Stack spacing={4}>
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        {warnings.map((w, i) => (
          <InlineAlert key={i} tone="warning">
            {fill(s.doubleBooked, {
              teacher: w.teacherName,
              other: w.otherBatchName,
              start: w.start,
              end: w.end,
            })}
          </InlineAlert>
        ))}
        {mode === 'view' && (
          <>
            <Stack spacing={1}>
              <Text>{timeLabel}</Text>
              <Text tone="secondary">
                {s.status}: {labels.status[session.status]}
              </Text>
              <Text tone="secondary">
                {s.teacher}: {session.teacherName ?? s.noTeacher}
              </Text>
              {session.note && <Text tone="secondary">{session.note}</Text>}
            </Stack>
            {session.holidayName && (
              <InlineAlert tone="info">
                {fill(s.holidayNote, { name: session.holidayName })}
              </InlineAlert>
            )}
            {canManage && started && <InlineAlert tone="info">{s.started}</InlineAlert>}
            {canManage && !started && (
              <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
                {session.status === 'SCHEDULED' && (
                  <>
                    <PlainButton variant="secondary" disabled={!online} onClick={() => go('move')}>
                      {s.move}
                    </PlainButton>
                    <PlainButton variant="ghost" disabled={!online} onClick={() => go('cancel')}>
                      {s.cancel}
                    </PlainButton>
                  </>
                )}
                {session.status === 'CANCELLED' && !session.holidayName && (
                  <PlainButton
                    variant="secondary"
                    disabled={!online || busy}
                    onClick={() => void restore()}
                  >
                    {s.restore}
                  </PlainButton>
                )}
              </Stack>
            )}
            {canManage && session.status === 'CANCELLED' && (
              <PlainButton variant="secondary" disabled={!online} onClick={() => go('makeup')}>
                {s.makeup}
              </PlainButton>
            )}
            <PlainButton variant="ghost" href={`/batches/${session.batchId}?tab=schedule`}>
              {s.openBatch}
            </PlainButton>
          </>
        )}
        {mode === 'cancel' && (
          <Stack
            component="form"
            spacing={3}
            noValidate
            onSubmit={(e: FormEvent) => void cancel(e)}
          >
            <Text variant="section" as="h3">
              {fill(s.cancelTitle, { batch: session.batchName, date: dateLabel })}
            </Text>
            <Text tone="secondary">{s.cancelBody}</Text>
            <SelectInput
              name="reason"
              label={s.reason}
              value={reason}
              onChange={(v) => setReason(v as typeof reason)}
              options={(['TEACHER_UNAVAILABLE', 'OTHER'] as const).map((r) => ({
                value: r,
                label: s.reasons[r],
              }))}
            />
            <TextInput name="note" label={s.note} value={note} onChange={setNote} />
            <Stack direction="row" spacing={2}>
              <Button type="submit" variant="danger" loading={busy} disabled={!online}>
                {s.cancel}
              </Button>
              <Button variant="secondary" onClick={() => go('view')}>
                {c.cancel}
              </Button>
            </Stack>
          </Stack>
        )}
        {mode === 'move' && (
          <>
            <Text variant="section" as="h3">
              {fill(s.moveTitle, { batch: session.batchName })}
            </Text>
            {timesForm(s.save)}
          </>
        )}
        {mode === 'makeup' && (
          <>
            <Text variant="section" as="h3">
              {fill(s.makeupTitle, { batch: session.batchName, date: dateLabel })}
            </Text>
            {timesForm(s.makeup)}
          </>
        )}
      </Stack>
    </Sheet>
  );
}
