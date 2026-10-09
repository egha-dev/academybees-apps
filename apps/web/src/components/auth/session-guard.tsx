'use client';

import { useRouter } from 'next/navigation';
import { lazy, Suspense, useEffect, useState } from 'react';

import { refreshSession, SESSION_LOST_EVENT } from '@/lib/api';

import type { LoginFormLabels } from './login-form';
import type { SignOutLabels } from './sign-out-button';

const SessionLostDialog = lazy(() => import('./session-lost-dialog'));

export type SessionGuardLabels = {
  login: LoginFormLabels;
  signOut: SignOutLabels;
  title: string;
  body: string;
  signOutInstead: string;
  restoring: string;
};

/**
 * Keeps a signed-in page signed in (plan 2.15):
 * - `expired` (the server saw an expired access token): refresh silently, then re-render;
 * - a call that found the session gone (`SESSION_LOST_EVENT`): ask for the password in a dialog
 *   over the page, so nothing typed is lost; afterwards the page re-reads its data.
 */
export function SessionGuard({
  labels,
  identifier,
  expired = false,
}: {
  labels: SessionGuardLabels;
  identifier: string;
  expired?: boolean;
}) {
  const router = useRouter();
  const [lost, setLost] = useState(false);

  useEffect(() => {
    const onLost = () => setLost(true);
    window.addEventListener(SESSION_LOST_EVENT, onLost);
    return () => window.removeEventListener(SESSION_LOST_EVENT, onLost);
  }, []);

  useEffect(() => {
    if (!expired) return;
    void refreshSession().then((ok) => (ok ? router.refresh() : setLost(true)));
  }, [expired, router]);

  if (!lost) return null;
  return (
    <Suspense fallback={null}>
      <SessionLostDialog
        labels={labels}
        identifier={identifier}
        onSignedIn={() => {
          setLost(false);
          router.refresh();
        }}
      />
    </Suspense>
  );
}
