'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';

export type ToastTone = 'success' | 'info' | 'warning' | 'error';
/** An action on the toast, e.g. Undo (G-26). */
export type ToastAction = { label: string; onClick: () => void };
export type ToastMessage = { id: number; message: string; tone: ToastTone; action?: ToastAction };

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
      // With an action (Undo) the toast stays long enough to use it (C-108).
      autoHideDuration={current?.action ? 8000 : 4000}
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
        {...(current?.action
          ? {
              action: (
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    current.action?.onClick();
                    onClose();
                  }}
                  sx={{ fontWeight: 700, textDecoration: 'underline' }}
                >
                  {current.action.label}
                </Button>
              ),
            }
          : {})}
      >
        {current?.message}
      </Alert>
    </Snackbar>
  );
}
