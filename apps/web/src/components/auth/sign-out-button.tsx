'use client';

import { PlainButton } from '@academybee/ui/components/plain-button';
import { Box } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { lazy, Suspense, useState, useSyncExternalStore } from 'react';

import { plural } from '@/components/scheduling/plural';
import { api } from '@/lib/api';
import {
  countUnsynced,
  deleteLocalData,
  signOutGuard,
  subscribeSignOutGuard,
} from '@/lib/unsynced';
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
 * Sign out of this device. With unsynced offline work (the Teacher PWA's queue, published via
 * `lib/unsynced`) it asks first, defaulting to staying signed in (ARCHITECTURE §11.6). After the
 * server ends the session, this user's offline data and cached screens are deleted (§11.7).
 * `guard.body` is an ICU message with `{count}` filled here.
 */
export function SignOutButton({
  labels,
  userId,
  variant = 'secondary',
}: {
  labels: SignOutLabels;
  /** Whose offline data to delete after signing out. */
  userId?: string | undefined;
  variant?: 'secondary' | 'ghost';
}) {
  const unsynced = useSyncExternalStore(
    subscribeSignOutGuard,
    () => signOutGuard().unsynced,
    () => 0,
  );
  const online = useOnline();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const [counted, setCounted] = useState(0);
  /**
   * Count unsynced records at the moment of the tap: the live count may still be loading, and on
   * a page without the sync engine there is none, so read the device's database directly.
   */
  async function ask() {
    const count = signOutGuard().count ?? (userId ? () => countUnsynced(userId) : undefined);
    const now = (await count?.().catch(() => unsynced)) ?? unsynced;
    setCounted(now);
    if (Math.max(now, unsynced) > 0) setConfirming(true);
    else void signOut();
  }

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
    if (userId) await deleteLocalData(userId);
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
        onClick={() => void ask()}
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
            body={plural(labels.guard.body, Math.max(counted, unsynced))}
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
