'use client';

import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

import { SnackbarProvider } from '@/components/SnackbarProvider';
import { getQueryClient } from '@/lib/query-client';

const theme = createTheme({
  palette: {
    primary: { main: '#0f62fe' },
    background: { default: '#f5f7fb' },
  },
  shape: { borderRadius: 8 },
  // The layout loads Geist; without this MUI asks for Roboto, which is never loaded.
  typography: { fontFamily: 'var(--font-geist-sans), Arial, sans-serif' },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { defaultProps: { variant: 'outlined' } },
  },
});

export default function Providers({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SnackbarProvider>{children}</SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
