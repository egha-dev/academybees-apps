// Loaded lazily by batches-lazy.tsx (no 'use client', C-80).
import type { Batch, Course } from '@academybee/contracts';
import type { Messages } from '@academybee/i18n';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { CheckboxGroup } from '@academybee/ui/components/checkboxes';
import { useToast } from '@academybee/ui/components/feedback';
import { DateInput, SelectInput, TextInput } from '@academybee/ui/components/fields';
import { Stack } from '@academybee/ui/components/layout';
import { ConfirmDialog, Sheet } from '@academybee/ui/components/overlays';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { type PeopleErrorLabels, peopleErrorMessage } from '@/components/people/errors';
import { fill } from '@/components/shell-labels';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

type FormLabels = Messages['scheduling']['batchForm'];
type Common = Messages['people']['form'];
type Labels = { form: FormLabels; common: Common; errors: PeopleErrorLabels };
type TeacherOption = { id: string; fullName: string };
const NEW_COURSE = '__new__';

const capacityOf = (v: string): number | null | 'invalid' => {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 'invalid';
};

/**
 * Add a batch (UX §11.5, §9.2): name, course (or a new one), level, most students a day,
 * optional term dates and its teachers. Opens the workspace's "Days and times" next.
 */
export function AddBatchSheet({
  courses,
  teachers,
  labels,
}: {
  courses: Course[];
  teachers: TeacherOption[];
  labels: Labels;
}) {
  const online = useOnline();
  const [open, setOpen] = useState(true);
  const [key] = useState(() => crypto.randomUUID());
  const f = labels.form;
  const c = labels.common;
  const [draft, setDraft] = useState({
    name: '',
    courseId: courses[0]?.id ?? NEW_COURSE,
    newCourse: '',
    levelId: '',
    capacity: '',
    startsOn: '',
    endsOn: '',
    teacherIds: [] as string[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const course = courses.find((x) => x.id === draft.courseId);
  const set = (k: keyof typeof draft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));

  function close() {
    setOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('add');
    window.history.replaceState(null, '', url);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!draft.name.trim()) local.name = c.required;
    if (draft.courseId === NEW_COURSE && !draft.newCourse.trim()) local.newCourse = c.required;
    const capacity = capacityOf(draft.capacity);
    if (capacity === 'invalid') local.capacity = c.invalid;
    if (draft.startsOn && draft.endsOn && draft.endsOn < draft.startsOn)
      local.endsOn = c.dateInvalid;
    setErrors(local);
    if (Object.keys(local).length) return setError(c.checkFields);
    setBusy(true);
    setError(undefined);
    let courseId = draft.courseId;
    if (courseId === NEW_COURSE) {
      const made = await api<Course>('/courses', {
        method: 'POST',
        headers: { 'Idempotency-Key': `${key}-course` },
        body: { name: draft.newCourse.trim() },
      });
      if (!made.ok) {
        setBusy(false);
        return setError(peopleErrorMessage(made.error, labels.errors));
      }
      courseId = made.data.id;
    }
    const res = await api<Batch>('/batches', {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: {
        name: draft.name.trim(),
        courseId,
        ...(draft.levelId ? { levelId: draft.levelId } : {}),
        capacity: capacity === 'invalid' ? null : capacity,
        ...(draft.startsOn ? { startsOn: draft.startsOn } : {}),
        ...(draft.endsOn ? { endsOn: draft.endsOn } : {}),
        teacherIds: draft.teacherIds,
      },
    });
    setBusy(false);
    if (!res.ok) return setError(peopleErrorMessage(res.error, labels.errors));
    window.location.assign(`/batches/${res.data.id}?tab=schedule&edit=1`);
  }

  return (
    <Sheet open={open} onClose={close} title={f.addTitle} closeLabel={c.close}>
      <Stack component="form" spacing={4} noValidate onSubmit={(e: FormEvent) => void submit(e)}>
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <TextInput
          name="name"
          label={f.name}
          helperText={f.nameHint}
          required
          value={draft.name}
          onChange={set('name')}
          error={errors.name}
        />
        <SelectInput
          name="course"
          label={f.course}
          required
          value={draft.courseId}
          onChange={(v) => setDraft((d) => ({ ...d, courseId: v, levelId: '' }))}
          options={[
            ...courses.map((x) => ({ value: x.id, label: x.name })),
            { value: NEW_COURSE, label: f.newCourse },
          ]}
        />
        {draft.courseId === NEW_COURSE && (
          <TextInput
            name="newCourse"
            label={f.newCourseName}
            required
            value={draft.newCourse}
            onChange={set('newCourse')}
            error={errors.newCourse}
          />
        )}
        {course && course.levels.length > 0 && (
          <SelectInput
            name="level"
            label={f.level}
            value={draft.levelId}
            onChange={set('levelId')}
            options={[
              { value: '', label: f.noLevel },
              ...course.levels.map((l) => ({ value: l.id, label: l.name })),
            ]}
          />
        )}
        <TextInput
          name="capacity"
          label={f.capacity}
          helperText={f.capacityHint}
          inputMode="numeric"
          value={draft.capacity}
          onChange={set('capacity')}
          error={errors.capacity}
        />
        <DateInput
          name="startsOn"
          label={f.startsOn}
          helperText={f.datesHint}
          value={draft.startsOn}
          onChange={set('startsOn')}
        />
        <DateInput
          name="endsOn"
          label={f.endsOn}
          value={draft.endsOn}
          onChange={set('endsOn')}
          error={errors.endsOn}
        />
        {teachers.length > 0 ? (
          <CheckboxGroup
            name="teachers"
            legend={f.teachers}
            helperText={f.teachersHint}
            value={draft.teacherIds}
            onChange={(ids) => setDraft((d) => ({ ...d, teacherIds: ids }))}
            options={teachers.map((x) => ({ value: x.id, label: x.fullName }))}
          />
        ) : (
          <InlineAlert tone="info">{f.noTeachers}</InlineAlert>
        )}
        <Stack direction="row" spacing={2}>
          <Button type="submit" loading={busy} disabled={!online}>
            {f.create}
          </Button>
          <Button variant="secondary" onClick={close}>
            {c.cancel}
          </Button>
        </Stack>
      </Stack>
    </Sheet>
  );
}

/** Edit a batch's details and teachers, or archive / restore it. */
export function BatchActions({
  batch,
  course,
  teachers,
  labels,
}: {
  batch: Batch;
  course: Course | undefined;
  teachers: TeacherOption[];
  labels: Labels;
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const f = labels.form;
  const c = labels.common;
  const [sheet, setSheet] = useState<'edit' | 'archive'>();
  const [draft, setDraft] = useState({
    name: batch.name,
    levelId: batch.levelId ?? '',
    capacity: batch.capacity === null ? '' : String(batch.capacity),
    startsOn: batch.startsOn ?? '',
    endsOn: batch.endsOn ?? '',
    teacherIds: batch.teachers.map((t) => t.teacherId),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof draft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!draft.name.trim()) local.name = c.required;
    const capacity = capacityOf(draft.capacity);
    if (capacity === 'invalid') local.capacity = c.invalid;
    if (draft.startsOn && draft.endsOn && draft.endsOn < draft.startsOn)
      local.endsOn = c.dateInvalid;
    setErrors(local);
    if (Object.keys(local).length) return setError(c.checkFields);
    setBusy(true);
    setError(undefined);
    const res = await api<Batch>(`/batches/${batch.id}`, {
      method: 'PATCH',
      body: {
        version: batch.version,
        name: draft.name.trim(),
        levelId: draft.levelId || null,
        capacity: capacity === 'invalid' ? null : capacity,
        startsOn: draft.startsOn || null,
        endsOn: draft.endsOn || null,
      },
    });
    if (!res.ok) {
      setBusy(false);
      return setError(peopleErrorMessage(res.error, labels.errors));
    }
    const before = batch.teachers.map((t) => t.teacherId).join(',');
    if (draft.teacherIds.join(',') !== before) {
      const t = await api<Batch>(`/batches/${batch.id}/teachers`, {
        method: 'PUT',
        body: {
          version: res.data.version,
          teachers: draft.teacherIds.map((teacherId, i) => ({ teacherId, isPrimary: i === 0 })),
        },
      });
      if (!t.ok) {
        setBusy(false);
        return setError(peopleErrorMessage(t.error, labels.errors));
      }
    }
    setBusy(false);
    setSheet(undefined);
    toast(f.saved);
    router.refresh();
  }

  async function setStatus(status: 'ACTIVE' | 'ARCHIVED') {
    setBusy(true);
    const res = await api<Batch>(`/batches/${batch.id}`, {
      method: 'PATCH',
      body: { version: batch.version, status },
    });
    setBusy(false);
    setSheet(undefined);
    if (!res.ok) return toast(peopleErrorMessage(res.error, labels.errors), 'error');
    toast(status === 'ARCHIVED' ? f.archived : f.restored);
    router.refresh();
  }

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
        <PlainButton variant="secondary" disabled={!online} onClick={() => setSheet('edit')}>
          {f.edit}
        </PlainButton>
        {batch.status === 'ACTIVE' ? (
          <PlainButton variant="ghost" disabled={!online} onClick={() => setSheet('archive')}>
            {f.archive}
          </PlainButton>
        ) : (
          <PlainButton
            variant="ghost"
            disabled={!online || busy}
            onClick={() => void setStatus('ACTIVE')}
          >
            {f.restore}
          </PlainButton>
        )}
      </Stack>
      <Sheet
        open={sheet === 'edit'}
        onClose={() => setSheet(undefined)}
        title={fill(f.editTitle, { name: batch.name })}
        closeLabel={c.close}
      >
        <Stack component="form" spacing={4} noValidate onSubmit={(e: FormEvent) => void save(e)}>
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <TextInput
            name="name"
            label={f.name}
            required
            value={draft.name}
            onChange={set('name')}
            error={errors.name}
          />
          {course && course.levels.length > 0 && (
            <SelectInput
              name="level"
              label={f.level}
              value={draft.levelId}
              onChange={set('levelId')}
              options={[
                { value: '', label: f.noLevel },
                ...course.levels.map((l) => ({ value: l.id, label: l.name })),
              ]}
            />
          )}
          <TextInput
            name="capacity"
            label={f.capacity}
            helperText={f.capacityHint}
            inputMode="numeric"
            value={draft.capacity}
            onChange={set('capacity')}
            error={errors.capacity}
          />
          <DateInput
            name="startsOn"
            label={f.startsOn}
            helperText={f.datesHint}
            value={draft.startsOn}
            onChange={set('startsOn')}
          />
          <DateInput
            name="endsOn"
            label={f.endsOn}
            value={draft.endsOn}
            onChange={set('endsOn')}
            error={errors.endsOn}
          />
          {teachers.length > 0 && (
            <CheckboxGroup
              name="teachers"
              legend={f.teachers}
              helperText={f.teachersHint}
              value={draft.teacherIds}
              onChange={(ids) => setDraft((d) => ({ ...d, teacherIds: ids }))}
              options={teachers.map((x) => ({ value: x.id, label: x.fullName }))}
            />
          )}
          <Stack direction="row" spacing={2}>
            <Button type="submit" loading={busy} disabled={!online}>
              {f.save}
            </Button>
            <Button variant="secondary" onClick={() => setSheet(undefined)}>
              {c.cancel}
            </Button>
          </Stack>
        </Stack>
      </Sheet>
      <ConfirmDialog
        open={sheet === 'archive'}
        title={fill(f.archiveTitle, { name: batch.name })}
        body={f.archiveBody}
        confirmLabel={f.archive}
        cancelLabel={c.cancel}
        tone="danger"
        busy={busy}
        onCancel={() => setSheet(undefined)}
        onConfirm={() => void setStatus('ARCHIVED')}
      />
    </>
  );
}
