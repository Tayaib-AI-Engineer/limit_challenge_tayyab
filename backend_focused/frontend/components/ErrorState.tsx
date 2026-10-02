'use client';

import { Alert, AlertTitle, Button } from '@mui/material';

import { toApiProblem } from '@/lib/errors';

type Props = {
  title: string;
  error: unknown;
  onRetry?: () => void;
};

/** A failed load, shown where the content would have been, with a way to try again. */
export function ErrorState({ title, error, onRetry }: Props) {
  const problem = toApiProblem(error);
  return (
    <Alert
      severity="error"
      action={
        onRetry && problem.kind !== 'not-found' ? (
          <Button color="inherit" size="small" onClick={onRetry}>
            Retry
          </Button>
        ) : undefined
      }
    >
      <AlertTitle>{title}</AlertTitle>
      {problem.message}
    </Alert>
  );
}
