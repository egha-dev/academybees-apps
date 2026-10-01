'use client';

import { Button } from '@academybee/ui/components/actions';
import { Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { color, radius } from '@academybee/ui/tokens';
import { useSerwist } from '@serwist/turbopack/react';
import { useEffect, useRef, useState } from 'react';

import { useShellLabels } from './shell-labels';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<unknown>;
};

const DISMISS_KEY = 'ab:install-dismissed';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function Prompt({
  title,
  body,
  primary,
  secondary,
}: {
  title: string;
  body?: string;
  primary: { label: string; onClick: () => void };
  secondary: { label: string; onClick: () => void };
}) {
  return (
    <Stack
      role="region"
      aria-label={title}
      spacing={2}
      sx={{
        position: 'fixed',
        insetInline: 16,
        insetBlockEnd: 'calc(16px + env(safe-area-inset-bottom))',
        maxWidth: 440,
        marginInline: 'auto',
        padding: 4,
        borderRadius: `${radius.lg}px`,
        backgroundColor: color.white,
        border: `1px solid ${color.neutral[200]}`,
        boxShadow: '0 8px 24px rgba(23,24,23,0.12)',
        zIndex: 1400,
      }}
    >
      <Text variant="bodySmall">{title}</Text>
      {body && (
        <Text variant="meta" tone="secondary">
          {body}
        </Text>
      )}
      <Stack direction="row" spacing={2} sx={{ justifyContent: 'flex-end' }}>
        <Button variant="ghost" size="small" onClick={secondary.onClick}>
          {secondary.label}
        </Button>
        <Button size="small" onClick={primary.onClick}>
          {primary.label}
        </Button>
      </Stack>
    </Stack>
  );
}

/**
 * PWA prompts (ADR-015): offer install when the browser allows it (never nag after dismissal),
 * and offer "Update now" when a new service worker is waiting — the user decides when to reload,
 * so an in-progress form is never lost.
 */
export function PwaPrompts() {
  const labels = useShellLabels();
  const { serwist } = useSerwist();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [updateWaiting, setUpdateWaiting] = useState(false);
  const updateAccepted = useRef(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      if (!readDismissed()) setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  useEffect(() => {
    if (!serwist) return;
    const onWaiting = () => setUpdateWaiting(true);
    // Reload only when the user accepted an update — the first install also fires `controlling`
    // and must not reload the page under the user.
    const onControlling = (event: { isUpdate?: boolean }) => {
      if (event.isUpdate && updateAccepted.current) window.location.reload();
    };
    serwist.addEventListener('waiting', onWaiting);
    serwist.addEventListener('controlling', onControlling);
    return () => {
      serwist.removeEventListener('waiting', onWaiting);
      serwist.removeEventListener('controlling', onControlling);
    };
  }, [serwist]);

  if (updateWaiting) {
    return (
      <Prompt
        title={labels.updateAvailable}
        primary={{
          label: labels.update,
          onClick: () => {
            updateAccepted.current = true;
            serwist?.messageSkipWaiting();
          },
        }}
        secondary={{ label: labels.later, onClick: () => setUpdateWaiting(false) }}
      />
    );
  }
  if (installEvent) {
    return (
      <Prompt
        title={labels.install}
        body={labels.installBody}
        primary={{
          label: labels.install,
          onClick: () => {
            void installEvent.prompt();
            setInstallEvent(null);
          },
        }}
        secondary={{
          label: labels.later,
          onClick: () => {
            try {
              window.localStorage.setItem(DISMISS_KEY, '1');
            } catch {
              // storage unavailable (private mode) — just hide for this session
            }
            setInstallEvent(null);
          },
        }}
      />
    );
  }
  return null;
}
