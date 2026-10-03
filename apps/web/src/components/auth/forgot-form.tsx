'use client';

import { Button, TextLink } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { TextInput } from '@academybee/ui/components/fields';
import { Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { type FormEvent, useState } from 'react';

import { api } from '@/lib/api';
import { useHydrated } from '@/lib/use-hydrated';
import { useOnline } from '@/lib/use-online';

import { formValues } from './form-values';
import { EMAIL_PATTERN, type ErrorLabels, errorMessage, type FieldLabels } from './labels';

export type ForgotFormLabels = {
  fields: FieldLabels & { email: string };
  errors: ErrorLabels;
  submit: string;
  sentTitle: string;
  sentBody: string;
  backToLogin: string;
};

/** Ask for a reset link. The answer is the same whether or not the email has an account (C-67). */
export function ForgotForm({ labels }: { labels: ForgotFormLabels }) {
  const online = useOnline();
  const hydrated = useHydrated();
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = formValues(e)('email').trim();
    const problem = !email
      ? labels.fields.required
      : EMAIL_PATTERN.test(email)
        ? undefined
        : labels.fields.emailInvalid;
    setFieldError(problem);
    if (problem) return;
    setBusy(true);
    setError(undefined);
    const res = await api('/auth/password/forgot', {
      method: 'POST',
      body: { email },
      anonymous: true,
    });
    setBusy(false);
    if (res.ok) setSent(true);
    else setError(errorMessage(res.error, labels.errors));
  }

  if (sent)
    return (
      <Stack spacing={4}>
        <InlineAlert tone="success">
          <strong>{labels.sentTitle}</strong>
        </InlineAlert>
        <Text tone="secondary">{labels.sentBody}</Text>
        <TextLink href="/login">{labels.backToLogin}</TextLink>
      </Stack>
    );

  return (
    <form method="post" noValidate onSubmit={(e) => void submit(e)}>
      <Stack spacing={4}>
        {!online && <InlineAlert tone="warning">{labels.errors.offline}</InlineAlert>}
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <TextInput
          label={labels.fields.email}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          error={fieldError}
          required
        />
        <Button type="submit" loading={busy} disabled={!hydrated || !online} fullWidth>
          {labels.submit}
        </Button>
        <TextLink href="/login">{labels.backToLogin}</TextLink>
      </Stack>
    </form>
  );
}
