'use client';

import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { Stack } from '@academybee/ui/components/layout';
import { useRef, useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

/** Finish the setup: the academy opens (C-87), then go to its home. */
export function ReadyActions({
  canComplete,
  labels,
}: {
  canComplete: boolean;
  labels: { open: string; notYet: string; offline: string; generic: string };
}) {
  const online = useOnline();
  const key = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function complete() {
    setBusy(true);
    setError(undefined);
    const res = await api('/onboarding/complete', {
      method: 'POST',
      headers: { 'idempotency-key': key.current },
      body: {},
    });
    // A full page load: the academy is ACTIVE now and its pages change (shell, navigation).
    if (res.ok) return window.location.assign('/');
    setBusy(false);
    key.current = crypto.randomUUID();
    setError(
      res.error.code === 'OFFLINE' || res.error.code === 'NETWORK'
        ? labels.offline
        : labels.generic,
    );
  }

  return (
    <Stack spacing={3}>
      {!canComplete && <InlineAlert tone="info">{labels.notYet}</InlineAlert>}
      {!online && <InlineAlert tone="warning">{labels.offline}</InlineAlert>}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <Stack direction="row">
        <Button onClick={() => void complete()} loading={busy} disabled={!canComplete || !online}>
          {labels.open}
        </Button>
      </Stack>
    </Stack>
  );
}
