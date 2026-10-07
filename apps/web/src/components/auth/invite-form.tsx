'use client';

import { type AcceptInvitationResponse } from '@academybee/contracts';
import { Button, TextLink } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { PasswordInput, TextInput } from '@academybee/ui/components/fields';
import { Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { type FormEvent, lazy, Suspense, useState } from 'react';

import { api } from '@/lib/api';
import { useHydrated } from '@/lib/use-hydrated';
import { useOnline } from '@/lib/use-online';

import { formValues } from './form-values';
import { useFragmentToken } from './fragment-token';
import { type ErrorLabels, errorMessage, type FieldLabels, passwordProblem } from './labels';
import type { MfaLabels } from './mfa-steps';

// Needed only when the user has 2FA or the role requires it (route budget, G-24).
const MfaSteps = lazy(() => import('./mfa-steps').then((m) => ({ default: m.MfaSteps })));

export type InviteFormLabels = {
  fields: FieldLabels & { name: string };
  errors: ErrorLabels;
  newAccountBody: string;
  createPassword: string;
  submitNew: string;
  existingBody: string;
  existingPassword: string;
  submitExisting: string;
  forgot: string;
  invalid: string;
  alreadyMember: string;
  mfa: MfaLabels;
};

/**
 * Accept a staff invitation (C-67). A new person creates their account here; someone who already
 * has an AcademyBee account confirms with its password. Both end signed in at their home — after
 * a 2FA code when they have 2FA or the academy requires it for the role (C-80). The membership
 * exists by then, so an expired 2FA step continues at sign-in.
 */
export function InviteForm({
  accountExists,
  labels,
}: {
  accountExists: boolean;
  labels: InviteFormLabels;
}) {
  const { token } = useFragmentToken();
  const online = useOnline();
  const hydrated = useHydrated();
  const [errors, setErrors] = useState<{ name?: string; password?: string }>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState<{ step: 'enrol' | 'verify'; token: string }>();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = formValues(e);
    const name = value('name');
    const password = value('password');
    const next = {
      ...(!accountExists && !name.trim() ? { name: labels.fields.required } : {}),
      ...(password ? {} : { password: labels.fields.required }),
    };
    setErrors(next);
    if (next.name || next.password) return;
    setBusy(true);
    setError(undefined);
    const res = await api<AcceptInvitationResponse>('/invitations/accept', {
      method: 'POST',
      body: accountExists ? { token, password } : { token, name: name.trim(), password },
      anonymous: true,
    });
    if (res.ok) {
      if ('mfa' in res.data) {
        setBusy(false);
        setMfa(res.data.mfa);
      } else window.location.assign(res.data.redirectTo);
      return;
    }
    setBusy(false);
    if (res.error.code === 'NOT_FOUND') return setError(labels.invalid);
    if (res.error.code === 'CONFLICT') return setError(labels.alreadyMember);
    const problem =
      res.error.code === 'VALIDATION_FAILED' && passwordProblem(res.error, labels.fields);
    if (problem) setErrors({ password: problem });
    else setError(errorMessage(res.error, labels.errors));
  }

  if (mfa)
    return (
      <Suspense
        fallback={
          <Stack role="status">
            <Text tone="secondary">{labels.mfa.loading}</Text>
          </Stack>
        }
      >
        <MfaSteps
          mfa={mfa}
          labels={labels.mfa}
          // The membership exists now: an expired step continues at sign-in (a full load, like
          // every signed-in navigation, C-72).
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          onExpired={() => window.location.assign('/login')}
          onDone={(outcome) =>
            window.location.assign('redirectTo' in outcome ? outcome.redirectTo : '/login')
          }
        />
      </Suspense>
    );

  return (
    <form method="post" noValidate onSubmit={(e) => void submit(e)}>
      <Stack spacing={4}>
        <Text tone="secondary">{accountExists ? labels.existingBody : labels.newAccountBody}</Text>
        {!online && <InlineAlert tone="warning">{labels.errors.offline}</InlineAlert>}
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        {!accountExists && (
          <TextInput
            label={labels.fields.name}
            name="name"
            autoComplete="name"
            error={errors.name}
            required
          />
        )}
        <PasswordInput
          label={accountExists ? labels.existingPassword : labels.createPassword}
          name="password"
          autoComplete={accountExists ? 'current-password' : 'new-password'}
          error={errors.password}
          {...(accountExists ? {} : { helperText: labels.fields.passwordHint })}
          labels={labels.fields.password}
          required
        />
        <Button type="submit" loading={busy} disabled={!hydrated || !online} fullWidth>
          {accountExists ? labels.submitExisting : labels.submitNew}
        </Button>
        {accountExists && <TextLink href="/forgot-password">{labels.forgot}</TextLink>}
      </Stack>
    </form>
  );
}
