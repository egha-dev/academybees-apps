'use client';

import { Button } from '@academybee/ui/components/actions';
import { useToast } from '@academybee/ui/components/feedback';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { consoleErrorMessage } from './errors';

/** A fresh owner invitation; the earlier link stops working (C-67). */
export function ResendInvite({ id, email }: { id: string; email: string }) {
  const t = useTranslations('console');
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      size="small"
      loading={busy}
      disabled={!online}
      onClick={() => {
        setBusy(true);
        void api(`/platform/tenants/${id}/owner-invite/resend`, {
          method: 'POST',
          headers: { 'idempotency-key': crypto.randomUUID() },
          body: {},
        }).then((res) => {
          setBusy(false);
          toast(res.ok ? t('detail.actions.resent', { email }) : consoleErrorMessage(res.error, t));
          if (res.ok) router.refresh();
        });
      }}
    >
      {t('detail.actions.resend')}
    </Button>
  );
}
