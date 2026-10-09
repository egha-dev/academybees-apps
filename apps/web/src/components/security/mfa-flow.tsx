// Client code reached only through lazy() from client components: no 'use client' boundary,
// so the route manifest doesn't count it as eager JS (G-24).

import type { MfaEnrolStartResponse, RecoveryCodesResponse } from '@academybee/contracts';
import { InlineAlert } from '@academybee/ui/components/alert';
import { Stack } from '@academybee/ui/components/layout';
import { Sheet } from '@academybee/ui/components/overlays';
import { Text } from '@academybee/ui/components/text';
import { type FormEvent, useState } from 'react';

import { formValues } from '@/components/auth/form-values';
import { CodeForm, type MfaLabels, QrSecret, RecoveryCodes } from '@/components/auth/mfa-steps';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { securityErrorMessage, type SecurityErrorLabels } from './errors';
import { type PasswordStepLabels, PasswordStep } from './password-step';

export type MfaManageLabels = {
  setUp: string;
  newCodes: string;
  turnOff: string;
  turnOffBody: string;
  continue: string;
  enabled: string;
  disabled: string;
  newCodesBody: string;
  newCodesDone: string;
  close: string;
  password: PasswordStepLabels;
  steps: MfaLabels;
  errors: SecurityErrorLabels;
};

export type Flow = 'setup' | 'codes' | 'off';
type Step =
  | { kind: 'password' }
  | { kind: 'scan'; secret: MfaEnrolStartResponse }
  | { kind: 'codes'; codes: string[] };

/**
 * The sheet behind the Security page's 2FA buttons (loaded on demand): password first, then the
 * QR code and a code (set up), the new codes (recovery codes), or off. `onClose(true)` when the
 * change happened.
 */
export function MfaFlowSheet({
  flow,
  onClose,
  labels,
}: {
  flow: Flow;
  onClose: (changed: boolean) => void;
  labels: MfaManageLabels;
}) {
  const online = useOnline();
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const close = () => onClose(step.kind === 'codes');

  async function withPassword(password: string) {
    setBusy(true);
    setError(undefined);
    if (flow === 'setup') {
      const res = await api<MfaEnrolStartResponse>('/auth/mfa/setup/start', {
        method: 'POST',
        body: { password },
      });
      setBusy(false);
      if (res.ok) setStep({ kind: 'scan', secret: res.data });
      else setError(securityErrorMessage(res.error, labels.errors));
      return;
    }
    if (flow === 'codes') {
      const res = await api<RecoveryCodesResponse>('/auth/mfa/recovery-codes', {
        method: 'POST',
        body: { password },
      });
      setBusy(false);
      if (res.ok) setStep({ kind: 'codes', codes: res.data.recoveryCodes });
      else setError(securityErrorMessage(res.error, labels.errors));
      return;
    }
    const res = await api('/auth/mfa/disable', { method: 'POST', body: { password } });
    setBusy(false);
    if (!res.ok) return setError(securityErrorMessage(res.error, labels.errors));
    onClose(true);
  }

  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = formValues(e)('code').trim();
    if (!code) return setError(labels.steps.fields.required);
    setBusy(true);
    setError(undefined);
    const res = await api<RecoveryCodesResponse>('/auth/mfa/setup/confirm', {
      method: 'POST',
      body: { code },
    });
    setBusy(false);
    if (res.ok) setStep({ kind: 'codes', codes: res.data.recoveryCodes });
    else setError(securityErrorMessage(res.error, labels.errors, 'code'));
  }

  const title =
    flow === 'setup' ? labels.setUp : flow === 'codes' ? labels.newCodes : labels.turnOff;

  return (
    <>
      <Sheet open onClose={close} title={title} closeLabel={labels.close}>
        <Stack spacing={4}>
          {!online && <InlineAlert tone="warning">{labels.errors.offline}</InlineAlert>}
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          {step.kind === 'password' && (
            <>
              {flow === 'off' && <Text>{labels.turnOffBody}</Text>}
              <PasswordStep
                labels={labels.password}
                submit={flow === 'off' ? labels.turnOff : labels.continue}
                danger={flow === 'off'}
                busy={busy}
                online={online}
                onSubmit={(p) => void withPassword(p)}
              />
            </>
          )}
          {step.kind === 'scan' && (
            <>
              <Text tone="secondary">{labels.steps.enrol.body}</Text>
              <QrSecret secret={step.secret} labels={labels.steps.enrol} />
              <CodeForm
                name="code"
                label={labels.steps.fields.code}
                submit={labels.steps.enrol.submit}
                busy={busy}
                online={online}
                onSubmit={confirm}
              />
            </>
          )}
          {step.kind === 'codes' && (
            <>
              {flow === 'codes' && <InlineAlert tone="info">{labels.newCodesBody}</InlineAlert>}
              <RecoveryCodes codes={step.codes} labels={labels.steps.codes} onDone={close} />
            </>
          )}
        </Stack>
      </Sheet>
    </>
  );
}
