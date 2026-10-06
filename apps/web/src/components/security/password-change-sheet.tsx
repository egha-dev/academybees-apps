// Client code reached only through lazy() from client components: no 'use client' boundary,
// so the route manifest doesn't count it as eager JS (G-24).

import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { PasswordInput } from '@academybee/ui/components/fields';
import { Stack } from '@academybee/ui/components/layout';
import { Sheet } from '@academybee/ui/components/overlays';
import { type FormEvent, useState } from 'react';

import { formValues } from '@/components/auth/form-values';
import { type FieldLabels, passwordProblem } from '@/components/auth/labels';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { securityErrorMessage, type SecurityErrorLabels } from './errors';

export type PasswordChangeLabels = {
  open: string;
  current: string;
  new: string;
  submit: string;
  changed: string;
  sameAsCurrent: string;
  close: string;
  fields: FieldLabels;
  errors: SecurityErrorLabels;
};

/**
 * The password-change sheet, loaded on demand. Change the password (G-11): the current one, then a new one that meets the policy (OD-04). Every
 * other device is signed out and a "password changed" email follows; this device stays signed in.
 */
export function PasswordChangeSheet({
  labels,
  onClose,
}: {
  labels: PasswordChangeLabels;
  onClose: (changed: boolean) => void;
}) {
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<{ current?: string; next?: string }>({});

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = formValues(e);
    const currentPassword = value('currentPassword');
    const newPassword = value('newPassword');
    const missing = {
      ...(currentPassword ? {} : { current: labels.fields.required }),
      ...(newPassword ? {} : { next: labels.fields.required }),
    };
    setFieldErrors(missing);
    if (missing.current || missing.next) return;
    setBusy(true);
    setError(undefined);
    const res = await api('/auth/password/change', {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
    setBusy(false);
    if (res.ok) return onClose(true);
    if (res.error.code === 'VALIDATION_FAILED') {
      const same = res.error.details?.some((d) => d.issue === 'same_as_current');
      const problem = passwordProblem(res.error, labels.fields);
      return setFieldErrors({
        next: same ? labels.sameAsCurrent : (problem ?? labels.errors.generic),
      });
    }
    if (res.error.code === 'INVALID_CREDENTIALS')
      return setFieldErrors({ current: labels.errors.wrongPassword });
    setError(securityErrorMessage(res.error, labels.errors));
  }

  return (
    <>
      <Sheet open onClose={() => onClose(false)} title={labels.open} closeLabel={labels.close}>
        <form
          method="post"
          noValidate
          onSubmit={(e) => void submit(e)}
          aria-busy={busy || undefined}
        >
          <Stack spacing={4}>
            {!online && <InlineAlert tone="warning">{labels.errors.offline}</InlineAlert>}
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <PasswordInput
              label={labels.current}
              name="currentPassword"
              autoComplete="current-password"
              error={fieldErrors.current}
              labels={labels.fields.password}
              required
            />
            <PasswordInput
              label={labels.new}
              name="newPassword"
              autoComplete="new-password"
              error={fieldErrors.next}
              helperText={labels.fields.passwordHint}
              labels={labels.fields.password}
              required
            />
            <Button type="submit" loading={busy} disabled={!online} fullWidth>
              {labels.submit}
            </Button>
          </Stack>
        </form>
      </Sheet>
    </>
  );
}
