'use client';

// The Security page's buttons. This route sits at the 200 KB budget (G-24), so the page ships only
// these buttons; what they do (sheets, forms, QR code, API calls, toasts) loads on the first press.
import { Button } from '@academybee/ui/components/actions';
import { type ComponentProps, lazy, Suspense, useState } from 'react';

import { useOnline } from '@/lib/use-online';

import type { SecurityAction, SecurityHostLabels } from './security-host';

const SecurityHost = lazy(() =>
  import('./security-host').then((m) => ({ default: m.SecurityHost })),
);
const Rule = lazy(() => import('./mfa-rule').then((m) => ({ default: m.MfaRule })));

export type { SecurityAction, SecurityHostLabels };

/** One Security action; online only (CLAUDE.md §11). */
export function SecurityButton({
  action,
  label,
  labels,
  variant = 'secondary',
  size = 'medium',
}: {
  action: SecurityAction;
  label: string;
  labels: SecurityHostLabels;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'medium' | 'small';
}) {
  const online = useOnline();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        disabled={!online}
        loading={open && action.kind === 'revoke'}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      {open && (
        <Suspense fallback={null}>
          <SecurityHost action={action} labels={labels} onDone={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

/** The academy's 2FA rule editor, loaded only for people who manage settings. */
export function MfaRuleLazy(props: ComponentProps<typeof Rule>) {
  return (
    <Suspense fallback={null}>
      <Rule {...props} />
    </Suspense>
  );
}
