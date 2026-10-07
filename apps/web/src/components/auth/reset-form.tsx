'use client';

import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { PasswordInput } from '@academybee/ui/components/fields';
import { Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { type FormEvent, useState } from 'react';

import { api } from '@/lib/api';
import { useHydrated } from '@/lib/use-hydrated';
import { useOnline } from '@/lib/use-online';

import { formValues } from './form-values';
import { useFragmentToken } from './fragment-token';
import { type ErrorLabels, errorMessage, type FieldLabels, passwordProblem } from './labels';

export type ResetFormLabels = {
  fields: FieldLabels & { newPassword: string; confirmPassword: string };
  errors: ErrorLabels;
  submit: string;
  doneTitle: string;
  doneBody: string;
  signIn: string;
  invalidTitle: string;
  invalidBody: string;
  requestNew: string;
};

/** Choose a new password from a reset link (single use; signs out everywhere, C-67). */
export function ResetForm({
  labels,
  canRequestNew = true,
}: {
  labels: ResetFormLabels;
  /** Academy hosts offer "get a new link"; the console has no self-service reset (C-73). */
  canRequestNew?: boolean;
}) {
  const { token } = useFragmentToken();
  const online = useOnline();
  const hydrated = useHydrated();
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<'form' | 'done' | 'invalid'>('form');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = formValues(e);
    const password = value('new-password');
    const confirm = value('confirm-password');
    const next = {
      ...(password ? {} : { password: labels.fields.required }),
      ...(confirm && confirm !== password ? { confirm: labels.fields.mismatch } : {}),
      ...(confirm ? {} : { confirm: labels.fields.required }),
    };
    setErrors(next);
    if (next.password || next.confirm) return;
    setBusy(true);
    setError(undefined);
    const res = await api('/auth/password/reset', {
      method: 'POST',
      body: { token, password },
      anonymous: true,
    });
    setBusy(false);
    if (res.ok) return setState('done');
    if (res.error.code === 'NOT_FOUND') return setState('invalid');
    const problem =
      res.error.code === 'VALIDATION_FAILED' && passwordProblem(res.error, labels.fields);
    if (problem) setErrors({ password: problem });
    else setError(errorMessage(res.error, labels.errors));
  }

  if (state === 'done')
    return (
      <Stack spacing={4}>
        <InlineAlert tone="success">
          <strong>{labels.doneTitle}</strong>
        </InlineAlert>
        <Text tone="secondary">{labels.doneBody}</Text>
        <Button href="/login" fullWidth>
          {labels.signIn}
        </Button>
      </Stack>
    );
  if (state === 'invalid')
    return <ResetLinkInvalid labels={labels} canRequestNew={canRequestNew} />;

  return (
    <form method="post" noValidate onSubmit={(e) => void submit(e)}>
      <Stack spacing={4}>
        {!online && <InlineAlert tone="warning">{labels.errors.offline}</InlineAlert>}
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <PasswordInput
          label={labels.fields.newPassword}
          name="new-password"
          autoComplete="new-password"
          error={errors.password}
          helperText={labels.fields.passwordHint}
          labels={labels.fields.password}
          required
        />
        <PasswordInput
          label={labels.fields.confirmPassword}
          name="confirm-password"
          autoComplete="new-password"
          error={errors.confirm}
          labels={labels.fields.password}
          required
        />
        <Button type="submit" loading={busy} disabled={!hydrated || !online} fullWidth>
          {labels.submit}
        </Button>
      </Stack>
    </form>
  );
}

export function ResetLinkInvalid({
  labels,
  canRequestNew = true,
}: {
  labels: Pick<ResetFormLabels, 'invalidTitle' | 'invalidBody' | 'requestNew'>;
  canRequestNew?: boolean;
}) {
  return (
    <Stack spacing={4}>
      <InlineAlert tone="warning">
        <strong>{labels.invalidTitle}</strong>
      </InlineAlert>
      <Text tone="secondary">{labels.invalidBody}</Text>
      {canRequestNew && (
        <Button href="/forgot-password" fullWidth>
          {labels.requestNew}
        </Button>
      )}
    </Stack>
  );
}
