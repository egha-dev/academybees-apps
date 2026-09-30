'use client';

import MuiCard from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MuiSkeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import { type ReactNode } from 'react';

import { CheckCircleIcon, CircleIcon, ErrorIcon, InfoIcon, WarningIcon } from '../icons.js';
import { color, radius, type StatusTone } from '../tokens.js';
import { Text } from './text.js';

/** Card — used selectively (UX §4: avoid dashboard card overload). */
export function Card({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <MuiCard component="section">
      <CardContent sx={{ p: 5, '&:last-child': { pb: 5 } }}>
        <Stack spacing={3}>
          {(title || actions) && (
            <Stack
              direction="row"
              sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 3 }}
            >
              <Stack spacing={1}>
                {title && (
                  <Text variant="section" as="h2">
                    {title}
                  </Text>
                )}
                {subtitle && (
                  <Text variant="bodySmall" tone="secondary">
                    {subtitle}
                  </Text>
                )}
              </Stack>
              {actions}
            </Stack>
          )}
          {children}
        </Stack>
      </CardContent>
    </MuiCard>
  );
}

const TONE = {
  success: { fg: color.text.success, bg: color.surface.success, Icon: CheckCircleIcon },
  warning: { fg: color.text.warning, bg: color.surface.warning, Icon: WarningIcon },
  danger: { fg: color.text.danger, bg: color.surface.danger, Icon: ErrorIcon },
  info: { fg: color.text.info, bg: color.surface.info, Icon: InfoIcon },
  neutral: { fg: color.text.secondary, bg: color.neutral[100], Icon: CircleIcon },
} as const;

/** Status is never colour-only (UX §31): every badge has an icon and text. */
export function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  const { fg, bg, Icon } = TONE[tone];
  return (
    <Stack
      component="span"
      direction="row"

      sx={{
        alignItems: 'center',
        gap: 1,
        display: 'inline-flex',
        color: fg,
        backgroundColor: bg,
        borderRadius: `${radius.sm}px`,
        paddingInline: 2,
        paddingBlock: 0.5,
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.6,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon sx={{ fontSize: 16 }} aria-hidden />
      <span>{label}</span>
    </Stack>
  );
}

/** Skeletons for primary workspaces (UX §24, §32). `label` is announced to screen readers. */
export function Skeleton({
  label,
  variant = 'list',
  rows = 3,
}: {
  label: string;
  variant?: 'text' | 'list' | 'card';
  rows?: number;
}) {
  return (
    <Stack spacing={3} role="status" aria-busy="true" aria-label={label}>
      {variant === 'card' ? (
        <MuiSkeleton variant="rounded" height={140} />
      ) : (
        Array.from({ length: variant === 'text' ? 1 : rows }, (_, i) => (
          <Stack key={i} direction="row" sx={{ gap: 3, alignItems: 'center' }}>
            {variant === 'list' && <MuiSkeleton variant="circular" width={40} height={40} />}
            <Stack spacing={1} sx={{ flex: 1 }}>
              <MuiSkeleton variant="text" width="60%" />
              {variant === 'list' && <MuiSkeleton variant="text" width="35%" />}
            </Stack>
          </Stack>
        ))
      )}
    </Stack>
  );
}
