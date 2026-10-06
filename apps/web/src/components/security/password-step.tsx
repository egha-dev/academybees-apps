'use client';

import { Button } from '@academybee/ui/components/actions';
import { PasswordInput } from '@academybee/ui/components/fields';
import { Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { type FormEvent, useState } from 'react';

import { formValues } from '@/components/auth/form-values';

export type PasswordStepLabels = {
  prompt: string;
  password: string;
  required: string;
  toggle: { show: string; hide: string; capsLock: string };
};

/** Re-enter the current password before a sensitive change (G-11). */
export function PasswordStep({
  labels,
  submit,
  busy,
  online,
  danger = false,
  onSubmit,
}: {
  labels: PasswordStepLabels;
  submit: string;
  busy: boolean;
  online: boolean;
  danger?: boolean;
  onSubmit: (password: string) => void;
}) {
  const [missing, setMissing] = useState(false);
  const send = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const password = formValues(e)('password');
    setMissing(!password);
    if (password) onSubmit(password);
  };
  return (
    <form method="post" noValidate onSubmit={send} aria-busy={busy || undefined}>
      <Stack spacing={4}>
        <Text tone="secondary">{labels.prompt}</Text>
        <PasswordInput
          label={labels.password}
          name="password"
          autoComplete="current-password"
          error={missing ? labels.required : undefined}
          labels={labels.toggle}
          required
        />
        <Button
          type="submit"
          variant={danger ? 'danger' : 'primary'}
          loading={busy}
          disabled={!online}
          fullWidth
        >
          {submit}
        </Button>
      </Stack>
    </form>
  );
}
