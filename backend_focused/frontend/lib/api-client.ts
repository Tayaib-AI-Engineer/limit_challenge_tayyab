import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

import { tokenStore } from './auth';

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api';

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15_000,
});

// Token endpoints use a bare client: no Authorization header and no 401 handling, so a
// failed refresh can never trigger another refresh.
const authClient = axios.create({ baseURL: apiBaseUrl, timeout: 15_000 });

export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired. Please sign in again.');
    this.name = 'SessionExpiredError';
  }
}

export async function requestTokens(username: string, password: string) {
  const { data } = await authClient.post<{ access: string; refresh: string }>('/auth/token/', {
    username,
    password,
  });
  return data;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

// One refresh in flight at a time: when several requests fail with 401 together (e.g. the
// first page load after a reload), they all wait for the same refresh, then retry.
let refreshInFlight: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  refreshInFlight ??= (async () => {
    const refresh = tokenStore.getRefreshToken();
    if (!refresh) throw new SessionExpiredError();
    try {
      const { data } = await authClient.post<{ access: string }>('/auth/token/refresh/', {
        refresh,
      });
      tokenStore.setAccessToken(data.access);
      return data.access;
    } catch (error) {
      // An invalid or expired refresh token ends the session. A network error doesn't:
      // a backend restart shouldn't sign everyone out.
      if (axios.isAxiosError(error) && error.response) {
        tokenStore.signOut('expired');
        throw new SessionExpiredError();
      }
      throw error;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/**
 * After a reload only the refresh token survives. Getting a new access token once, before
 * the page's queries start, avoids a burst of 401s (one per parallel request) followed by
 * retries.
 */
export async function ensureAccessToken(): Promise<void> {
  if (!tokenStore.getAccessToken()) await refreshAccessToken();
}

apiClient.interceptors.request.use((config) => {
  const token = tokenStore.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetriableConfig | undefined;
  if (error.response?.status !== 401 || !config || config._retried) {
    throw error;
  }
  config._retried = true;
  const sentToken = config.headers.Authorization;
  const currentToken = tokenStore.getAccessToken();
  // Another request already refreshed while this one was in flight: just retry.
  const token =
    currentToken && sentToken !== `Bearer ${currentToken}`
      ? currentToken
      : await refreshAccessToken();
  config.headers.Authorization = `Bearer ${token}`;
  return apiClient(config);
});
