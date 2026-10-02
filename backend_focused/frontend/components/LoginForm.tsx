'use client';

import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { requestTokens } from '@/lib/api-client';
import { safeNextPath, tokenStore, useIsSignedIn } from '@/lib/auth';
import { toApiProblem } from '@/lib/errors';

// Prefilled with the demo account that `seed_fleet` creates, so reviewers can sign in with
// one click. Local demo convenience only: a real deployment would start with empty fields.
const DEMO_USERNAME = 'demo';
const DEMO_PASSWORD = 'demo-password';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const expired = params.get('expired') === '1';
  const signedIn = useIsSignedIn();

  const [username, setUsername] = useState(DEMO_USERNAME);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in (e.g. the login page was bookmarked): go straight on.
  useEffect(() => {
    if (signedIn) router.replace(next);
  }, [signedIn, next, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const tokens = await requestTokens(username.trim(), password);
      tokenStore.signIn(tokens, username.trim());
      // The effect above redirects once the session store reports the sign-in.
    } catch (caught) {
      const problem = toApiProblem(caught);
      setError(
        problem.kind === 'unauthorized' ? 'Incorrect username or password.' : problem.message,
      );
      setSubmitting(false);
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', px: 2 }}>
      <Paper
        component="form"
        onSubmit={handleSubmit}
        noValidate
        sx={{ p: 4, width: '100%', maxWidth: 400 }}
      >
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <LocalShippingOutlinedIcon color="primary" />
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
              Fleet Maintenance
            </Typography>
          </Stack>
          {expired && !error && (
            <Alert severity="info">Your session expired. Please sign in again.</Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          <Button
            type="submit"
            variant="contained"
            size="large"
            loading={submitting}
            disabled={!username.trim() || !password}
          >
            Sign in
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
