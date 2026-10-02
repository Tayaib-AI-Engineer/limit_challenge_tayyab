import { isServer, QueryClient } from '@tanstack/react-query';

import { isClientError } from './errors';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Coming back to a list (e.g. from a vehicle's page) renders from cache instantly.
        staleTime: 30_000,
        // A 4xx won't change on retry; the default (3 retries with backoff) would delay
        // showing a 404 or a validation error by several seconds.
        retry: (failureCount, error) => !isClientError(error) && failureCount < 2,
      },
      mutations: { retry: false },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/** One client per server render, a single shared one in the browser (TanStack's App Router pattern). */
export function getQueryClient() {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
