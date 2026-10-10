// Loaded lazily by students-lazy.tsx (no 'use client', C-80).
import type { CustomField, Student } from '@academybee/contracts';
import type { Messages } from '@academybee/i18n';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { CheckboxGroup } from '@academybee/ui/components/checkboxes';
import { useToast } from '@academybee/ui/components/feedback';
import { SelectInput, TextAreaInput, TextInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { ConfirmDialog, Sheet } from '@academybee/ui/components/overlays';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { fill } from '@/components/shell-labels';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { fieldErrors, type PeopleErrorLabels, peopleErrorMessage, REFRESH_AFTER } from './errors';
import {
  checkDraft,
  cleanPhone,
  draftFrom,
  issueMessage,
  PHONE_PATTERN,
  profileBody,
  type StudentDraft,
  StudentFields,
} from './student-fields';

type Status = Student['status'];
type Sheets = 'edit' | 'status' | 'archive' | 'restore' | 'parent' | undefined;

export type StudentActionsLabels = {
  actions: Messages['people']['actions'];
  edit: Messages['people']['edit'];
  statusChange: Messages['people']['statusChange'];
  archive: Messages['people']['archive'];
  status: Messages['people']['status'];
  form: Messages['people']['form'];
  gender: Messages['people']['gender'];
  relationship: Messages['people']['relationship'];
  parents: Messages['people']['parents'];
  add: Messages['people']['add'];
  undo: string;
  undone: string;
  undoFailed: string;
  errors: PeopleErrorLabels;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Student 360 actions (UX §10 "what can I do now"): edit, change status (G-27, with its
 * consequence and a reason), archive / restore (G-26) and add a parent. Status, archive and the
 * parent unlink offer Undo for 8 seconds (C-108). Every write sends the student's `version`.
 * Online only (CLAUDE.md §11).
 */
export function StudentActions({
  student,
  draft: source,
  can,
  consequence,
  labels,
  fieldsPath,
}: {
  student: {
    id: string;
    fullName: string;
    status: Status;
    version: number;
    archived: boolean;
    restoreOpen: boolean;
  };
  draft: Student;
  can: { update: boolean; archive: boolean; parents: boolean };
  /** "They stay in their class…" — pluralised on the server. */
  consequence: string;
  labels: StudentActionsLabels;
  fieldsPath: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [sheet, setSheet] = useState<Sheets>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<CustomField[]>([]);
  const [draft, setDraft] = useState<StudentDraft>(() => draftFrom(source));
  const [nextStatus, setNextStatus] = useState<Status | ''>('');
  const [reason, setReason] = useState('');
  const [parent, setParent] = useState({
    name: '',
    phone: '',
    email: '',
    relationship: 'MOTHER',
    flags: [] as string[],
  });
  const [key, setKey] = useState('');
  const f = labels.form;

  async function open(which: Exclude<Sheets, undefined>) {
    setError(undefined);
    setErrors({});
    setKey(crypto.randomUUID());
    if (which === 'edit') {
      setDraft(draftFrom(source));
      const res = await api<{ items: CustomField[] }>(fieldsPath);
      if (res.ok) setFields(res.data.items);
    }
    if (which === 'status') {
      setNextStatus('');
      setReason('');
    }
    if (which === 'parent')
      setParent({ name: '', phone: '', email: '', relationship: 'MOTHER', flags: [] });
    setSheet(which);
  }

  function failed(res: { error: Parameters<typeof peopleErrorMessage>[0] }) {
    setBusy(false);
    const issues = fieldErrors(res.error);
    if (Object.keys(issues).length) {
      setErrors(
        Object.fromEntries(Object.entries(issues).map(([k, v]) => [k, issueMessage(v, f)!])),
      );
      setError(f.checkFields);
      return;
    }
    const message = peopleErrorMessage(res.error, labels.errors);
    setError(message);
    // Confirm dialogs have no room for an inline message: say it in a toast.
    if (sheet === 'archive' || sheet === 'restore') {
      toast(message, 'error');
      setSheet(undefined);
    }
    if (REFRESH_AFTER.has(res.error.code)) router.refresh();
  }

  function done(message: string, undo?: () => Promise<boolean>) {
    setBusy(false);
    setSheet(undefined);
    toast(
      message,
      'success',
      undo
        ? {
            label: labels.undo,
            onClick: () =>
              void undo().then((ok) => {
                toast(ok ? labels.undone : labels.undoFailed, ok ? 'success' : 'error');
                router.refresh();
              }),
          }
        : undefined,
    );
    router.refresh();
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    const local = checkDraft(draft, fields, f, true);
    setErrors(local);
    if (Object.keys(local).length) return setError(f.checkFields);
    setBusy(true);
    const res = await api<Student>(`/students/${student.id}`, {
      method: 'PATCH',
      body: { version: student.version, ...profileBody(draft, fields, true) },
    });
    if (!res.ok) return failed(res);
    done(labels.edit.saved);
  }

  async function changeStatus(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!nextStatus) local.status = labels.statusChange.same;
    if (!reason.trim()) local.reason = f.required;
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    const previous = student.status;
    const res = await api<Student>(`/students/${student.id}/status`, {
      method: 'POST',
      body: { version: student.version, status: nextStatus, reason },
    });
    if (!res.ok) return failed(res);
    const changed = res.data;
    done(
      fill(labels.statusChange.changed, {
        name: student.fullName,
        status: labels.status[changed.status],
      }),
      async () => {
        const back = await api(`/students/${student.id}/status`, {
          method: 'POST',
          body: { version: changed.version, status: previous, reason: labels.undo },
        });
        return back.ok;
      },
    );
  }

  async function archive() {
    setBusy(true);
    const res = await api<Student>(`/students/${student.id}/archive`, {
      method: 'POST',
      body: { version: student.version },
    });
    if (!res.ok) return failed(res);
    const archived = res.data;
    done(fill(labels.archive.archived, { name: student.fullName }), async () => {
      const back = await api(`/students/${student.id}/restore`, {
        method: 'POST',
        body: { version: archived.version },
      });
      return back.ok;
    });
  }

  async function restore() {
    setBusy(true);
    const res = await api<Student>(`/students/${student.id}/restore`, {
      method: 'POST',
      body: { version: student.version },
    });
    if (!res.ok) return failed(res);
    done(fill(labels.archive.restored, { name: student.fullName }));
  }

  async function addParent(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!parent.name.trim()) local['parent.fullName'] = f.required;
    if (parent.phone && !PHONE_PATTERN.test(cleanPhone(parent.phone)))
      local['parent.phone'] = f.phoneInvalid;
    if (parent.email && !EMAIL.test(parent.email.trim())) local['parent.email'] = f.emailInvalid;
    setErrors(local);
    if (Object.keys(local).length) return setError(f.checkFields);
    setBusy(true);
    const res = await api<Student>(`/students/${student.id}/parents`, {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: {
        relationship: parent.relationship,
        isPrimaryContact: parent.flags.includes('primary'),
        pickupAuthorised: parent.flags.includes('pickup'),
        parent: {
          fullName: parent.name,
          ...(parent.phone ? { phone: cleanPhone(parent.phone) } : {}),
          ...(parent.email ? { email: parent.email.trim() } : {}),
        },
      },
    });
    if (!res.ok) return failed(res);
    done(fill(labels.parents.added, { name: parent.name }));
  }

  const statusOptions = [
    { value: '', label: labels.statusChange.to },
    ...(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'LEFT'] as const)
      .filter((s) => s !== student.status)
      .map((s) => ({ value: s, label: labels.status[s] })),
  ];
  const relationshipOptions = (
    Object.keys(labels.relationship) as Array<keyof typeof labels.relationship>
  ).map((r) => ({ value: r, label: labels.relationship[r] }));
  const actions = (
    <Box
      role="group"
      aria-label={labels.actions.label}
      sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}
    >
      {can.update && (
        <PlainButton onClick={() => void open('edit')} disabled={!online}>
          {labels.actions.edit}
        </PlainButton>
      )}
      {can.parents && (
        <PlainButton onClick={() => void open('parent')} disabled={!online}>
          {labels.actions.addParent}
        </PlainButton>
      )}
      {can.update && (
        <PlainButton onClick={() => void open('status')} disabled={!online}>
          {labels.actions.status}
        </PlainButton>
      )}
      {can.archive && !student.archived && (
        <PlainButton variant="ghost" onClick={() => void open('archive')} disabled={!online}>
          {labels.actions.archive}
        </PlainButton>
      )}
      {can.archive && student.archived && student.restoreOpen && (
        <PlainButton variant="primary" onClick={() => void open('restore')} disabled={!online}>
          {labels.actions.restore}
        </PlainButton>
      )}
    </Box>
  );
  const footer = (submit: string) => (
    <Stack direction="row" spacing={2}>
      <Button type="submit" loading={busy} disabled={!online}>
        {submit}
      </Button>
      <Button variant="secondary" onClick={() => setSheet(undefined)}>
        {f.cancel}
      </Button>
    </Stack>
  );

  return (
    <>
      {actions}
      {!online && (
        <Text variant="meta" tone="secondary">
          {f.offline}
        </Text>
      )}

      <Sheet
        open={sheet === 'edit'}
        onClose={() => setSheet(undefined)}
        title={fill(labels.edit.title, { name: student.fullName })}
        closeLabel={f.close}
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
            label={f.fullName}
            required
            value={draft.fullName}
            onChange={(fullName) => setDraft((d) => ({ ...d, fullName }))}
            error={errors.fullName}
          />
          <StudentFields
            draft={draft}
            onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            errors={errors}
            fields={fields}
            labels={f}
            genderLabels={labels.gender}
            full
            today={new Date().toISOString().slice(0, 10)}
          />
          {footer(labels.edit.submit)}
        </Stack>
      </Sheet>

      <Sheet
        open={sheet === 'status'}
        onClose={() => setSheet(undefined)}
        title={labels.statusChange.title}
        closeLabel={f.close}
      >
        <Stack
          component="form"
          spacing={4}
          noValidate
          onSubmit={(e: FormEvent) => void changeStatus(e)}
        >
          <Text tone="secondary">{fill(labels.statusChange.body, { name: student.fullName })}</Text>
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <SelectInput
            name="status"
            label={labels.statusChange.to}
            required
            value={nextStatus}
            onChange={(v) => setNextStatus(v as Status | '')}
            options={statusOptions}
            error={errors.status}
          />
          {nextStatus && nextStatus !== 'ACTIVE' && (
            <InlineAlert tone="info">
              {consequence} {labels.statusChange.consequenceFees}
            </InlineAlert>
          )}
          <TextAreaInput
            name="reason"
            label={labels.statusChange.reason}
            helperText={labels.statusChange.reasonHint}
            required
            rows={2}
            maxLength={300}
            value={reason}
            onChange={setReason}
            error={errors.reason}
          />
          {footer(labels.statusChange.submit)}
        </Stack>
      </Sheet>

      <Sheet
        open={sheet === 'parent'}
        onClose={() => setSheet(undefined)}
        title={labels.parents.addTitle}
        closeLabel={f.close}
      >
        <Stack
          component="form"
          spacing={4}
          noValidate
          onSubmit={(e: FormEvent) => void addParent(e)}
        >
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <TextInput
            name="parentName"
            label={labels.add.parentName}
            required
            value={parent.name}
            onChange={(name) => setParent((p) => ({ ...p, name }))}
            error={errors['parent.fullName']}
          />
          <TextInput
            name="parentPhone"
            label={labels.add.parentPhone}
            type="tel"
            inputMode="tel"
            value={parent.phone}
            onChange={(phone) => setParent((p) => ({ ...p, phone }))}
            error={errors['parent.phone']}
          />
          <TextInput
            name="parentEmail"
            label={labels.add.parentEmail}
            type="email"
            inputMode="email"
            value={parent.email}
            onChange={(email) => setParent((p) => ({ ...p, email }))}
            error={errors['parent.email']}
          />
          <SelectInput
            name="relationship"
            label={labels.add.relationship}
            value={parent.relationship}
            onChange={(relationship) => setParent((p) => ({ ...p, relationship }))}
            options={relationshipOptions}
          />
          <CheckboxGroup
            name="flags"
            legend={labels.parents.flags}
            helperText={labels.parents.primaryHint}
            value={parent.flags}
            onChange={(flags) => setParent((p) => ({ ...p, flags }))}
            options={[
              { value: 'primary', label: labels.parents.primaryField },
              { value: 'pickup', label: labels.parents.pickupField },
            ]}
          />
          {footer(labels.parents.addSubmit)}
        </Stack>
      </Sheet>

      <ConfirmDialog
        open={sheet === 'archive'}
        title={fill(labels.archive.title, { name: student.fullName })}
        body={labels.archive.body}
        confirmLabel={labels.archive.confirm}
        cancelLabel={f.cancel}
        tone="danger"
        busy={busy}
        onCancel={() => setSheet(undefined)}
        onConfirm={() => void archive()}
      />
      <ConfirmDialog
        open={sheet === 'restore'}
        title={fill(labels.archive.restoreTitle, { name: student.fullName })}
        body={labels.archive.restoreBody}
        confirmLabel={labels.archive.restoreConfirm}
        cancelLabel={f.cancel}
        busy={busy}
        onCancel={() => setSheet(undefined)}
        onConfirm={() => void restore()}
      />
    </>
  );
}
