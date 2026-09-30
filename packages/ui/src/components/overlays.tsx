'use client';

import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Drawer from '@mui/material/Drawer';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { type ReactNode, useId } from 'react';

import { CloseIcon } from '../icons.js';
import { radius } from '../tokens.js';
import { Button, IconButton } from './actions.js';
import { Text } from './text.js';

/**
 * Confirmation for destructive or consequential actions (UX §24): `body` states the
 * consequence in plain language; the safe choice is the default focus.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  tone = 'default',
  busy = false,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: 'default' | 'danger';
  busy?: boolean;
}) {
  const titleId = useId();
  const bodyId = useId();
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onCancel}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent>
        <Text tone="secondary" id={bodyId}>
          {body}
        </Text>
      </DialogContent>
      <DialogActions sx={{ padding: 4, gap: 2 }}>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === 'danger' ? 'danger' : 'primary'}
          onClick={onConfirm}
          loading={busy}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Contextual panel (UX §10: drawers/sheets over page hops): a side drawer from the inline end
 * on desktop, a bottom sheet on phones.
 */
export function Sheet({
  open,
  onClose,
  title,
  closeLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('md'));
  const titleId = useId();
  const inlineEnd = theme.direction === 'rtl' ? 'left' : 'right';
  return (
    <Drawer
      anchor={phone ? 'bottom' : inlineEnd}
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          'aria-labelledby': titleId,
          sx: phone
            ? {
                borderStartStartRadius: radius.lg,
                borderStartEndRadius: radius.lg,
                maxHeight: '85vh',
              }
            : { width: 420, maxWidth: '100vw' },
        },
      }}
    >
      <Stack spacing={3} sx={{ padding: 5 }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="section" as="h2" id={titleId}>
            {title}
          </Text>
          <IconButton label={closeLabel} onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
        {children}
      </Stack>
    </Drawer>
  );
}
