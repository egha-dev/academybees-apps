'use client';

import {
  type LoginResponse,
  type MfaEnrolConfirmResponse,
  type MfaEnrolStartResponse,
} from '@academybee/contracts';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { TextInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { type FormEvent, useEffect, useState } from 'react';

import { type LoginFormLabels, LoginForm } from '@/components/auth/login-form';
import { formValues } from '@/components/auth/form-values';
import { errorMessage } from '@/components/auth/labels';
import { api, type ApiError } from '@/lib/api';
import { useHydrated } from '@/lib/use-hydrated';
import { useOnline } from '@/lib/use-online';

export type ConsoleSignInLabels = {
  login: LoginFormLabels;
  enrol: {
    title: string;
    body: string;
    loading: string;
    qrAlt: string;
    manualKey: string;
    submit: string;
  };
  codes: {
    title: string;
    body: string;
    listLabel: string;
    copy: string;
    copied: string;
    done: string;
  };
  verify: {
    title: string;
    body: string;
    submit: string;
    useRecovery: string;
    useCode: string;
    recoveryBody: string;
  };
  fields: { code: string; recoveryCode: string };
  errors: { wrongCode: string; expired: string };
};

type Step =
  | { kind: 'password'; notice?: string }
  | { kind: 'enrol'; token: string }
  | { kind: 'verify'; token: string }
  | { kind: 'codes'; codes: string[]; redirectTo: string };

/**
 * Console sign-in (C-66): password, then the second factor. The first time, an authenticator app
 * is set up (QR code + manual key) and ten recovery codes are shown once; after that every
 * sign-in needs a code from the app or a recovery code. An MFA token lasts five minutes; when it
 * runs out, sign-in starts again from the password.
 */
export function ConsoleSignIn({ labels }: { labels: ConsoleSignInLabels }) {
  const [step, setStep] = useState<Step>({ kind: 'password' });

  const expired = () => setStep({ kind: 'password', notice: labels.errors.expired });

  switch (step.kind) {
    case 'password':
      return (
        <Stack spacing={4}>
          {step.notice && <InlineAlert tone="warning">{step.notice}</InlineAlert>}
          <LoginForm
            labels={labels.login}
            showForgot={false}
            onMfa={(mfa) => setStep({ kind: mfa.step, token: mfa.token })}
          />
        </Stack>
      );
    case 'enrol':
      return (
        <Enrol
          token={step.token}
          labels={labels}
          onExpired={expired}
          onDone={(res) =>
            setStep({ kind: 'codes', codes: res.recoveryCodes, redirectTo: res.redirectTo })
          }
        />
      );
    case 'codes':
      return (
        <RecoveryCodes codes={step.codes} redirectTo={step.redirectTo} labels={labels.codes} />
      );
    case 'verify':
      return <Verify token={step.token} labels={labels} onExpired={expired} />;
  }
}

function useCodeForm(labels: ConsoleSignInLabels, onExpired: () => void) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const fail = (e: ApiError) => {
    setBusy(false);
    if (e.code === 'SESSION_EXPIRED') return onExpired();
    setError(
      e.code === 'INVALID_CREDENTIALS'
        ? labels.errors.wrongCode
        : errorMessage(e, labels.login.errors),
    );
  };
  return { error, setError, busy, setBusy, fail };
}

function Enrol({
  token,
  labels,
  onExpired,
  onDone,
}: {
  token: string;
  labels: ConsoleSignInLabels;
  onExpired: () => void;
  onDone: (res: MfaEnrolConfirmResponse) => void;
}) {
  const online = useOnline();
  const [secret, setSecret] = useState<MfaEnrolStartResponse>();
  const form = useCodeForm(labels, onExpired);
  const { fail } = form;

  useEffect(() => {
    void api<MfaEnrolStartResponse>('/auth/mfa/enrol/start', {
      method: 'POST',
      body: { token },
      anonymous: true,
    }).then((res) => (res.ok ? setSecret(res.data) : fail(res.error)));
    // Once per token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = formValues(e)('code').trim();
    if (!code) return form.setError(labels.login.fields.required);
    form.setBusy(true);
    form.setError(undefined);
    const res = await api<MfaEnrolConfirmResponse>('/auth/mfa/enrol/confirm', {
      method: 'POST',
      body: { token, code },
      anonymous: true,
    });
    if (res.ok) onDone(res.data);
    else fail(res.error);
  }

  return (
    <Stack spacing={4}>
      <Text variant="section" as="h2">
        {labels.enrol.title}
      </Text>
      <Text tone="secondary">{labels.enrol.body}</Text>
      {form.error && <InlineAlert tone="danger">{form.error}</InlineAlert>}
      {secret ? (
        <>
          <Box
            component="img"
            src={secret.qrSvgDataUrl}
            alt={labels.enrol.qrAlt}
            sx={{
              inlineSize: 200,
              blockSize: 200,
              backgroundColor: '#FFFFFF', // a QR code needs a light quiet zone in both themes
              borderRadius: 2,
              padding: 1,
            }}
          />
          <Stack spacing={1}>
            <Text variant="bodySmall" tone="secondary">
              {labels.enrol.manualKey}
            </Text>
            <Box
              component="code"
              data-testid="manual-key"
              sx={{ fontFamily: 'monospace', fontSize: 16, overflowWrap: 'anywhere' }}
            >
              {secret.manualKey}
            </Box>
          </Stack>
          <CodeForm
            name="code"
            label={labels.fields.code}
            submit={labels.enrol.submit}
            busy={form.busy}
            online={online}
            onSubmit={submit}
          />
        </>
      ) : (
        !form.error && (
          <Stack role="status">
            <Text tone="secondary">{labels.enrol.loading}</Text>
          </Stack>
        )
      )}
    </Stack>
  );
}

function Verify({
  token,
  labels,
  onExpired,
}: {
  token: string;
  labels: ConsoleSignInLabels;
  onExpired: () => void;
}) {
  const online = useOnline();
  const [recovery, setRecovery] = useState(false);
  const form = useCodeForm(labels, onExpired);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = formValues(e)('code').trim();
    if (!value) return form.setError(labels.login.fields.required);
    form.setBusy(true);
    form.setError(undefined);
    const res = await api<LoginResponse>('/auth/mfa/verify', {
      method: 'POST',
      body: recovery ? { token, recoveryCode: value } : { token, code: value },
      anonymous: true,
    });
    if (res.ok) window.location.assign(res.data.redirectTo);
    else form.fail(res.error);
  }

  return (
    <Stack spacing={4}>
      <Text variant="section" as="h2">
        {labels.verify.title}
      </Text>
      <Text tone="secondary">{recovery ? labels.verify.recoveryBody : labels.verify.body}</Text>
      {form.error && <InlineAlert tone="danger">{form.error}</InlineAlert>}
      <CodeForm
        key={recovery ? 'recovery' : 'code'}
        name="code"
        label={recovery ? labels.fields.recoveryCode : labels.fields.code}
        recovery={recovery}
        submit={labels.verify.submit}
        busy={form.busy}
        online={online}
        onSubmit={submit}
      />
      <Button
        variant="ghost"
        onClick={() => {
          form.setError(undefined);
          setRecovery((r) => !r);
        }}
      >
        {recovery ? labels.verify.useCode : labels.verify.useRecovery}
      </Button>
    </Stack>
  );
}

function CodeForm({
  name,
  label,
  submit,
  busy,
  online,
  recovery = false,
  onSubmit,
}: {
  name: string;
  label: string;
  submit: string;
  busy: boolean;
  online: boolean;
  recovery?: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const hydrated = useHydrated();
  return (
    <form method="post" noValidate onSubmit={(e) => void onSubmit(e)} aria-busy={busy || undefined}>
      <Stack spacing={4}>
        <TextInput
          label={label}
          name={name}
          type="text"
          inputMode={recovery ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          required
        />
        <Button type="submit" loading={busy} disabled={!hydrated || !online} fullWidth>
          {submit}
        </Button>
      </Stack>
    </form>
  );
}

function RecoveryCodes({
  codes,
  redirectTo,
  labels,
}: {
  codes: string[];
  redirectTo: string;
  labels: ConsoleSignInLabels['codes'];
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Stack spacing={4}>
      <Text variant="section" as="h2">
        {labels.title}
      </Text>
      <Text tone="secondary">{labels.body}</Text>
      <Box
        component="ul"
        aria-label={labels.listLabel}
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 2,
          padding: 4,
          margin: 0,
          listStyle: 'none',
          fontFamily: 'monospace',
          fontSize: 16,
          borderRadius: 2,
          backgroundColor: 'ab.surfaceRaised',
        }}
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </Box>
      <Button
        variant="secondary"
        onClick={() =>
          void navigator.clipboard
            ?.writeText(codes.join('\n'))
            .then(() => setCopied(true))
            .catch(() => undefined)
        }
      >
        {copied ? labels.copied : labels.copy}
      </Button>
      <Button onClick={() => window.location.assign(redirectTo)} fullWidth>
        {labels.done}
      </Button>
    </Stack>
  );
}
