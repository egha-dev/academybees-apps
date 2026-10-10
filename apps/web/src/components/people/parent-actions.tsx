// Loaded lazily by students-lazy.tsx (no 'use client', C-80).
import type { Parent, ParentLink } from '@academybee/contracts';
import type { Messages } from '@academybee/i18n';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { CheckboxGroup } from '@academybee/ui/components/checkboxes';
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

import { type PeopleErrorLabels, peopleErrorMessage, REFRESH_AFTER } from './errors';
import { cleanPhone, PHONE_PATTERN } from './student-fields';

export type ParentActionsLabels = {
  parents: Messages['people']['parents'];
  relationship: Messages['people']['relationship'];
  form: Messages['people']['form'];
  status: Messages['people']['status'];
  undo: string;
  undone: string;
  undoFailed: string;
  errors: PeopleErrorLabels;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * One parent on Student 360: what's true for this child (relationship, primary contact, pickup),
 * the parent's own details with all their children (C-106), and removing them from this child
 * with Undo (C-108). The parent record itself is never deleted (ADR-025).
 */
export function ParentActions({
  studentId,
  studentName,
  link,
  canManage,
  canInvite = false,
  inviteUntil,
  labels,
}: {
  studentId: string;
  studentName: string;
  link: ParentLink;
  canManage: boolean;
  /** Family Hub invites (release flag `p4-family-link`). */
  canInvite?: boolean;
  /** The open invitation's expiry, formatted on the server (tenant timezone). */
  inviteUntil?: string | undefined;
  labels: ParentActionsLabels;
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [sheet, setSheet] = useState<'link' | 'view' | 'details' | 'unlink'>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [relationship, setRelationship] = useState<string>(link.relationship);
  const [flags, setFlags] = useState<string[]>([]);
  const [parent, setParent] = useState<Parent>();
  const [details, setDetails] = useState({
    name: '',
    phone: '',
    email: '',
    occupation: '',
    whatsapp: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const p = labels.parents;
  const f = labels.form;
  const errorText = (e: Parameters<typeof peopleErrorMessage>[0]) => {
    if (REFRESH_AFTER.has(e.code)) router.refresh();
    return peopleErrorMessage(e, labels.errors);
  };

  function openLink() {
    setRelationship(link.relationship);
    setFlags([
      ...(link.isPrimaryContact ? ['primary'] : []),
      ...(link.pickupAuthorised ? ['pickup'] : []),
    ]);
    setError(undefined);
    setSheet('link');
  }

  async function openView() {
    setError(undefined);
    setSheet('view');
    const res = await api<Parent>(`/parents/${link.parentId}`);
    if (res.ok) setParent(res.data);
    else setError(errorText(res.error));
  }

  function openDetails() {
    if (!parent) return;
    setDetails({
      name: parent.fullName,
      phone: parent.phone ?? '',
      email: parent.email ?? '',
      occupation: parent.occupation ?? '',
      whatsapp: parent.whatsappCapable,
    });
    setErrors({});
    setError(undefined);
    setSheet('details');
  }

  async function saveLink(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api(`/students/${studentId}/parents/${link.linkId}`, {
      method: 'PATCH',
      body: {
        relationship,
        isPrimaryContact: flags.includes('primary'),
        pickupAuthorised: flags.includes('pickup'),
      },
    });
    setBusy(false);
    if (!res.ok) return setError(errorText(res.error));
    setSheet(undefined);
    toast(p.linkSaved);
    router.refresh();
  }

  async function invite() {
    setBusy(true);
    const res = await api<{ email: string }>(`/parents/${link.parentId}/invite`, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    });
    setBusy(false);
    if (!res.ok) return toast(errorText(res.error), 'error');
    toast(fill(p.invited, { email: res.data.email }));
    router.refresh();
  }

  async function cancelInvite() {
    setBusy(true);
    const res = await api(`/parents/${link.parentId}/invite/revoke`, { method: 'POST' });
    setBusy(false);
    if (!res.ok) return toast(errorText(res.error), 'error');
    toast(p.inviteCancelled);
    router.refresh();
  }

  async function unlink() {
    setBusy(true);
    const res = await api(`/students/${studentId}/parents/${link.linkId}`, { method: 'DELETE' });
    setBusy(false);
    setSheet(undefined);
    if (!res.ok) return toast(errorText(res.error), 'error');
    toast(fill(p.unlinked, { name: link.fullName }), 'success', {
      label: labels.undo,
      onClick: () =>
        void api(`/students/${studentId}/parents`, {
          method: 'POST',
          headers: { 'Idempotency-Key': crypto.randomUUID() },
          body: {
            parentId: link.parentId,
            relationship: link.relationship,
            isPrimaryContact: link.isPrimaryContact,
            pickupAuthorised: link.pickupAuthorised,
          },
        }).then((back) => {
          toast(back.ok ? labels.undone : labels.undoFailed, back.ok ? 'success' : 'error');
          router.refresh();
        }),
    });
    router.refresh();
  }

  async function saveDetails(e: FormEvent) {
    e.preventDefault();
    if (!parent) return;
    const local: Record<string, string> = {};
    if (!details.name.trim()) local.fullName = f.required;
    if (details.phone && !PHONE_PATTERN.test(cleanPhone(details.phone)))
      local.phone = f.phoneInvalid;
    if (details.email && !EMAIL.test(details.email.trim())) local.email = f.emailInvalid;
    setErrors(local);
    if (Object.keys(local).length) return setError(f.checkFields);
    setBusy(true);
    const res = await api<Parent>(`/parents/${parent.id}`, {
      method: 'PATCH',
      body: {
        version: parent.version,
        fullName: details.name,
        phone: details.phone ? cleanPhone(details.phone) : null,
        email: details.email.trim(),
        occupation: details.occupation,
        whatsappCapable: details.whatsapp,
      },
    });
    setBusy(false);
    if (!res.ok) return setError(errorText(res.error));
    setParent(res.data);
    setSheet('view');
    toast(p.saved);
    router.refresh();
  }

  const relationshipOptions = (
    Object.keys(labels.relationship) as Array<keyof typeof labels.relationship>
  ).map((r) => ({ value: r, label: labels.relationship[r] }));

  return (
    <>
      {canInvite && (
        <Stack spacing={0.5}>
          <Text variant="meta" tone="secondary">
            {link.access === 'INVITED' && inviteUntil
              ? fill(p.inviteUntil, { date: inviteUntil })
              : p.access[link.access]}
          </Text>
          {canManage && link.access !== 'MEMBER' && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {link.email ? (
                <PlainButton
                  variant="secondary"
                  busy={busy}
                  disabled={!online}
                  onClick={() => void invite()}
                >
                  {link.access === 'INVITED' ? p.resend : p.invite}
                </PlainButton>
              ) : (
                <Text variant="meta" tone="secondary">
                  {p.needsEmail}
                </Text>
              )}
              {link.access === 'INVITED' && (
                <PlainButton
                  variant="ghost"
                  disabled={!online || busy}
                  onClick={() => void cancelInvite()}
                >
                  {p.cancelInvite}
                </PlainButton>
              )}
            </Box>
          )}
        </Stack>
      )}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <PlainButton variant="ghost" onClick={() => void openView()}>
          {p.view}
        </PlainButton>
        {canManage && (
          <>
            <PlainButton variant="ghost" onClick={openLink} disabled={!online}>
              {p.edit}
            </PlainButton>
            <PlainButton variant="ghost" onClick={() => setSheet('unlink')} disabled={!online}>
              {p.unlink}
            </PlainButton>
          </>
        )}
      </Box>

      <Sheet
        open={sheet === 'link'}
        onClose={() => setSheet(undefined)}
        title={fill(p.editLinkTitle, { name: link.fullName, student: studentName })}
        closeLabel={f.close}
      >
        <Stack component="form" spacing={4} onSubmit={(e: FormEvent) => void saveLink(e)}>
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <SelectInput
            name="relationship"
            label={p.relationshipField}
            value={relationship}
            onChange={setRelationship}
            options={relationshipOptions}
          />
          <CheckboxGroup
            name="flags"
            legend={p.flags}
            helperText={p.primaryHint}
            value={flags}
            onChange={setFlags}
            options={[
              { value: 'primary', label: p.primaryField },
              { value: 'pickup', label: p.pickupField },
            ]}
          />
          <Stack direction="row" spacing={2}>
            <Button type="submit" loading={busy} disabled={!online}>
              {p.save}
            </Button>
            <Button variant="secondary" onClick={() => setSheet(undefined)}>
              {f.cancel}
            </Button>
          </Stack>
        </Stack>
      </Sheet>

      <Sheet
        open={sheet === 'view'}
        onClose={() => setSheet(undefined)}
        title={fill(p.sheetTitle, { name: link.fullName })}
        closeLabel={f.close}
      >
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        {parent && (
          <Stack spacing={3}>
            <Stack component="dl" spacing={2} sx={{ margin: 0 }}>
              {(
                [
                  [p.phone, parent.phone],
                  [p.email, parent.email],
                  [p.occupation, parent.occupation],
                  [p.whatsapp, parent.whatsappCapable ? p.whatsappYes : p.whatsappNo],
                ] as const
              ).map(([label, value]) => (
                <Box key={label}>
                  <Text variant="meta" tone="secondary" as="dt">
                    {label}
                  </Text>
                  <Box component="dd" sx={{ margin: 0 }}>
                    <Text as="span">{value ?? '—'}</Text>
                  </Box>
                </Box>
              ))}
            </Stack>
            <Text variant="section" as="h3">
              {p.children}
            </Text>
            <Stack component="ul" spacing={1} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {parent.children.map((c) => (
                <Box component="li" key={c.studentId}>
                  <Box
                    component="a"
                    href={`/students/${c.studentId}`}
                    sx={{ color: 'ab.textPrimary', fontWeight: 600 }}
                  >
                    {c.fullName}
                  </Box>
                  <Text variant="meta" tone="secondary" as="span">
                    {fill(p.childLine, {
                      relationship: labels.relationship[c.relationship],
                      status: labels.status[c.status],
                    })}
                  </Text>
                </Box>
              ))}
            </Stack>
            {canManage && (
              <Box>
                <PlainButton onClick={openDetails} disabled={!online}>
                  {p.editDetails}
                </PlainButton>
              </Box>
            )}
          </Stack>
        )}
      </Sheet>

      <Sheet
        open={sheet === 'details'}
        onClose={() => setSheet('view')}
        title={fill(p.detailsTitle, { name: link.fullName })}
        closeLabel={f.close}
      >
        <Stack
          component="form"
          spacing={4}
          noValidate
          onSubmit={(e: FormEvent) => void saveDetails(e)}
        >
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <TextInput
            name="fullName"
            label={f.fullName}
            required
            value={details.name}
            onChange={(name) => setDetails((d) => ({ ...d, name }))}
            error={errors.fullName}
          />
          <TextInput
            name="phone"
            label={p.phone}
            type="tel"
            inputMode="tel"
            value={details.phone}
            onChange={(phone) => setDetails((d) => ({ ...d, phone }))}
            error={errors.phone}
          />
          <TextInput
            name="email"
            label={p.email}
            type="email"
            inputMode="email"
            value={details.email}
            onChange={(email) => setDetails((d) => ({ ...d, email }))}
            error={errors.email}
          />
          <TextInput
            name="occupation"
            label={p.occupationField}
            value={details.occupation}
            onChange={(occupation) => setDetails((d) => ({ ...d, occupation }))}
          />
          <CheckboxGroup
            name="whatsapp"
            legend={p.whatsapp}
            value={details.whatsapp ? ['yes'] : []}
            onChange={(v) => setDetails((d) => ({ ...d, whatsapp: v.includes('yes') }))}
            options={[{ value: 'yes', label: p.whatsappField }]}
          />
          <Stack direction="row" spacing={2}>
            <Button type="submit" loading={busy} disabled={!online}>
              {p.save}
            </Button>
            <Button variant="secondary" onClick={() => setSheet('view')}>
              {f.cancel}
            </Button>
          </Stack>
        </Stack>
      </Sheet>

      <ConfirmDialog
        open={sheet === 'unlink'}
        title={fill(p.unlinkTitle, { name: link.fullName })}
        body={fill(p.unlinkBody, { name: link.fullName })}
        confirmLabel={p.unlink}
        cancelLabel={f.cancel}
        tone="danger"
        busy={busy}
        onCancel={() => setSheet(undefined)}
        onConfirm={() => void unlink()}
      />
    </>
  );
}
