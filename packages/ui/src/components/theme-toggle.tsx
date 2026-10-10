'use client';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { useColorScheme } from '@mui/material/styles';
import { type ReactNode, useSyncExternalStore } from 'react';

import { DarkModeIcon, LightModeIcon, SystemModeIcon } from '../icons.js';
import { radius } from '../tokens.js';
import { plainControl } from './plain-button.js';

export type ThemeMode = 'light' | 'dark' | 'system';

export type ThemeToggleLabels = {
  /** Accessible name of the control, e.g. "Theme". */
  group: string;
  light: string;
  dark: string;
  system: string;
};

const noopSubscribe = () => () => undefined;

const OPTIONS: { mode: ThemeMode; icon: ReactNode }[] = [
  { mode: 'light', icon: <LightModeIcon sx={{ fontSize: 18 }} aria-hidden /> },
  { mode: 'dark', icon: <DarkModeIcon sx={{ fontSize: 18 }} aria-hidden /> },
  { mode: 'system', icon: <SystemModeIcon sx={{ fontSize: 18 }} aria-hidden /> },
];

/**
 * Light / Dark / System switch for the app shell (C-49). A radio group of three buttons — icon
 * plus visible text, never icon-only. `compact` hides the text on narrow top bars but keeps it
 * as the accessible name.
 */
export function ThemeModeToggle({
  labels,
  compact = false,
}: {
  labels: ThemeToggleLabels;
  compact?: boolean;
}) {
  const { mode, setMode } = useColorScheme();
  // The stored mode is only known on the client: the server snapshot (false) renders no
  // selection, so hydration matches; the client snapshot (true) shows the real mode.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const current: ThemeMode | undefined = mounted ? (mode ?? 'system') : undefined;

  return (
    <Stack
      role="radiogroup"
      aria-label={labels.group}
      direction="row"
      sx={{
        display: 'inline-flex',
        padding: 0.5,
        gap: 0.5,
        borderRadius: `${radius.md}px`,
        bgcolor: 'ab.surfaceRaised',
      }}
    >
      {OPTIONS.map(({ mode: option, icon }) => {
        const selected = current === option;
        return (
          <Box
            component="button"
            type="button"
            key={option}
            role="radio"
            aria-checked={selected}
            aria-label={labels[option]}
            title={labels[option]}
            onClick={() => setMode(option)}
            sx={{
              ...plainControl,
              gap: 1,
              minHeight: 40,
              minWidth: 40,
              paddingInline: compact ? 1.5 : 3,
              borderRadius: `${radius.sm}px`,
              fontSize: 13,
              fontWeight: 600,
              color: selected ? 'ab.textPrimary' : 'ab.textSecondary',
              bgcolor: selected ? 'ab.surface' : 'transparent',
              boxShadow: selected ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
            }}
          >
            {icon}
            {!compact && <span>{labels[option]}</span>}
          </Box>
        );
      })}
    </Stack>
  );
}
