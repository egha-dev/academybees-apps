'use client';

import { Button, color, radius, Stack, Text } from '@academybee/ui';
import { useSerwist } from '@serwist/turbopack/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

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
  const t = useTranslations('shell.pwa');
  const { serwist } = useSerwist();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [updateWaiting, setUpdateWaiting] = useState(false);

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
    const onControlling = () => window.location.reload();
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
        title={t('updateAvailable')}
        primary={{ label: t('update'), onClick: () => serwist?.messageSkipWaiting() }}
        secondary={{ label: t('later'), onClick: () => setUpdateWaiting(false) }}
      />
    );
  }
  if (installEvent) {
    return (
      <Prompt
        title={t('install')}
        body={t('installBody')}
        primary={{
          label: t('install'),
          onClick: () => {
            void installEvent.prompt();
            setInstallEvent(null);
          },
        }}
        secondary={{
          label: t('later'),
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
