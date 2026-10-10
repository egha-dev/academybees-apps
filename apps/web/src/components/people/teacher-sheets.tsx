// Loaded lazily by teachers-lazy.tsx (no 'use client', C-80).
import type { Teacher } from '@academybee/contracts';
import type { Messages } from '@academybee/i18n';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { useToast } from '@academybee/ui/components/feedback';
import { SelectInput, TextInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { ConfirmDialog, Sheet } from '@academybee/ui/components/overlays';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { fill } from '@/components/shell-labels';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { fieldErrors, type PeopleErrorLabels, peopleErrorMessage } from './errors';
import { cleanPhone, PHONE_PATTERN } from './student-fields';

type FormLabels = Messages['people']['teachers']['form'];
type Common = Messages['people']['form'];
type Mode = 'name' | 'invite' | 'member';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const subjectsOf = (v: string) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Add Teacher: just a name, an email invitation to sign in as a teacher (C-67), or someone already
 * on the team. One Idempotency-Key per opened sheet.
 */
export function AddTeacherSheet({
  members,
  labels,
}: {
  members: Array<{ membershipId: string; name: string; email: string | null }>;
  labels: { form: FormLabels; common: Common; errors: PeopleErrorLabels };
}) {
  const online = useOnline();
  const [open, setOpen] = useState(true);
  const [key] = useState(() => crypto.randomUUID());
  const [mode, setMode] = useState<Mode>('name');
  const [draft, setDraft] = useState({
    fullName: '',
    email: '',
    phone: '',
    subjects: '',
    membershipId: members[0]?.membershipId ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const f = labels.form;
  const c = labels.common;

  function close() {
    setOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('add');
    window.history.replaceState(null, '', url);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (mode !== 'member' && !draft.fullName.trim()) local.fullName = c.required;
    if (mode === 'invite' && !EMAIL.test(draft.email.trim())) local.email = c.emailInvalid;
    if (draft.phone && !PHONE_PATTERN.test(cleanPhone(draft.phone))) local.phone = c.phoneInvalid;
    if (mode === 'member' && !draft.membershipId) local.membershipId = f.noMembers;
    setErrors(local);
    if (Object.keys(local).length) return setError(c.checkFields);
    setBusy(true);
    setError(undefined);
    const res = await api<Teacher>('/teachers', {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: {
        mode,
        ...(mode !== 'member'
          ? { fullName: draft.fullName }
          : { membershipId: draft.membershipId }),
        ...(mode === 'invite' ? { email: draft.email.trim() } : {}),
        ...(draft.phone ? { phone: cleanPhone(draft.phone) } : {}),
        subjects: subjectsOf(draft.subjects),
      },
    });
    if (res.ok) {
      window.location.assign(`/teachers/${res.data.id}`);
      return;
    }
    setBusy(false);
    const issue = res.error.details?.[0]?.issue;
    if (issue === 'already_member') return setError(f.alreadyMember);
    if (issue === 'already_teacher') return setError(f.alreadyTeacher);
    const issues = fieldErrors(res.error);
    if (Object.keys(issues).length) {
      setErrors(Object.fromEntries(Object.keys(issues).map((k) => [k, c.invalid])));
      return setError(c.checkFields);
    }
    setError(peopleErrorMessage(res.error, labels.errors));
  }

  return (
    <Sheet open={open} onClose={close} title={f.title} closeLabel={c.close}>
      <Stack component="form" spacing={4} noValidate onSubmit={(e: FormEvent) => void submit(e)}>
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <SelectInput
          name="mode"
          label={f.mode}
          value={mode}
          onChange={(v) => setMode(v as Mode)}
          options={(['name', 'invite', 'member'] as const).map((m) => ({
            value: m,
            label: f.modes[m],
          }))}
        />
        {mode === 'member' ? (
          members.length === 0 ? (
            <Text tone="secondary">{f.noMembers}</Text>
          ) : (
            <SelectInput
              name="membershipId"
              label={f.member}
              value={draft.membershipId}
              onChange={(membershipId) => setDraft((d) => ({ ...d, membershipId }))}
              options={members.map((m) => ({
                value: m.membershipId,
                label: m.email ? `${m.name} · ${m.email}` : m.name,
              }))}
              error={errors.membershipId}
            />
          )
        ) : (
          <TextInput
            name="fullName"
            label={f.fullName}
            required
            value={draft.fullName}
            onChange={(fullName) => setDraft((d) => ({ ...d, fullName }))}
            error={errors.fullName}
          />
        )}
        {mode === 'invite' && (
          <TextInput
            name="email"
            label={f.email}
            type="email"
            inputMode="email"
            required
            value={draft.email}
            onChange={(email) => setDraft((d) => ({ ...d, email }))}
            error={errors.email}
          />
        )}
        <TextInput
          name="phone"
          label={f.phone}
          type="tel"
          inputMode="tel"
          value={draft.phone}
          onChange={(phone) => setDraft((d) => ({ ...d, phone }))}
          error={errors.phone}
        />
        <TextInput
          name="subjects"
          label={f.subjects}
          helperText={f.subjectsHint}
          value={draft.subjects}
          onChange={(subjects) => setDraft((d) => ({ ...d, subjects }))}
        />
        {!online && <Text tone="secondary">{c.offline}</Text>}
        <Stack direction="row" spacing={2}>
          <Button type="submit" loading={busy} disabled={!online}>
            {busy ? f.saving : f.submit}
          </Button>
          <Button variant="secondary" onClick={close}>
            {c.cancel}
          </Button>
        </Stack>
      </Stack>
    </Sheet>
  );
}

/** Edit a teacher's details, archive or restore them (history kept, ADR-025). */
export function TeacherActions({
  teacher,
  labels,
}: {
  teacher: Teacher;
  labels: {
    actions: Messages['people']['teachers']['actions'];
    edit: Messages['people']['teachers']['edit'];
    archive: Messages['people']['teachers']['archive'];
    form: FormLabels;
    common: Common;
    errors: PeopleErrorLabels;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [sheet, setSheet] = useState<'edit' | 'archive'>();
  const [draft, setDraft] = useState({ fullName: '', phone: '', subjects: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const c = labels.common;
  const archived = teacher.status === 'ARCHIVED';

  async function patch(body: Record<string, unknown>, message: string) {
    setBusy(true);
    setError(undefined);
    const res = await api<Teacher>(`/teachers/${teacher.id}`, {
      method: 'PATCH',
      body: { version: teacher.version, ...body },
    });
    setBusy(false);
    if (!res.ok) {
      const text = peopleErrorMessage(res.error, labels.errors);
      if (sheet === 'edit') setError(text);
      else toast(text, 'error');
      if (res.error.code === 'VERSION_CONFLICT') router.refresh();
      return;
    }
    setSheet(undefined);
    toast(message);
    router.refresh();
  }

  function openEdit() {
    setDraft({
      fullName: teacher.fullName,
      phone: teacher.phone ?? '',
      subjects: teacher.subjects.join(', '),
    });
    setErrors({});
    setError(undefined);
    setSheet('edit');
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!draft.fullName.trim()) local.fullName = c.required;
    if (draft.phone && !PHONE_PATTERN.test(cleanPhone(draft.phone))) local.phone = c.phoneInvalid;
    setErrors(local);
    if (Object.keys(local).length) return setError(c.checkFields);
    await patch(
      {
        fullName: draft.fullName,
        phone: draft.phone ? cleanPhone(draft.phone) : null,
        subjects: subjectsOf(draft.subjects),
      },
      labels.edit.saved,
    );
  }

  return (
    <>
      <Box
        role="group"
        aria-label={labels.actions.label}
        sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}
      >
        {!archived && (
          <PlainButton onClick={openEdit} disabled={!online}>
            {labels.actions.edit}
          </PlainButton>
        )}
        {archived ? (
          <PlainButton
            variant="primary"
            disabled={!online || busy}
            onClick={() =>
              void patch(
                { status: 'ACTIVE' },
                fill(labels.archive.restored, { name: teacher.fullName }),
              )
            }
          >
            {labels.actions.restore}
          </PlainButton>
        ) : (
          <PlainButton variant="ghost" onClick={() => setSheet('archive')} disabled={!online}>
            {labels.actions.archive}
          </PlainButton>
        )}
      </Box>
      <Sheet
        open={sheet === 'edit'}
        onClose={() => setSheet(undefined)}
        title={fill(labels.edit.title, { name: teacher.fullName })}
        closeLabel={c.close}
      >
        <Stack
          component="form"
          spacing={4}
          noValidate
          onSubmit={(e: FormEvent) => void saveEdit(e)}
        >
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <TextInput
            name="fullName"
            label={labels.form.fullName}
            required
            value={draft.fullName}
            onChange={(fullName) => setDraft((d) => ({ ...d, fullName }))}
            error={errors.fullName}
          />
          <TextInput
            name="phone"
            label={labels.form.phone}
            type="tel"
            inputMode="tel"
            value={draft.phone}
            onChange={(phone) => setDraft((d) => ({ ...d, phone }))}
            error={errors.phone}
          />
          <TextInput
            name="subjects"
            label={labels.form.subjects}
            helperText={labels.form.subjectsHint}
            value={draft.subjects}
            onChange={(subjects) => setDraft((d) => ({ ...d, subjects }))}
          />
          <Stack direction="row" spacing={2}>
            <Button type="submit" loading={busy} disabled={!online}>
              {labels.edit.submit}
            </Button>
            <Button variant="secondary" onClick={() => setSheet(undefined)}>
              {c.cancel}
            </Button>
          </Stack>
        </Stack>
      </Sheet>
      <ConfirmDialog
        open={sheet === 'archive'}
        title={fill(labels.archive.title, { name: teacher.fullName })}
        body={labels.archive.body}
        confirmLabel={labels.archive.confirm}
        cancelLabel={c.cancel}
        tone="danger"
        busy={busy}
        onCancel={() => setSheet(undefined)}
        onConfirm={() =>
          void patch(
            { status: 'ARCHIVED' },
            fill(labels.archive.archived, { name: teacher.fullName }),
          )
        }
      />
    </>
  );
}
