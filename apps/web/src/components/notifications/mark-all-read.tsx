'use client';

import { useToast } from '@academybee/ui/components/feedback';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

/** Clear every unread notification of mine (online only). */
export function MarkAllRead({ labels }: { labels: { markAll: string; marked: string } }) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  return (
    <PlainButton
      variant="secondary"
      busy={busy}
      disabled={!online}
      onClick={() => {
        setBusy(true);
        void api('/notifications/read', { method: 'POST', body: { all: true } }).then((res) => {
          setBusy(false);
          if (res.ok) {
            toast(labels.marked);
            router.refresh();
          }
        });
      }}
    >
      {labels.markAll}
    </PlainButton>
  );
}
