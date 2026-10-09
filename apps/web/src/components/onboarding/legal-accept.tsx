'use client';

import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

/** Accept the listed documents at once (G-06, ADR-034), then continue. */
export function LegalAccept({
  documentIds,
  next,
  labels,
}: {
  documentIds: string[];
  next: string;
  labels: { agree: string; continue: string; mustAgree: string; offline: string; generic: string };
}) {
  const router = useRouter();
  const online = useOnline();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function accept() {
    if (!agreed) return setError(labels.mustAgree);
    setBusy(true);
    setError(undefined);
    const res = await api('/legal/accept', { method: 'POST', body: { documentIds } });
    if (res.ok) return router.push(next);
    setBusy(false);
    setError(
      res.error.code === 'OFFLINE' || res.error.code === 'NETWORK'
        ? labels.offline
        : labels.generic,
    );
  }

  return (
    <Stack spacing={4}>
      {!online && <InlineAlert tone="warning">{labels.offline}</InlineAlert>}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <Box
        component="label"
        sx={{
          display: 'flex',
          gap: 2,
          alignItems: 'flex-start',
          minBlockSize: 48,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          style={{ marginBlockStart: 4, inlineSize: 20, blockSize: 20 }}
        />
        <Text as="span">{labels.agree}</Text>
      </Box>
      <Stack direction="row">
        <Button onClick={() => void accept()} loading={busy} disabled={!online}>
          {labels.continue}
        </Button>
      </Stack>
    </Stack>
  );
}
