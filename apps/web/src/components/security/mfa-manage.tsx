'use client';

import { Button } from '@academybee/ui/components/actions';
import { useToast } from '@academybee/ui/components/feedback';
import { Stack } from '@academybee/ui/components/layout';
import { useRouter } from 'next/navigation';
import { lazy, Suspense, useState } from 'react';

import { useOnline } from '@/lib/use-online';

import type { Flow, MfaManageLabels } from './mfa-flow';

// The flows (sheet, QR code, code and password forms) load when a button is pressed (G-24).
const MfaFlowSheet = lazy(() => import('./mfa-flow').then((m) => ({ default: m.MfaFlowSheet })));

export type { MfaManageLabels };

/**
 * Two-step sign-in on the Security page (G-11, C-80). Off: set it up — current password, scan the
 * QR code, confirm a code, save the ten recovery codes. On: new recovery codes (password first)
 * and, unless the academy requires it, turn it off (password first; an alert email follows).
 * Online only; each finished change refreshes the page from the server.
 */
export function MfaManage({
  enabled,
  required,
  labels,
}: {
  enabled: boolean;
  required: boolean;
  labels: MfaManageLabels;
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [flow, setFlow] = useState<Flow>();

  const closed = (changed: boolean) => {
    const done = flow;
    setFlow(undefined);
    if (!changed) return;
    toast(
      done === 'setup' ? labels.enabled : done === 'codes' ? labels.newCodesDone : labels.disabled,
    );
    router.refresh();
  };

  return (
    <>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
        {enabled ? (
          <>
            <Button variant="secondary" onClick={() => setFlow('codes')} disabled={!online}>
              {labels.newCodes}
            </Button>
            {!required && (
              <Button variant="ghost" onClick={() => setFlow('off')} disabled={!online}>
                {labels.turnOff}
              </Button>
            )}
          </>
        ) : (
          <Button onClick={() => setFlow('setup')} disabled={!online}>
            {labels.setUp}
          </Button>
        )}
      </Stack>
      {flow && (
        <Suspense fallback={null}>
          <MfaFlowSheet flow={flow} onClose={closed} labels={labels} />
        </Suspense>
      )}
    </>
  );
}
