import { useSyncExternalStore } from 'react';

// The access token (1 hour) lives only in memory; the refresh token (1 day) is kept in
// localStorage so that a reload or a new tab stays signed in. After a reload the first
// API call gets a 401 and is retried with a freshly refreshed access token.
//
// Tradeoff: anything in localStorage is readable by a successful XSS. The production
// alternative is an httpOnly cookie behind a same-origin proxy (see the README).

const REFRESH_KEY = 'fleet.refreshToken';
const USERNAME_KEY = 'fleet.username';

export type LogoutReason = 'signed-out' | 'expired';

let accessToken: string | null = null;
let lastLogoutReason: LogoutReason | null = null;
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // storage blocked (private mode, disabled cookies)
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Without storage the session simply won't survive a reload.
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

export const tokenStore = {
  getAccessToken: () => accessToken,
  getRefreshToken: () => read(REFRESH_KEY),
  getUsername: () => read(USERNAME_KEY),
  getLastLogoutReason: () => lastLogoutReason,

  signIn(tokens: { access: string; refresh: string }, username: string) {
    accessToken = tokens.access;
    lastLogoutReason = null;
    write(REFRESH_KEY, tokens.refresh);
    write(USERNAME_KEY, username);
    emit();
  },

  setAccessToken(token: string) {
    accessToken = token;
  },

  signOut(reason: LogoutReason) {
    accessToken = null;
    lastLogoutReason = reason;
    write(REFRESH_KEY, null);
    write(USERNAME_KEY, null);
    emit();
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    // Signing out in another tab removes the refresh token there; follow it here.
    const onStorage = (event: StorageEvent) => {
      if (event.key === REFRESH_KEY) listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  },
};

/** `null` while rendering on the server (no storage there), then true/false. */
export function useIsSignedIn(): boolean | null {
  return useSyncExternalStore(
    tokenStore.subscribe,
    () => tokenStore.getRefreshToken() !== null,
    () => null,
  );
}

export function useUsername(): string | null {
  return useSyncExternalStore(tokenStore.subscribe, tokenStore.getUsername, () => null);
}

/** Only same-site paths are allowed as a post-login redirect (no `//evil.com`). */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return '/vehicles';
  }
  return next;
}
