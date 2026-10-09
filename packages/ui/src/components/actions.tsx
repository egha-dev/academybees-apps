'use client';

import MuiButton from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import MuiIconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import type { MouseEventHandler, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const MUI_VARIANT = {
  primary: { variant: 'contained', color: 'primary' },
  secondary: { variant: 'outlined', color: 'primary' },
  ghost: { variant: 'text', color: 'primary' },
  danger: { variant: 'contained', color: 'error' },
} as const;

export type ButtonProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: 'medium' | 'small';
  onClick?: MouseEventHandler<HTMLButtonElement>;
  href?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
  /** Shows a spinner and blocks repeat clicks (e.g. while saving). */
  loading?: boolean;
  startIcon?: ReactNode;
  fullWidth?: boolean;
};

export function Button({
  children,
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled,
  startIcon,
  type = 'button',
  ...rest
}: ButtonProps) {
  const mui = MUI_VARIANT[variant];
  return (
    <MuiButton
      {...mui}
      {...rest}
      size={size}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      startIcon={loading ? <CircularProgress size={16} color="inherit" aria-hidden /> : startIcon}
    >
      {children}
    </MuiButton>
  );
}

/** Icon-only button; `label` is required for screen readers (UX §31). */
export function IconButton({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
}) {
  return (
    <MuiIconButton aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      {children}
    </MuiIconButton>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} underline="hover" color="inherit" sx={{ fontWeight: 600 }}>
      {children}
    </Link>
  );
}
