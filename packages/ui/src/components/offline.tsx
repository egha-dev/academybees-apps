'use client';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';

import {
  CloudDoneIcon,
  CloudOffIcon,
  CloudUploadIcon,
  SyncIcon,
  SyncProblemIcon,
} from '../icons.js';
import { radius } from '../tokens.js';

/** Global offline banner (ARCHITECTURE §11.6). Render only while offline. */
export function OfflineBanner({ message }: { message: string }) {
  return (
    <Stack
      role="status"
      aria-live="polite"
      direction="row"

      sx={{
        alignItems: 'center',
        gap: 2,
        bgcolor: 'ab.inverse',
        color: 'ab.onInverse',
        paddingInline: 4,
        paddingBlock: 2,
        fontSize: 14,
      }}
    >
      <CloudOffIcon sx={{ fontSize: 18 }} aria-hidden />
      <span>{message}</span>
    </Stack>
  );
}

export type SyncState = 'synced' | 'offline' | 'pending' | 'syncing' | 'attention';

const SYNC = {
  synced: { Icon: CloudDoneIcon, fg: 'ab.status.success.fg' },
  offline: { Icon: CloudOffIcon, fg: 'ab.textSecondary' },
  pending: { Icon: CloudUploadIcon, fg: 'ab.status.warning.fg' },
  syncing: { Icon: SyncIcon, fg: 'ab.status.info.fg' },
  attention: { Icon: SyncProblemIcon, fg: 'ab.status.danger.fg' },
} as const;

/**
 * Connection + sync status for every shell (ARCHITECTURE §11.6): always icon + text.
 * The engine (packages/sync) supplies the state and translated `label`/`detail`.
 */
export function SyncIndicator({
  state,
  label,
  detail,
}: {
  state: SyncState;
  label: string;
  detail?: string;
}) {
  const { Icon, fg } = SYNC[state];
  return (
    <Stack
      role="status"
      aria-live="polite"
      direction="row"

      sx={{
        alignItems: 'center',
        gap: 1.5,
        color: fg,
        fontSize: 13,
        fontWeight: 600,
        borderRadius: `${radius.sm}px`,
        minHeight: 32,
      }}
    >
      <Icon
        sx={{
          fontSize: 18,
          ...(state === 'syncing'
            ? {
                animation: 'ab-spin 1.2s linear infinite',
                '@keyframes ab-spin': { to: { transform: 'rotate(360deg)' } },
              }
            : {}),
        }}
        aria-hidden
      />
      <span>{label}</span>
      {detail && (
        <Box component="span" sx={{ color: 'ab.textSecondary', fontWeight: 400 }}>
          {detail}
        </Box>
      )}
    </Stack>
  );
}
