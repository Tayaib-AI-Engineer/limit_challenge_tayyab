'use client';

import { Box, CircularProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, type PropsWithChildren } from 'react';

import { ensureAccessToken } from '@/lib/api-client';
import { tokenStore, useIsSignedIn } from '@/lib/auth';
import { getQueryClient } from '@/lib/query-client';

/**
 * Client-side route guard. The session lives in the browser (see lib/auth.ts), which a
 * server-side check (Next's proxy.ts) can't read. Data on these pages is fetched by the
 * browser with the user's token, so nothing protected reaches the page before this runs.
 */
export function AuthGate({ children }: PropsWithChildren) {
  const signedIn = useIsSignedIn();
  const router = useRouter();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      await ensureAccessToken();
      return true;
    },
    enabled: signedIn === true,
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    if (signedIn !== false) return;
    getQueryClient().clear(); // nothing from the previous session stays in memory
    const reason = tokenStore.getLastLogoutReason();
    if (reason === 'signed-out') {
      router.replace('/login');
      return;
    }
    // Come back to the same page, filters included, after signing in.
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    router.replace(`/login?next=${next}${reason === 'expired' ? '&expired=1' : ''}`);
  }, [signedIn, router]);

  // On a network error the pages still render and show their own "can't reach the API".
  if (!signedIn || session.isPending) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <CircularProgress aria-label="Checking your session" />
      </Box>
    );
  }
  return children;
}
