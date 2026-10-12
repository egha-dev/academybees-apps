// Loaded lazily by batches-lazy.tsx (no 'use client', C-80).
import type { BatchListItem, CursorPage, Enrolment, StudentListItem } from '@academybee/contracts';
import type { Messages } from '@academybee/i18n';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { CheckboxGroup } from '@academybee/ui/components/checkboxes';
import { useToast } from '@academybee/ui/components/feedback';
import { DateInput, SelectInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Sheet } from '@academybee/ui/components/overlays';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';

import { type PeopleErrorLabels, peopleErrorMessage } from '@/components/people/errors';
import { fill } from '@/components/shell-labels';
import { api, type ApiError } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

type S = Messages['scheduling'];
export type RosterLabels = {
  enrol: S['enrol'];
  changeDays: S['changeDays'];
  leave: S['leave'];
  transfer: S['transfer'];
  roster: S['batch']['roster'];
  weekday: Record<string, string>;
  common: Messages['people']['form'];
  errors: PeopleErrorLabels;
};

const nextDay = (d: string) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};

/** The days of a plan the API refused, from `weekday.N` details. */
const daysIn = (error: ApiError, issue: string, weekday: Record<string, string>) =>
  (error.details ?? [])
    .filter((d) => d.issue === issue && d.path.startsWith('weekday.'))
    .map((d) => weekday[`d${d.path.slice('weekday.'.length)}`] ?? d.path)
    .join(', ');

function DayPlan({
  batchWeekdays,
  value,
  onChange,
  labels,
}: {
  batchWeekdays: number[];
  value: { some: boolean; days: string[] };
  onChange: (v: { some: boolean; days: string[] }) => void;
  labels: RosterLabels;
}) {
  if (batchWeekdays.length <= 1) return null;
  return (
    <Stack spacing={2}>
      <SelectInput
        name="plan"
        label={labels.enrol.days}
        value={value.some ? 'some' : 'all'}
        onChange={(v) => onChange({ ...value, some: v === 'some' })}
        options={[
          { value: 'all', label: labels.enrol.everyDay },
          { value: 'some', label: labels.enrol.someDays },
        ]}
      />
      {value.some && (
        <CheckboxGroup
          name="days"
          legend={labels.enrol.days}
          value={value.days}
          onChange={(days) => onChange({ ...value, days })}
          options={batchWeekdays.map((d) => ({
            value: String(d),
            label: labels.weekday[`d${d}`]!,
          }))}
        />
      )}
    </Stack>
  );
}

/** Add a student to the batch with a day plan (C-120) and a per-day capacity check (C-121). */
export function EnrolStudent({
  batchId,
  batchName,
  batchWeekdays,
  today,
  labels,
}: {
  batchId: string;
  batchName: string;
  batchWeekdays: number[];
  today: string;
  labels: RosterLabels;
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const e = labels.enrol;
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [q, setQ] = useState('');
  const [found, setFound] = useState<StudentListItem[]>([]);
  const [studentId, setStudentId] = useState('');
  const [plan, setPlan] = useState({ some: false, days: [] as string[] });
  const [start, setStart] = useState(today);
  const [error, setError] = useState<string>();
  const [over, setOver] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || q.trim().length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void api<CursorPage<StudentListItem>>(
        `/students?limit=10&q=${encodeURIComponent(q.trim())}`,
      ).then((res) => {
        if (cancelled || !res.ok) return;
        setFound(res.data.items);
        // A choice from an earlier search no longer shown is dropped, never submitted.
        setStudentId((id) => (res.data.items.some((x) => x.id === id) ? id : ''));
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, open]);

  async function submit(ev: FormEvent | null, confirm = false) {
    ev?.preventDefault();
    if (!studentId) return setError(e.chooseStudent);
    if (plan.some && plan.days.length === 0) return setError(e.chooseDays);
    setBusy(true);
    setError(undefined);
    const res = await api<Enrolment>(`/batches/${batchId}/enrolments`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `${key}${confirm ? '-c' : ''}` },
      body: {
        studentId,
        startedOn: start,
        weekdays: plan.some ? plan.days.map(Number) : [],
        confirmOverCapacity: confirm,
      },
    });
    setBusy(false);
    if (!res.ok) {
      const issue = res.error.details?.[0]?.issue;
      if (issue === 'over_capacity')
        return setOver(
          fill(e.overCapacity, { days: daysIn(res.error, 'over_capacity', labels.weekday) }),
        );
      if (issue === 'not_in_schedule')
        return setError(
          fill(e.notInSchedule, { days: daysIn(res.error, 'not_in_schedule', labels.weekday) }),
        );
      if (issue === 'already_enrolled') return setError(e.already);
      return setError(peopleErrorMessage(res.error, labels.errors));
    }
    toast(fill(e.added, { name: res.data.studentName }));
    setOpen(false);
    setOver(undefined);
    setStudentId('');
    setKey(crypto.randomUUID());
    router.refresh();
  }

  return (
    <>
      <PlainButton variant="primary" disabled={!online} onClick={() => setOpen(true)}>
        {labels.roster.enrol}
      </PlainButton>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={fill(e.title, { name: batchName })}
        closeLabel={labels.common.close}
      >
        <Stack
          component="form"
          spacing={4}
          noValidate
          onSubmit={(ev: FormEvent) => void submit(ev)}
        >
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          {over && (
            <InlineAlert tone="warning">
              <Stack spacing={2}>
                <span>{over}</span>
                <Box>
                  <PlainButton variant="secondary" onClick={() => void submit(null, true)}>
                    {e.confirmOver}
                  </PlainButton>
                </Box>
              </Stack>
            </InlineAlert>
          )}
          <Stack spacing={1}>
            <Box
              component="label"
              htmlFor={`enrol-search-${batchId}`}
              sx={{ fontSize: 14, fontWeight: 600 }}
            >
              {e.search}
            </Box>
            <Box
              component="input"
              id={`enrol-search-${batchId}`}
              type="search"
              value={q}
              aria-describedby={`enrol-hint-${batchId}`}
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
            <Text id={`enrol-hint-${batchId}`} variant="meta" tone="secondary">
              {e.searchHint}
            </Text>
          </Stack>
          {q.trim().length >= 2 &&
            (found.length === 0 ? (
              <Text tone="secondary">{e.noMatch}</Text>
            ) : (
              <SelectInput
                name="student"
                label={e.student}
                value={studentId}
                onChange={setStudentId}
                options={[
                  { value: '', label: labels.common.selectNone },
                  ...found.map((s) => ({ value: s.id, label: `${s.fullName} (${s.admissionNo})` })),
                ]}
              />
            ))}
          <DayPlan batchWeekdays={batchWeekdays} value={plan} onChange={setPlan} labels={labels} />
          <DateInput name="start" label={e.start} value={start} onChange={setStart} />
          <Stack direction="row" spacing={2}>
            <Button type="submit" loading={busy} disabled={!online}>
              {e.submit}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {labels.common.cancel}
            </Button>
          </Stack>
        </Stack>
      </Sheet>
    </>
  );
}

/** Change days, leave, or move to another batch, for one student in the roster (G-27). */
export function EnrolmentActions({
  enrolment,
  batchId,
  batchName,
  batchWeekdays,
  today,
  labels,
}: {
  enrolment: Enrolment;
  batchId: string;
  batchName: string;
  batchWeekdays: number[];
  today: string;
  labels: RosterLabels;
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [sheet, setSheet] = useState<'days' | 'leave' | 'move'>();
  const [plan, setPlan] = useState({
    some: enrolment.weekdays.length > 0,
    days: enrolment.weekdays.map(String),
  });
  const [date, setDate] = useState(today);
  const [targets, setTargets] = useState<BatchListItem[]>();
  const [to, setTo] = useState('');
  const [error, setError] = useState<string>();
  const [over, setOver] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const name = enrolment.studentName;

  useEffect(() => {
    if (sheet !== 'move' || targets) return;
    void api<CursorPage<BatchListItem>>('/batches?limit=100').then((res) => {
      const list = res.ok ? res.data.items.filter((b) => b.id !== batchId) : [];
      setTargets(list);
      setTo(list[0]?.id ?? '');
    });
  }, [sheet, targets, batchId]);

  function openSheet(s: 'days' | 'leave' | 'move') {
    setError(undefined);
    setOver(undefined);
    // A move starts tomorrow by default: a student can't leave the day they joined.
    setDate(s === 'move' ? nextDay(today) : today);
    setSheet(s);
  }

  async function run(confirm = false) {
    setBusy(true);
    setError(undefined);
    const weekdays = plan.some ? plan.days.map(Number) : [];
    const res =
      sheet === 'days'
        ? await api<Enrolment>(`/enrolments/${enrolment.id}/days`, {
            method: 'POST',
            headers: { 'Idempotency-Key': `${key}-days${confirm ? '-c' : ''}` },
            body: { from: date, weekdays, confirmOverCapacity: confirm },
          })
        : sheet === 'leave'
          ? await api<Enrolment>(`/enrolments/${enrolment.id}/end`, {
              method: 'POST',
              body: { endedOn: date },
            })
          : await api<Enrolment>(`/students/${enrolment.studentId}/transfer`, {
              method: 'POST',
              headers: { 'Idempotency-Key': `${key}-move${confirm ? '-c' : ''}` },
              body: { fromBatchId: batchId, toBatchId: to, date, confirmOverCapacity: confirm },
            });
    setBusy(false);
    if (!res.ok) {
      const issue = res.error.details?.[0]?.issue;
      if (issue === 'over_capacity')
        return setOver(
          fill(labels.enrol.overCapacity, {
            days: daysIn(res.error, 'over_capacity', labels.weekday),
          }),
        );
      if (issue === 'not_in_schedule')
        return setError(
          fill(labels.enrol.notInSchedule, {
            days: daysIn(res.error, 'not_in_schedule', labels.weekday),
          }),
        );
      if (issue === 'already_enrolled') return setError(labels.transfer.already);
      return setError(peopleErrorMessage(res.error, labels.errors));
    }
    toast(
      sheet === 'days'
        ? labels.changeDays.changed
        : sheet === 'leave'
          ? fill(labels.leave.done, { name })
          : fill(labels.transfer.done, { name }),
    );
    setSheet(undefined);
    router.refresh();
  }

  const title =
    sheet === 'days'
      ? fill(labels.changeDays.title, { name })
      : sheet === 'leave'
        ? fill(labels.leave.title, { name, batch: batchName })
        : fill(labels.transfer.title, { name });

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {batchWeekdays.length > 1 && (
          <PlainButton variant="ghost" disabled={!online} onClick={() => openSheet('days')}>
            {labels.roster.changeDays}
          </PlainButton>
        )}
        <PlainButton variant="ghost" disabled={!online} onClick={() => openSheet('move')}>
          {labels.roster.transfer}
        </PlainButton>
        <PlainButton variant="ghost" disabled={!online} onClick={() => openSheet('leave')}>
          {labels.roster.leave}
        </PlainButton>
      </Box>
      <Sheet
        open={sheet !== undefined}
        onClose={() => setSheet(undefined)}
        title={title}
        closeLabel={labels.common.close}
      >
        <Stack
          component="form"
          spacing={4}
          noValidate
          onSubmit={(ev: FormEvent) => {
            ev.preventDefault();
            void run();
          }}
        >
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          {over && (
            <InlineAlert tone="warning">
              <Stack spacing={2}>
                <span>{over}</span>
                <Box>
                  <PlainButton variant="secondary" onClick={() => void run(true)}>
                    {labels.enrol.confirmOver}
                  </PlainButton>
                </Box>
              </Stack>
            </InlineAlert>
          )}
          {sheet === 'leave' && <Text tone="secondary">{labels.leave.body}</Text>}
          {sheet === 'move' &&
            (targets && targets.length === 0 ? (
              <Text tone="secondary">{labels.transfer.noOther}</Text>
            ) : (
              <SelectInput
                name="to"
                label={labels.transfer.to}
                value={to}
                onChange={setTo}
                options={(targets ?? []).map((b) => ({ value: b.id, label: b.name }))}
              />
            ))}
          {sheet === 'days' && (
            <DayPlan
              batchWeekdays={batchWeekdays}
              value={plan}
              onChange={setPlan}
              labels={labels}
            />
          )}
          <DateInput
            name="date"
            label={
              sheet === 'leave'
                ? labels.leave.last
                : sheet === 'move'
                  ? labels.transfer.date
                  : labels.changeDays.from
            }
            value={date}
            onChange={setDate}
          />
          <Stack direction="row" spacing={2}>
            <Button
              type="submit"
              loading={busy}
              disabled={
                !online ||
                (sheet === 'move' && !to) ||
                (sheet === 'days' && plan.some && plan.days.length === 0)
              }
            >
              {sheet === 'days'
                ? labels.changeDays.submit
                : sheet === 'leave'
                  ? labels.leave.submit
                  : labels.transfer.submit}
            </Button>
            <Button variant="secondary" onClick={() => setSheet(undefined)}>
              {labels.common.cancel}
            </Button>
          </Stack>
        </Stack>
      </Sheet>
    </>
  );
}
