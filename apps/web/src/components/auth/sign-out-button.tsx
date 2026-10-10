'use client';

import { PlainButton } from '@academybee/ui/components/plain-button';
import { Box } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { lazy, Suspense, useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

// Shown only with unsynced offline work; loaded on demand (route JS budget, C-68).
const ConfirmDialog = lazy(() =>
  import('@academybee/ui/components/overlays').then((m) => ({ default: m.ConfirmDialog })),
);

export type SignOutLabels = {
  signOut: string;
  /** Why the button is disabled offline (sign-out must reach the server, review M1). */
  offline: string;
  /** The request didn't reach the server: nothing was signed out. */
  failed: string;
  guard: { title: string; body: string; stay: string; signOut: string };
};

/**
 * Sign out of this device. With unsynced offline work it asks first, defaulting to staying
 * signed in (ARCHITECTURE §11.6). `unsynced` comes from `useLogoutGuard` once the Teacher PWA
 * keeps a sync queue (Phase 6); `guard.body` is already pluralised for it on the server.
 */
export function SignOutButton({
  labels,
  unsynced = 0,
  variant = 'secondary',
}: {
  labels: SignOutLabels;
  unsynced?: number;
  variant?: 'secondary' | 'ghost';
}) {
  const online = useOnline();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setBusy(true);
    setFailed(false);
    // The API ends the session (found from the refresh cookie if the access token has expired)
    // and clears the cookies, even if the session already ended.
    const res = await api('/auth/logout', { method: 'POST', body: {}, anonymous: true });
    if (!res.ok && (res.error.code === 'NETWORK' || res.error.code === 'OFFLINE')) {
      // Nothing reached the server: the session is still live, so don't pretend otherwise.
      setBusy(false);
      setConfirming(false);
      setFailed(true);
      return;
    }
    // A full page load, not a client navigation: nothing of the session stays in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/login');
  }

  return (
    <>
      <PlainButton
        variant={variant}
        busy={busy && !confirming}
        disabled={!online}
        onClick={() => (unsynced > 0 ? setConfirming(true) : void signOut())}
      >
        {labels.signOut}
      </PlainButton>
      {(!online || failed) && (
        <Box role="status">
          <Text variant="bodySmall" tone="secondary">
            {online ? labels.failed : labels.offline}
          </Text>
        </Box>
      )}
      {confirming && (
        <Suspense fallback={null}>
          <ConfirmDialog
            open
            title={labels.guard.title}
            body={labels.guard.body}
            cancelLabel={labels.guard.stay}
            confirmLabel={labels.guard.signOut}
            tone="danger"
            busy={busy}
            onCancel={() => setConfirming(false)}
            onConfirm={() => void signOut()}
          />
        </Suspense>
      )}
    </>
  );
}
