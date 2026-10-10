// Loaded lazily by join-requests-lazy.tsx (no 'use client', C-80).
import type { CursorPage, JoinRequest, StudentListItem } from '@academybee/contracts';
import type { Messages } from '@academybee/i18n';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { CheckboxGroup } from '@academybee/ui/components/checkboxes';
import { useToast } from '@academybee/ui/components/feedback';
import { SelectInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { ConfirmDialog, Sheet } from '@academybee/ui/components/overlays';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';

import { fill } from '@/components/shell-labels';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { type PeopleErrorLabels, peopleErrorMessage } from './errors';

/**
 * Approve a join request by choosing the child (or children) and the parent record — an existing
 * one with the same phone/email (C-106) or a new one — or reject it (G-31 §3). The parent still
 * consents in the Family Hub before they see anything (C-102).
 */
export function JoinRequestActions({
  request,
  labels,
}: {
  request: JoinRequest;
  labels: {
    join: Messages['people']['joinRequests'];
    relationship: Messages['people']['relationship'];
    form: Messages['people']['form'];
    status: Messages['people']['status'];
    errors: PeopleErrorLabels;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const t = labels.join;
  const [sheet, setSheet] = useState<'approve' | 'reject'>();
  const [q, setQ] = useState(request.childName);
  const [found, setFound] = useState<StudentListItem[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [parentId, setParentId] = useState<string>(request.matches[0]?.id ?? '');
  const [relationship, setRelationship] = useState('GUARDIAN');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sheet !== 'approve' || q.trim().length < 2) return;
    let cancelled = false;
    const run = async () => {
      const res = await api<CursorPage<StudentListItem>>(
        `/students?limit=10&q=${encodeURIComponent(q.trim())}`,
      );
      if (!cancelled && res.ok) setFound(res.data.items);
    };
    const timer = setTimeout(() => void run(), 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, sheet]);

  async function approve(e: FormEvent) {
    e.preventDefault();
    if (chosen.length === 0) return setError(t.chooseStudent);
    setBusy(true);
    setError(undefined);
    const res = await api(`/join-requests/${request.id}/approve`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `${request.id}-approve` },
      body: { studentIds: chosen, relationship, ...(parentId ? { parentId } : {}) },
    });
    setBusy(false);
    if (!res.ok) return setError(peopleErrorMessage(res.error, labels.errors));
    setSheet(undefined);
    toast(fill(t.approved, { name: request.parentName }));
    router.refresh();
  }

  async function reject() {
    setBusy(true);
    const res = await api(`/join-requests/${request.id}/reject`, { method: 'POST', body: {} });
    setBusy(false);
    setSheet(undefined);
    if (!res.ok) return toast(peopleErrorMessage(res.error, labels.errors), 'error');
    toast(t.rejected);
    router.refresh();
  }

  const studentOptions = found.map((s) => ({
    value: s.id,
    label: s.fullName,
    hint: s.admissionNo,
  }));

  return (
    <>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <PlainButton variant="primary" disabled={!online} onClick={() => setSheet('approve')}>
          {t.approve}
        </PlainButton>
        <PlainButton variant="ghost" disabled={!online} onClick={() => setSheet('reject')}>
          {t.reject}
        </PlainButton>
      </Box>
      <Sheet
        open={sheet === 'approve'}
        onClose={() => setSheet(undefined)}
        title={fill(t.approveTitle, { name: request.parentName })}
        closeLabel={labels.form.close}
      >
        <Stack component="form" spacing={4} noValidate onSubmit={(e: FormEvent) => void approve(e)}>
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <Stack spacing={1}>
            <Box
              component="label"
              htmlFor={`jr-search-${request.id}`}
              sx={{ fontSize: 14, fontWeight: 600 }}
            >
              {t.search}
            </Box>
            <Box
              component="input"
              id={`jr-search-${request.id}`}
              type="search"
              value={q}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
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
          </Stack>
          {studentOptions.length === 0 ? (
            <Text tone="secondary">{t.noMatch}</Text>
          ) : (
            <CheckboxGroup
              name="students"
              legend={t.students}
              helperText={t.studentsHint}
              value={chosen}
              onChange={setChosen}
              options={studentOptions.map(({ value, label }) => ({ value, label }))}
            />
          )}
          <SelectInput
            name="parent"
            label={t.parentChoice}
            value={parentId}
            onChange={setParentId}
            options={[
              { value: '', label: fill(t.newParent, { name: request.parentName }) },
              ...request.matches.map((m) => ({
                value: m.id,
                label: fill(t.existingParent, {
                  name: m.fullName,
                  children: m.children.join(', '),
                }),
              })),
            ]}
          />
          <SelectInput
            name="relationship"
            label={t.relationship}
            value={relationship}
            onChange={setRelationship}
            options={(
              Object.keys(labels.relationship) as Array<keyof typeof labels.relationship>
            ).map((r) => ({
              value: r,
              label: labels.relationship[r],
            }))}
          />
          <Stack direction="row" spacing={2}>
            <Button type="submit" loading={busy} disabled={!online}>
              {t.submit}
            </Button>
            <Button variant="secondary" onClick={() => setSheet(undefined)}>
              {labels.form.cancel}
            </Button>
          </Stack>
        </Stack>
      </Sheet>
      <ConfirmDialog
        open={sheet === 'reject'}
        title={fill(t.rejectTitle, { name: request.parentName })}
        body={t.rejectBody}
        confirmLabel={t.reject}
        cancelLabel={labels.form.cancel}
        tone="danger"
        busy={busy}
        onCancel={() => setSheet(undefined)}
        onConfirm={() => void reject()}
      />
    </>
  );
}
