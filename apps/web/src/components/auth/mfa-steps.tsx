// Client code reached only through lazy() from client components: no 'use client' boundary,
// so the route manifest doesn't count it as eager JS (G-24).

import {
  type MfaEnrolConfirmResponse,
  type MfaEnrolStartResponse,
  type MfaVerifyResponse,
} from '@academybee/contracts';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { TextInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { type FormEvent, useEffect, useState } from 'react';

import { api, type ApiError } from '@/lib/api';
import { useHydrated } from '@/lib/use-hydrated';
import { useOnline } from '@/lib/use-online';

import { formValues } from './form-values';
import { type ErrorLabels, errorMessage } from './labels';

export type MfaLabels = {
  loading: string;
  enrol: {
    title: string;
    body: string;
    loading: string;
    qrAlt: string;
    manualKey: string;
    submit: string;
    /** Academy hosts: why enrolment is needed now (the academy requires it). */
    requiredNotice?: string;
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
  fields: { code: string; recoveryCode: string; required: string };
  errors: { wrongCode: string; expired: string } & ErrorLabels;
};

/**
 * The second step of a sign-in (C-66, C-80): `enrol` sets up an authenticator app when 2FA is
 * mandatory and then shows the ten recovery codes once; `verify` takes a code from the app or a
 * recovery code. An MFA token lasts five minutes; `onExpired` returns to the password.
 * `onDone` receives the API's answer (signed in, or a handoff to the Family Hub).
 */
export function MfaSteps({
  mfa,
  labels,
  onExpired,
  onDone,
}: {
  mfa: { step: 'enrol' | 'verify'; token: string };
  labels: MfaLabels;
  onExpired: () => void;
  onDone: (outcome: MfaVerifyResponse) => void;
}) {
  const [codes, setCodes] = useState<MfaEnrolConfirmResponse>();
  if (codes)
    return (
      <RecoveryCodes
        codes={codes.recoveryCodes}
        labels={labels.codes}
        onDone={() => onDone(codes)}
      />
    );
  return mfa.step === 'enrol' ? (
    <Enrol token={mfa.token} labels={labels} onExpired={onExpired} onDone={setCodes} />
  ) : (
    <Verify token={mfa.token} labels={labels} onExpired={onExpired} onDone={onDone} />
  );
}

export function useCodeForm(labels: MfaLabels, onExpired?: () => void) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const fail = (e: ApiError) => {
    setBusy(false);
    if (e.code === 'SESSION_EXPIRED' && onExpired) return onExpired();
    setError(
      e.code === 'INVALID_CREDENTIALS' ? labels.errors.wrongCode : errorMessage(e, labels.errors),
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
  labels: MfaLabels;
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
    if (!code) return form.setError(labels.fields.required);
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
      {labels.enrol.requiredNotice && (
        <InlineAlert tone="info">{labels.enrol.requiredNotice}</InlineAlert>
      )}
      <Text tone="secondary">{labels.enrol.body}</Text>
      {form.error && <InlineAlert tone="danger">{form.error}</InlineAlert>}
      {secret ? (
        <>
          <QrSecret secret={secret} labels={labels.enrol} />
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
  onDone,
}: {
  token: string;
  labels: MfaLabels;
  onExpired: () => void;
  onDone: (outcome: MfaVerifyResponse) => void;
}) {
  const online = useOnline();
  const [recovery, setRecovery] = useState(false);
  const form = useCodeForm(labels, onExpired);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = formValues(e)('code').trim();
    if (!value) return form.setError(labels.fields.required);
    form.setBusy(true);
    form.setError(undefined);
    const res = await api<MfaVerifyResponse>('/auth/mfa/verify', {
      method: 'POST',
      body: recovery ? { token, recoveryCode: value } : { token, code: value },
      anonymous: true,
    });
    if (res.ok) onDone(res.data);
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

/** The QR code and manual key for an authenticator app. */
export function QrSecret({
  secret,
  labels,
}: {
  secret: MfaEnrolStartResponse;
  labels: { qrAlt: string; manualKey: string };
}) {
  return (
    <>
      <Box
        component="img"
        src={secret.qrSvgDataUrl}
        alt={labels.qrAlt}
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
          {labels.manualKey}
        </Text>
        <Box
          component="code"
          data-testid="manual-key"
          sx={{ fontFamily: 'monospace', fontSize: 16, overflowWrap: 'anywhere' }}
        >
          {secret.manualKey}
        </Box>
      </Stack>
    </>
  );
}

export function CodeForm({
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

/** Ten recovery codes, shown once, with copy. */
export function RecoveryCodes({
  codes,
  labels,
  onDone,
}: {
  codes: string[];
  labels: MfaLabels['codes'];
  onDone: () => void;
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
      <Button onClick={onDone} fullWidth>
        {labels.done}
      </Button>
    </Stack>
  );
}
