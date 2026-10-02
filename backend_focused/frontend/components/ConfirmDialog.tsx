'use client';

import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  pending: boolean;
  error?: string | null;
  destructive?: boolean;
};

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
  pending,
  error,
  destructive,
}: Props) {
  return (
    // Can't be dismissed while the request runs, so it can't be submitted twice.
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText component="div">{children}</DialogContentText>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={destructive ? 'error' : 'primary'}
          onClick={onConfirm}
          loading={pending}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
