'use client';

import { Button } from '@academybee/ui/components/actions';
import { lazy, Suspense, useState } from 'react';

import { api } from '@/lib/api';

// Shown only with unsynced offline work; loaded on demand (route JS budget, C-68).
const ConfirmDialog = lazy(() =>
  import('@academybee/ui/components/overlays').then((m) => ({ default: m.ConfirmDialog })),
);

export type SignOutLabels = {
  signOut: string;
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
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    // Sign-out always ends here: the API clears the cookies even if the session already ended.
    await api('/auth/logout', { method: 'POST', body: {}, anonymous: true });
    // A full page load, not a client navigation: nothing of the session stays in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/login');
  }

  return (
    <>
      <Button
        variant={variant}
        loading={busy && !confirming}
        onClick={() => (unsynced > 0 ? setConfirming(true) : void signOut())}
      >
        {labels.signOut}
      </Button>
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
