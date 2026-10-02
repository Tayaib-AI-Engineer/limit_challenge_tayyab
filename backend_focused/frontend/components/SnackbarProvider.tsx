'use client';

import { Alert, Snackbar, type AlertColor } from '@mui/material';
import { createContext, useCallback, useContext, useState, type PropsWithChildren } from 'react';

type Notify = (message: string, severity?: AlertColor) => void;

const NotifyContext = createContext<Notify>(() => {});

type Toast = { key: number; message: string; severity: AlertColor };

/** One toast at a time; a new one replaces the current one. */
export function SnackbarProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [open, setOpen] = useState(false);

  const notify = useCallback<Notify>((message, severity = 'success') => {
    setToast({ key: Date.now(), message, severity });
    setOpen(true);
  }, []);

  return (
    <NotifyContext.Provider value={notify}>
      {children}
      <Snackbar
        key={toast?.key}
        open={open}
        autoHideDuration={5000}
        onClose={(_, reason) => reason !== 'clickaway' && setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setOpen(false)}
          severity={toast?.severity ?? 'success'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {toast?.message}
        </Alert>
      </Snackbar>
    </NotifyContext.Provider>
  );
}

export function useNotify() {
  return useContext(NotifyContext);
}
