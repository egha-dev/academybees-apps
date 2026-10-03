'use client';

import { Button } from '@academybee/ui/components/actions';
import { useToast } from '@academybee/ui/components/feedback';
import { Stack } from '@academybee/ui/components/layout';
import { ConfirmDialog } from '@academybee/ui/components/overlays';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { REFRESH_AFTER, teamErrorMessage, type TeamErrorLabels } from './errors';

export type InvitationActionLabels = {
  resend: string;
  revoke: string;
  resent: string;
  revoked: string;
  revokeTitle: string;
  revokeBody: string;
  keep: string;
  errors: TeamErrorLabels;
};

/** Resend or revoke a pending invitation (C-67). Revoking asks first; results are toasts. */
export function InvitationActions({ id, labels }: { id: string; labels: InvitationActionLabels }) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [busy, setBusy] = useState<'resend' | 'revoke'>();
  const [confirming, setConfirming] = useState(false);

  async function act(action: 'resend' | 'revoke') {
    setBusy(action);
    const res = await api(`/team/invitations/${id}/${action}`, { method: 'POST', body: {} });
    setBusy(undefined);
    setConfirming(false);
    if (res.ok) toast(action === 'resend' ? labels.resent : labels.revoked);
    else toast(teamErrorMessage(res.error, labels.errors), 'error');
    if (res.ok || REFRESH_AFTER.has(res.error.code)) router.refresh();
  }

  return (
    <Stack direction="row" spacing={2}>
      <Button
        variant="secondary"
        size="small"
        onClick={() => void act('resend')}
        loading={busy === 'resend'}
        disabled={!online || Boolean(busy)}
      >
        {labels.resend}
      </Button>
      <Button
        variant="ghost"
        size="small"
        onClick={() => setConfirming(true)}
        disabled={!online || Boolean(busy)}
      >
        {labels.revoke}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={labels.revokeTitle}
        body={labels.revokeBody}
        cancelLabel={labels.keep}
        confirmLabel={labels.revoke}
        tone="danger"
        busy={busy === 'revoke'}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void act('revoke')}
      />
    </Stack>
  );
}
