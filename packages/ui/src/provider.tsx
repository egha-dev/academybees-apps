'use client';

import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { type ReactNode, useMemo } from 'react';

import { createAcademyBeeTheme } from './theme.js';
import { THEME_MODE_STORAGE_KEY, THEME_SCHEME_STORAGE_KEY } from './tokens.js';

/**
 * Theme + baseline for any AcademyBee surface. Follows the device (prefers-color-scheme) until
 * the user picks Light / Dark / System; the choice is remembered in localStorage (C-49).
 * Render <ThemeScript /> early in <body> so the right theme is set before first paint.
 */
export function UiProvider({ children }: { children: ReactNode }) {
  const theme = useMemo(() => createAcademyBeeTheme(), []);
  return (
    <ThemeProvider
      theme={theme}
      defaultMode="system"
      modeStorageKey={THEME_MODE_STORAGE_KEY}
      colorSchemeStorageKey={THEME_SCHEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
}
