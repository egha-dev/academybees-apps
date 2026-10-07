'use client';

import { Button } from '@academybee/ui/components/actions';
import { useToast } from '@academybee/ui/components/feedback';
import { useRouter } from 'next/navigation';
import { lazy, Suspense, useState } from 'react';

import { useOnline } from '@/lib/use-online';

import type { PasswordChangeLabels } from './password-change-sheet';

// The form loads when the button is pressed (G-24).
const PasswordChangeSheet = lazy(() =>
  import('./password-change-sheet').then((m) => ({ default: m.PasswordChangeSheet })),
);

export type { PasswordChangeLabels };

/** "Change password" on the Security page (G-11); the sheet signs out every other device. */
export function PasswordChange({ labels }: { labels: PasswordChangeLabels }) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={!online}>
        {labels.open}
      </Button>
      {open && (
        <Suspense fallback={null}>
          <PasswordChangeSheet
            labels={labels}
            onClose={(changed) => {
              setOpen(false);
              if (!changed) return;
              toast(labels.changed);
              router.refresh();
            }}
          />
        </Suspense>
      )}
    </>
  );
}
