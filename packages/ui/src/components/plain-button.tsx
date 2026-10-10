'use client';

import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import type { MouseEventHandler, ReactNode } from 'react';

import { radius, TOUCH_TARGET } from '../tokens.js';

/**
 * Resets a native `<button>` / `<a>` into a flex control. Shell-level controls use native elements
 * with these styles instead of MUI `ButtonBase`, whose ripple and transition code would otherwise
 * be in every signed-in page's first-load JS (G-24, C-99). Focus rings come from the global
 * `:focus-visible` rule in the theme baseline.
 */
export const plainControl = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: 0,
  border: 0,
  padding: 0,
  background: 'none',
  color: 'inherit',
  font: 'inherit',
  textDecoration: 'none',
  cursor: 'pointer',
  userSelect: 'none',
  WebkitTapHighlightColor: 'transparent',
  '&:disabled, &[aria-disabled="true"]': { cursor: 'default', opacity: 0.6 },
} as const;

/**
 * A button (or link styled as one) for places that render on every page: sign-out in the shell's
 * account area, and the actions of empty / error / permission states. Looks like `Button`'s
 * primary / secondary / ghost variants without loading MUI's button code (C-99). Forms keep
 * `Button` (spinner, sizes, icons).
 */
export function PlainButton({
  children,
  variant = 'secondary',
  onClick,
  href,
  disabled,
  busy = false,
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  onClick?: MouseEventHandler<HTMLElement>;
  /** Renders a link that looks like the button. */
  href?: string;
  disabled?: boolean;
  /** Blocks repeat clicks while working; announced as busy. */
  busy?: boolean;
}) {
  const sx: SxProps<Theme> = (t) => {
    const primary = t.vars?.palette.primary ?? t.palette.primary;
    const channel = t.vars?.palette.primary.mainChannel ?? '0 0 0';
    return {
      ...plainControl,
      minHeight: TOUCH_TARGET,
      paddingInline: '20px',
      borderRadius: `${radius.md}px`,
      ...t.typography.button,
      ...(variant === 'primary'
        ? {
            color: primary.contrastText,
            backgroundColor: primary.main,
            border: '1px solid transparent',
            '&:hover:not(:disabled)': { backgroundColor: primary.dark },
          }
        : {
            color: primary.main,
            border:
              variant === 'secondary'
                ? `1px solid rgba(${channel} / 0.5)`
                : '1px solid transparent',
            '&:hover:not(:disabled)': { backgroundColor: `rgba(${channel} / 0.06)` },
          }),
    };
  };
  if (href)
    return (
      <Box component="a" href={href} onClick={onClick} sx={sx}>
        {children}
      </Box>
    );
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      sx={sx}
    >
      {children}
    </Box>
  );
}
