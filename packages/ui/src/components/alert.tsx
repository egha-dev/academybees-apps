'use client';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { type ReactNode } from 'react';

import { CheckCircleIcon, ErrorIcon, InfoIcon, WarningIcon } from '../icons.js';
import { radius, type StatusTone } from '../tokens.js';

const TONE = {
  success: { fg: 'ab.status.success.fg', bg: 'ab.status.success.surface', Icon: CheckCircleIcon },
  warning: { fg: 'ab.status.warning.fg', bg: 'ab.status.warning.surface', Icon: WarningIcon },
  danger: { fg: 'ab.status.danger.fg', bg: 'ab.status.danger.surface', Icon: ErrorIcon },
  info: { fg: 'ab.status.info.fg', bg: 'ab.status.info.surface', Icon: InfoIcon },
} as const;

/**
 * A message about a form or section (sign-in errors, "check your email"). Icon + text, so status
 * is never colour-only; errors are announced at once (`alert`), the rest politely (`status`).
 */
export function InlineAlert({
  tone,
  children,
}: {
  tone: Exclude<StatusTone, 'neutral'>;
  children: ReactNode;
}) {
  const { fg, bg, Icon } = TONE[tone];
  return (
    <Stack
      role={tone === 'danger' ? 'alert' : 'status'}
      direction="row"
      sx={{
        gap: 2,
        alignItems: 'flex-start',
        color: fg,
        backgroundColor: bg,
        borderRadius: `${radius.md}px`,
        paddingInline: 3,
        paddingBlock: 2.5,
      }}
    >
      <Icon sx={{ fontSize: 20, marginBlockStart: '2px', flexShrink: 0 }} aria-hidden />
      <Typography variant="body2" component="span" sx={{ color: 'inherit' }}>
        {children}
      </Typography>
    </Stack>
  );
}
