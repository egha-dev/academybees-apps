'use client';

import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { type ReactNode, useMemo } from 'react';

import { createAcademyBeeTheme } from './theme.js';

/** Theme + baseline for any AcademyBee surface. */
export function UiProvider({ children }: { children: ReactNode }) {
  const theme = useMemo(() => createAcademyBeeTheme(), []);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
