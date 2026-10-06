'use client';

import { Button } from '@academybee/ui/components/actions';
import { useToast } from '@academybee/ui/components/feedback';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { securityErrorMessage, type SecurityErrorLabels } from './errors';

/**
 * Sign out one other device, or every other one (G-11). The list is re-read from the server
 * afterwards; a device that is already gone just disappears.
 */
export function SessionAction({
  sessionId,
  label,
  done,
  errors,
  variant = 'secondary',
}: {
  /** One device; omit for "all other devices". */
  sessionId?: string;
  label: string;
  done: string;
  errors: SecurityErrorLabels;
  variant?: 'secondary' | 'ghost';
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const res = await api(
      sessionId
        ? `/auth/sessions/${encodeURIComponent(sessionId)}/revoke`
        : '/auth/sessions/revoke-others',
      { method: 'POST' },
    );
    setBusy(false);
    toast(
      res.ok || res.error.code === 'NOT_FOUND' ? done : securityErrorMessage(res.error, errors),
    );
    router.refresh();
  }

  return (
    <Button
      variant={variant}
      size="small"
      loading={busy}
      disabled={!online}
      onClick={() => void run()}
    >
      {label}
    </Button>
  );
}
