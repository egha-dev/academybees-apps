'use client';

import Typography from '@mui/material/Typography';
import type { ElementType, ReactNode } from 'react';

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
      // Semantic roles resolve to CSS variables, so text follows the colour scheme of its
      // subtree (e.g. the console's dark sidebar), not only the page's.
      sx={{ color: tone === 'secondary' ? 'ab.textSecondary' : 'ab.textPrimary' }}
      {...(id ? { id } : {})}
    >
      {children}
    </Typography>
  );
}
