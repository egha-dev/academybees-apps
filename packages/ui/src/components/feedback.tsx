'use client';

import Stack from '@mui/material/Stack';
import {
  createContext,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import { ErrorIcon, LockIcon } from '../icons.js';
import { Button } from './actions.js';
import { Text } from './text.js';
import type { ToastMessage, ToastTone } from './toast-view.js';

const ToastView = lazy(() => import('./toast-view.js'));

export type StateAction = { label: string; onClick?: () => void; href?: string };

function ActionButton({
  action,
  variant = 'primary',
}: {
  action: StateAction;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Button
      variant={variant}
      {...(action.onClick ? { onClick: action.onClick } : {})}
      {...(action.href ? { href: action.href } : {})}
    >
      {action.label}
    </Button>
  );
}

function StateLayout({
  icon,
  title,
  body,
  children,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <Stack
      spacing={3}
      sx={{
        alignItems: 'center',
        textAlign: 'center',
        paddingBlock: 10,
        paddingInline: 4,
        maxWidth: 480,
        marginInline: 'auto',
      }}
    >
      {icon}
      <Text variant="section" as="h2">
        {title}
      </Text>
      <Text tone="secondary">{body}</Text>
      {children && (
        <Stack
          direction="row"
          sx={{ gap: 2, flexWrap: 'wrap', justifyContent: 'center', paddingBlockStart: 2 }}
        >
          {children}
        </Stack>
      )}
    </Stack>
  );
}

/**
 * Empty state (UX §24): explains what to do next — the `action` is required, never just
 * "No data found".
 */
export function EmptyState({
  title,
  body,
  action,
  illustration,
}: {
  title: string;
  body: string;
  action: StateAction;
  illustration?: ReactNode;
}) {
  return (
    <StateLayout icon={illustration} title={title} body={body}>
      <ActionButton action={action} />
    </StateLayout>
  );
}

/** Error state: what happened + the next step, optionally a support reference (request ID). */
export function ErrorState({
  title,
  body,
  retry,
  secondary,
  reference,
}: {
  title: string;
  body: string;
  retry: StateAction;
  secondary?: StateAction;
  reference?: string;
}) {
  return (
    <StateLayout
      icon={<ErrorIcon sx={{ fontSize: 40, color: 'ab.status.danger.fg' }} aria-hidden />}
      title={title}
      body={body}
    >
      <ActionButton action={retry} />
      {secondary && <ActionButton action={secondary} variant="secondary" />}
      {reference && (
        <Stack sx={{ flexBasis: '100%' }}>
          <Text variant="meta" tone="secondary">
            {reference}
          </Text>
        </Stack>
      )}
    </StateLayout>
  );
}

/** Shown when the user lacks the capability for a screen or action. */
export function PermissionState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: StateAction;
}) {
  return (
    <StateLayout
      icon={<LockIcon sx={{ fontSize: 40, color: 'ab.textSecondary' }} aria-hidden />}
      title={title}
      body={body}
    >
      {action && <ActionButton action={action} variant="secondary" />}
    </StateLayout>
  );
}

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null);

/** Toasts for confirmations ("Attendance saved"). Announced politely to screen readers. */
export function ToastProvider({
  children,
  closeLabel,
}: {
  children: ReactNode;
  closeLabel: string;
}) {
  const [current, setCurrent] = useState<ToastMessage | null>(null);
  const show = useCallback((message: string, tone: ToastTone = 'success') => {
    setCurrent({ id: Date.now(), message, tone });
  }, []);
  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {current && (
        <Suspense fallback={null}>
          <ToastView current={current} closeLabel={closeLabel} onClose={() => setCurrent(null)} />
        </Suspense>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside <ToastProvider>');
  return show;
}
