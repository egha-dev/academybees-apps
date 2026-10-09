'use client';

import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { CheckboxGroup } from '@academybee/ui/components/checkboxes';
import { TextInput } from '@academybee/ui/components/fields';
import { useToast } from '@academybee/ui/components/feedback';
import { Stack } from '@academybee/ui/components/layout';
import { Sheet } from '@academybee/ui/components/overlays';
import { Text } from '@academybee/ui/components/text';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { EMAIL_PATTERN } from '@/components/auth/labels';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { teamErrorMessage, type TeamErrorLabels } from './errors';
import type { RoleOption } from './role-options';

export type InviteLabels = {
  open: string;
  title: string;
  body: string;
  email: string;
  roles: string;
  rolesHint: string;
  submit: string;
  cancel: string;
  /** "Invitation sent to {email}" with `{email}` left in for the client. */
  sentTemplate: string;
  close: string;
  required: string;
  emailInvalid: string;
  errors: TeamErrorLabels;
};

/**
 * "Invite member" (plan 2.18, C-67): email + roles in a sheet (bottom sheet on phones). Only
 * roles the viewer may grant are offered. One Idempotency-Key per opened sheet, so a double tap
 * or a retry never sends two invitations.
 */
export function InviteButton({ roles, labels }: { roles: RoleOption[]; labels: InviteLabels }) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [email, setEmail] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ email?: string; roles?: string }>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const start = () => {
    setKey(crypto.randomUUID());
    setEmail('');
    setChosen([]);
    setErrors({});
    setError(undefined);
    setOpen(true);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    const next = {
      ...(!value
        ? { email: labels.required }
        : EMAIL_PATTERN.test(value)
          ? {}
          : { email: labels.emailInvalid }),
      ...(chosen.length ? {} : { roles: labels.required }),
    };
    setErrors(next);
    if (next.email || next.roles) return;
    setBusy(true);
    setError(undefined);
    const res = await api('/team/invitations', {
      method: 'POST',
      body: { email: value, roles: chosen },
      headers: { 'idempotency-key': key },
    });
    setBusy(false);
    if (!res.ok) {
      setError(teamErrorMessage(res.error, labels.errors));
      return;
    }
    setOpen(false);
    toast(labels.sentTemplate.replace('{email}', value));
    router.refresh();
  }

  return (
    <>
      <Button onClick={start}>{labels.open}</Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={labels.title}
        closeLabel={labels.close}
      >
        <form noValidate onSubmit={(e) => void submit(e)}>
          <Stack spacing={4}>
            <Text tone="secondary">{labels.body}</Text>
            {!online && <InlineAlert tone="warning">{labels.errors.offline}</InlineAlert>}
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <TextInput
              label={labels.email}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={setEmail}
              error={errors.email}
              required
            />
            <CheckboxGroup
              legend={labels.roles}
              name="roles"
              options={roles
                .filter((r) => r.grantable)
                .map((r) => ({ value: r.value, label: r.label }))}
              value={chosen}
              onChange={setChosen}
              error={errors.roles}
              helperText={labels.rolesHint}
            />
            <Stack direction="row" spacing={2} sx={{ justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {labels.cancel}
              </Button>
              <Button type="submit" loading={busy} disabled={!online}>
                {labels.submit}
              </Button>
            </Stack>
          </Stack>
        </form>
      </Sheet>
    </>
  );
}
