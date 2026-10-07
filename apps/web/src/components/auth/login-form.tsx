'use client';

import { type LoginOutcome } from '@academybee/contracts';
import { Button, TextLink } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { PasswordInput, TextInput } from '@academybee/ui/components/fields';
import { Stack } from '@academybee/ui/components/layout';
import { type FormEvent, useState } from 'react';

import { api } from '@/lib/api';
import { useHydrated } from '@/lib/use-hydrated';
import { useOnline } from '@/lib/use-online';

import { formValues } from './form-values';
import { continueToHub } from './hub-handoff';
import { type ErrorLabels, errorMessage, type FieldLabels } from './labels';

export type LoginFormLabels = {
  fields: FieldLabels & { identifier: string; passwordLabel: string };
  errors: ErrorLabels;
  submit: string;
  forgot: string;
};

/**
 * Staff sign-in (UX Tier 1 Login). Email or a verified mobile number + password. Errors are one
 * message for the form (the API never says which part was wrong, ADR-006); offline disables the
 * button with the reason. On success the browser loads the role's home (or `next`).
 *
 * Fields are uncontrolled so what someone types before hydration is kept; the form posts by
 * method and the button waits for hydration, so credentials can never end up in a URL.
 */
export function LoginForm({
  labels,
  next,
  defaultIdentifier = '',
  onSignedIn,
  hubOrigin,
  onMfa,
  showForgot = true,
}: {
  labels: LoginFormLabels;
  next?: string | undefined;
  defaultIdentifier?: string;
  /** Re-login dialog: stay on the page instead of navigating. */
  onSignedIn?: () => void;
  /** Academy sign-in: where parents and students continue (Family Hub, C-61). */
  hubOrigin?: string | undefined;
  /** The second step (2FA, C-66, C-80). Without it a 2FA answer shows the generic error. */
  onMfa?: (mfa: { step: 'enrol' | 'verify'; token: string }) => void;
  showForgot?: boolean;
}) {
  const online = useOnline();
  const hydrated = useHydrated();
  const [missing, setMissing] = useState<{ identifier?: boolean; password?: boolean }>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const value = formValues(e);
    const identifier = value('identifier').trim();
    const password = value('password');
    const gaps = { identifier: !identifier, password: !password };
    setMissing(gaps);
    if (gaps.identifier || gaps.password) return;
    setBusy(true);
    setError(undefined);
    const res = await api<LoginOutcome>('/auth/login', {
      method: 'POST',
      body: { identifier, password },
      anonymous: true,
    });
    const data = res.ok ? res.data : undefined;
    if (data && 'handoff' in data) {
      // Parents and students continue on the Family Hub (C-61).
      if (hubOrigin) {
        continueToHub(hubOrigin, data.handoff.code);
        return;
      }
      setBusy(false);
      setError(labels.errors.generic);
      return;
    }
    if (data && 'mfa' in data) {
      setBusy(false);
      if (onMfa) onMfa(data.mfa);
      else setError(labels.errors.generic);
      return;
    }
    if (data) {
      if (onSignedIn) {
        setBusy(false);
        onSignedIn();
      } else window.location.assign(next ?? data.redirectTo);
      return;
    }
    if (res.ok) return;
    setBusy(false);
    if (res.error.code === 'TENANT_UNAVAILABLE') {
      // The academy's status changed: its status page explains.
      window.location.reload();
      return;
    }
    if (res.error.code === 'INVALID_CREDENTIALS') {
      const field = form.elements.namedItem('password');
      if (field instanceof HTMLInputElement) field.value = '';
    }
    setError(errorMessage(res.error, labels.errors));
  }

  return (
    <form method="post" noValidate onSubmit={(e) => void submit(e)} aria-busy={busy || undefined}>
      <Stack spacing={4}>
        {!online && <InlineAlert tone="warning">{labels.errors.offline}</InlineAlert>}
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <TextInput
          label={labels.fields.identifier}
          name="identifier"
          // Text, not email: a mobile number is also accepted (C-65).
          type="text"
          inputMode="email"
          autoComplete="username"
          defaultValue={defaultIdentifier}
          readOnly={Boolean(onSignedIn) && Boolean(defaultIdentifier)}
          error={missing.identifier ? labels.fields.required : undefined}
          required
        />
        <PasswordInput
          label={labels.fields.passwordLabel}
          name="password"
          autoComplete="current-password"
          error={missing.password ? labels.fields.required : undefined}
          labels={labels.fields.password}
          required
        />
        <Button type="submit" loading={busy} disabled={!hydrated || !online} fullWidth>
          {labels.submit}
        </Button>
        {!onSignedIn && showForgot && <TextLink href="/forgot-password">{labels.forgot}</TextLink>}
      </Stack>
    </form>
  );
}
