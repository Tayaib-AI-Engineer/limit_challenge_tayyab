'use client';

import { Alert, AlertTitle, Box, Button } from '@mui/material';
import { useEffect } from 'react';

// Catches rendering bugs. API failures are shown inline by each page instead (error
// boundaries don't catch errors from async data fetching).
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', mt: 8, px: 2 }}>
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => unstable_retry()}>
            Try again
          </Button>
        }
      >
        <AlertTitle>Something went wrong</AlertTitle>
        This page failed to display. Try again, or go back to the previous page.
      </Alert>
    </Box>
  );
}
