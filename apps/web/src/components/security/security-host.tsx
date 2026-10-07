// Client code reached only through lazy() from client components: no 'use client' boundary,
// so the route manifest doesn't count it as eager JS (G-24).

import { useToast } from '@academybee/ui/components/feedback';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { api } from '@/lib/api';

import { securityErrorMessage, type SecurityErrorLabels } from './errors';
import { type Flow, MfaFlowSheet, type MfaManageLabels } from './mfa-flow';
import { type PasswordChangeLabels, PasswordChangeSheet } from './password-change-sheet';

export type SecurityAction =
  | { kind: 'mfa'; flow: Flow }
  | { kind: 'password' }
  /** Sign out one other device, or (no id) every other one. */
  | { kind: 'revoke'; sessionId?: string };

export type SecurityHostLabels = {
  mfa?: MfaManageLabels;
  password?: PasswordChangeLabels;
  revoke?: { done: string; errors: SecurityErrorLabels };
};

/**
 * What a Security button does (G-11, C-80): the 2FA sheets (set up, new recovery codes, turn
 * off), the password-change sheet, or signing out devices. Each finished change shows a toast and
 * re-reads the page from the server.
 */
export function SecurityHost({
  action,
  labels,
  onDone,
}: {
  action: SecurityAction;
  labels: SecurityHostLabels;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const finish = (message?: string) => {
    onDone();
    if (!message) return;
    toast(message);
    router.refresh();
  };

  if (action.kind === 'mfa' && labels.mfa) {
    const mfa = labels.mfa;
    return (
      <MfaFlowSheet
        flow={action.flow}
        labels={mfa}
        onClose={(changed) =>
          finish(
            !changed
              ? undefined
              : action.flow === 'setup'
                ? mfa.enabled
                : action.flow === 'codes'
                  ? mfa.newCodesDone
                  : mfa.disabled,
          )
        }
      />
    );
  }
  if (action.kind === 'password' && labels.password) {
    const password = labels.password;
    return (
      <PasswordChangeSheet
        labels={password}
        onClose={(changed) => finish(changed ? password.changed : undefined)}
      />
    );
  }
  if (action.kind === 'revoke' && labels.revoke)
    return <Revoke sessionId={action.sessionId} labels={labels.revoke} finish={finish} />;
  return null;
}

/** Sign out a device (or all others), then re-read the list; one that is already gone just goes. */
function Revoke({
  sessionId,
  labels,
  finish,
}: {
  sessionId: string | undefined;
  labels: NonNullable<SecurityHostLabels['revoke']>;
  finish: (message?: string) => void;
}) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void api(
      sessionId
        ? `/auth/sessions/${encodeURIComponent(sessionId)}/revoke`
        : '/auth/sessions/revoke-others',
      { method: 'POST' },
    ).then((res) =>
      finish(
        res.ok || res.error.code === 'NOT_FOUND'
          ? labels.done
          : securityErrorMessage(res.error, labels.errors),
      ),
    );
    // Once per press.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
