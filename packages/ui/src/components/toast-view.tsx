'use client';

import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';

export type ToastTone = 'success' | 'info' | 'warning' | 'error';
export type ToastMessage = { id: number; message: string; tone: ToastTone };

/** Snackbar + Alert, loaded on the first toast so they stay out of every page's initial JS (G-24). */
export default function ToastView({
  current,
  closeLabel,
  onClose,
}: {
  current: ToastMessage | null;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <Snackbar
      key={current?.id}
      open={current !== null}
      autoHideDuration={4000}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        severity={current?.tone ?? 'success'}
        variant="filled"
        onClose={onClose}
        slotProps={{ closeButton: { 'aria-label': closeLabel, title: closeLabel } }}
        role="status"
        aria-live="polite"
      >
        {current?.message}
      </Alert>
    </Snackbar>
  );
}
