'use client';

import Typography from '@mui/material/Typography';
import { type ElementType, type ReactNode } from 'react';

const VARIANTS = {
  display: { variant: 'h1', component: 'h1' },
  title: { variant: 'h2', component: 'h1' },
  section: { variant: 'h3', component: 'h2' },
  body: { variant: 'body1', component: 'p' },
  bodySmall: { variant: 'body2', component: 'p' },
  meta: { variant: 'caption', component: 'span' },
} as const;

export type TextVariant = keyof typeof VARIANTS;

/** Text on the UX §6 type scale. `as` overrides the element (e.g. a section title as h3). */
export function Text({
  variant = 'body',
  as,
  tone = 'primary',
  children,
  id,
}: {
  variant?: TextVariant;
  as?: ElementType;
  tone?: 'primary' | 'secondary';
  children: ReactNode;
  id?: string;
}) {
  const v = VARIANTS[variant];
  return (
    <Typography
      variant={v.variant}
      component={as ?? v.component}
      color={tone === 'secondary' ? 'text.secondary' : 'text.primary'}
      {...(id ? { id } : {})}
    >
      {children}
    </Typography>
  );
}
