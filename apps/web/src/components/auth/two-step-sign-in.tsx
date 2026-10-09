'use client';

import type { MfaVerifyResponse } from '@academybee/contracts';
import { InlineAlert } from '@academybee/ui/components/alert';
import { Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { lazy, Suspense, useState } from 'react';

import { continueToHub } from './hub-handoff';
import { type LoginFormLabels, LoginForm } from './login-form';
import type { MfaLabels } from './mfa-steps';

// Most sign-ins never need the second step: load it only when it does (route budget, G-24).
const MfaSteps = lazy(() => import('./mfa-steps').then((m) => ({ default: m.MfaSteps })));

type Step =
  { kind: 'password'; notice?: string } | { kind: 'mfa'; step: 'enrol' | 'verify'; token: string };

/**
 * Sign-in with an optional second step (C-66, C-80): the password first; then, for users with
 * two-step sign-in (and staff whose academy requires it), a code from their authenticator app.
 * Signed in → the role's home (or `next`); a parent/student on an academy host → Family Hub.
 */
export function TwoStepSignIn({
  labels,
  next,
  hubOrigin,
  showForgot = true,
}: {
  labels: { login: LoginFormLabels; mfa: MfaLabels };
  next?: string | undefined;
  hubOrigin?: string | undefined;
  showForgot?: boolean;
}) {
  const [step, setStep] = useState<Step>({ kind: 'password' });

  const done = (outcome: MfaVerifyResponse) => {
    if ('handoff' in outcome) {
      if (hubOrigin) continueToHub(hubOrigin, outcome.handoff.code);
      else setStep({ kind: 'password', notice: labels.login.errors.generic });
      return;
    }
    window.location.assign(next ?? outcome.redirectTo);
  };

  if (step.kind === 'mfa')
    return (
      <Suspense
        fallback={
          <Stack role="status">
            <Text tone="secondary">{labels.mfa.loading}</Text>
          </Stack>
        }
      >
        <MfaSteps
          mfa={step}
          labels={labels.mfa}
          onExpired={() => setStep({ kind: 'password', notice: labels.mfa.errors.expired })}
          onDone={done}
        />
      </Suspense>
    );
  return (
    <Stack spacing={4}>
      {step.notice && <InlineAlert tone="warning">{step.notice}</InlineAlert>}
      <LoginForm
        labels={labels.login}
        next={next}
        hubOrigin={hubOrigin}
        showForgot={showForgot}
        onMfa={(mfa) => setStep({ kind: 'mfa', ...mfa })}
      />
    </Stack>
  );
}
