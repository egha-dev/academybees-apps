// Loaded lazily by students-lazy.tsx (no 'use client', C-80).
import type { CustomField, Student } from '@academybee/contracts';
import type { Messages } from '@academybee/i18n';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { SelectInput, TextInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Sheet } from '@academybee/ui/components/overlays';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { type FormEvent, useEffect, useState } from 'react';

import { fill } from '@/components/shell-labels';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { fieldErrors, peopleErrorMessage } from './errors';
import {
  checkDraft,
  cleanPhone,
  emptyDraft,
  issueMessage,
  PHONE_PATTERN,
  profileBody,
  StudentFields,
} from './student-fields';

export type AddStudentLabels = {
  add: Messages['people']['add'];
  form: Messages['people']['form'];
  gender: Messages['people']['gender'];
  relationship: Messages['people']['relationship'];
  duplicates: Messages['people']['duplicates'];
  errors: Messages['people']['errors'];
};

type Duplicate = { id: string; fullName: string; childrenCount: number };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Add Student (UX §11.3): only the name is needed; a parent can be added at the same time, and a
 * parent who is already at the academy (same phone or email) is offered instead of a duplicate
 * (C-106). One Idempotency-Key per opened sheet, so a double tap never adds the student twice.
 */
export function AddStudentSheet({
  fields,
  today,
  canAddParent,
  labels,
}: {
  fields: CustomField[];
  today: string;
  canAddParent: boolean;
  labels: AddStudentLabels;
}) {
  const online = useOnline();
  const [open, setOpen] = useState(true);
  const [key] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState(() => emptyDraft(today));
  const [more, setMore] = useState(fields.some((f) => f.required && !f.archived));
  const [parent, setParent] = useState({ name: '', phone: '', email: '', relationship: 'MOTHER' });
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const [useExisting, setUseExisting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const t = labels.add;
  const f = labels.form;

  function close() {
    setOpen(false);
    // Leave `?add=1` so a reload doesn't reopen the sheet.
    const url = new URL(window.location.href);
    url.searchParams.delete('add');
    window.history.replaceState(null, '', url);
  }

  // Once a full phone number or email is typed, look for the same parent at the academy.
  useEffect(() => {
    const phone = cleanPhone(parent.phone);
    const query = PHONE_PATTERN.test(phone)
      ? `phone=${encodeURIComponent(phone)}`
      : EMAIL.test(parent.email.trim())
        ? `email=${encodeURIComponent(parent.email.trim())}`
        : '';
    if (!query || useExisting) return;
    let cancelled = false;
    const run = async () => {
      const res = await api<{ items: Duplicate[] }>(`/parents/duplicates?${query}`);
      if (!cancelled) setDuplicate(res.ok ? (res.data.items[0] ?? null) : null);
    };
    const timer = setTimeout(() => void run(), 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [parent.phone, parent.email, useExisting]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local = checkDraft(draft, fields, f, false);
    const hasParent = Boolean(parent.name.trim() || parent.phone.trim() || parent.email.trim());
    if (hasParent && !useExisting) {
      if (!parent.name.trim()) local['parent.parent.fullName'] = f.required;
      if (parent.phone && !PHONE_PATTERN.test(cleanPhone(parent.phone)))
        local['parent.parent.phone'] = f.phoneInvalid;
      if (parent.email && !EMAIL.test(parent.email.trim()))
        local['parent.parent.email'] = f.emailInvalid;
    }
    setErrors(local);
    if (Object.keys(local).length) {
      setError(f.checkFields);
      return;
    }
    setBusy(true);
    setError(undefined);
    const body = {
      ...profileBody(draft, fields, false),
      ...(useExisting && duplicate
        ? { parent: { parentId: duplicate.id, relationship: parent.relationship } }
        : hasParent
          ? {
              parent: {
                relationship: parent.relationship,
                parent: {
                  fullName: parent.name,
                  ...(parent.phone ? { phone: cleanPhone(parent.phone) } : {}),
                  ...(parent.email ? { email: parent.email.trim() } : {}),
                },
              },
            }
          : {}),
    };
    const res = await api<Student>('/students', {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': key },
    });
    if (res.ok) {
      // Straight to Student 360, where parents, notes and the rest are added.
      window.location.assign(`/students/${res.data.id}`);
      return;
    }
    setBusy(false);
    const issues = fieldErrors(res.error);
    if (Object.keys(issues).length) {
      setErrors(
        Object.fromEntries(Object.entries(issues).map(([k, v]) => [k, issueMessage(v, f)!])),
      );
      setError(f.checkFields);
    } else {
      setError(peopleErrorMessage(res.error, { ...labels.errors, offline: f.offline }));
    }
  }

  return (
    <Sheet open={open} onClose={close} title={t.title} closeLabel={f.close}>
      <Stack component="form" spacing={4} noValidate onSubmit={(e: FormEvent) => void submit(e)}>
        <Text tone="secondary">{t.body}</Text>
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <TextInput
          name="fullName"
          label={f.fullName}
          required
          value={draft.fullName}
          onChange={(fullName) => setDraft((d) => ({ ...d, fullName }))}
          error={errors.fullName}
        />
        {canAddParent && (
          <Stack component="fieldset" spacing={3} sx={{ border: 0, padding: 0, margin: 0 }}>
            <Text variant="section" as="legend">
              {t.parentHeading}
            </Text>
            {!useExisting && (
              <>
                <TextInput
                  name="parentName"
                  label={t.parentName}
                  value={parent.name}
                  onChange={(name) => setParent((p) => ({ ...p, name }))}
                  error={errors['parent.parent.fullName']}
                />
                <TextInput
                  name="parentPhone"
                  label={t.parentPhone}
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={parent.phone}
                  onChange={(phone) => setParent((p) => ({ ...p, phone }))}
                  error={errors['parent.parent.phone']}
                />
                <TextInput
                  name="parentEmail"
                  label={t.parentEmail}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={parent.email}
                  onChange={(email) => setParent((p) => ({ ...p, email }))}
                  error={errors['parent.parent.email']}
                />
              </>
            )}
            {duplicate && (
              <Stack
                spacing={2}
                role="status"
                aria-label={labels.duplicates.title}
                sx={{ padding: 3, borderRadius: 2, border: '1px solid', borderColor: 'ab.border' }}
              >
                <Text variant="bodySmall">
                  {fill(labels.duplicates.body, {
                    name: duplicate.fullName,
                    count: String(duplicate.childrenCount),
                  })}
                </Text>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <PlainButton
                    variant={useExisting ? 'primary' : 'secondary'}
                    onClick={() => setUseExisting(true)}
                  >
                    {fill(labels.duplicates.useExisting, { name: duplicate.fullName })}
                  </PlainButton>
                  <PlainButton
                    variant={useExisting ? 'secondary' : 'primary'}
                    onClick={() => setUseExisting(false)}
                  >
                    {labels.duplicates.createNew}
                  </PlainButton>
                </Box>
              </Stack>
            )}
            <SelectInput
              name="relationship"
              label={t.relationship}
              value={parent.relationship}
              onChange={(relationship) => setParent((p) => ({ ...p, relationship }))}
              options={(
                Object.keys(labels.relationship) as Array<keyof typeof labels.relationship>
              ).map((r) => ({ value: r, label: labels.relationship[r] }))}
            />
          </Stack>
        )}
        {more ? (
          <StudentFields
            draft={draft}
            onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            errors={errors}
            fields={fields}
            labels={f}
            genderLabels={labels.gender}
            full={false}
            today={today}
          />
        ) : (
          <Box>
            <PlainButton variant="ghost" onClick={() => setMore(true)}>
              {t.moreDetails}
            </PlainButton>
          </Box>
        )}
        {!online && <Text tone="secondary">{f.offline}</Text>}
        <Stack direction="row" spacing={2}>
          <Button type="submit" loading={busy} disabled={!online}>
            {busy ? t.saving : t.submit}
          </Button>
          <Button variant="secondary" onClick={close}>
            {f.cancel}
          </Button>
        </Stack>
      </Stack>
    </Sheet>
  );
}
