// frontend/api/client.ts
// Central HTTP wrapper + token authority. Every screen imports apiFetch from
// here — never raw fetch(). This module owns the access/refresh token pair
// (in memory + AsyncStorage) and transparently refreshes a 401'd request once
// before giving up. Set EXPO_PUBLIC_API_URL in frontend/.env to override the
// dev URL (required for physical phones — 10.0.2.2 only resolves from the
// Android emulator).

import AsyncStorage from '@react-native-async-storage/async-storage';

const ENV_URL  = process.env.EXPO_PUBLIC_API_URL;
const DEV_URL  = 'http://10.0.2.2:5000/api';
const PROD_URL = 'https://your-production-url/api';

const BASE = ENV_URL ?? (__DEV__ ? DEV_URL : PROD_URL);

const ACCESS_KEY  = 'auth.accessToken';
const REFRESH_KEY = 'auth.refreshToken';

// ─── Token store ──────────────────────────────────────────────────────────────
let accessToken:  string | null = null;
let refreshToken: string | null = null;

// Called when refresh fails — App wires this to signOut() so the user is
// bounced to Login when their session can no longer be recovered.
let onAuthExpired: (() => void) | null = null;
export function setOnAuthExpired(cb: (() => void) | null) { onAuthExpired = cb; }

export function getAccessToken() { return accessToken; }

export async function setTokens(t: { accessToken: string; refreshToken: string }) {
  accessToken  = t.accessToken;
  refreshToken = t.refreshToken;
  await AsyncStorage.multiSet([[ACCESS_KEY, t.accessToken], [REFRESH_KEY, t.refreshToken]]);
}

export async function clearTokens() {
  accessToken  = null;
  refreshToken = null;
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
}

// Revoke the refresh token server-side (best-effort) and clear local tokens.
export async function logout() {
  const token = refreshToken;
  if (token) {
    try {
      await fetch(`${BASE}/auth/logout`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refreshToken: token }),
      });
    } catch { /* offline — local clear below is enough */ }
  }
  await clearTokens();
}

// Restore tokens on app launch. Returns the pair so the caller can decide
// whether to land on Dashboard or Login.
export async function loadTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  const entries = await AsyncStorage.multiGet([ACCESS_KEY, REFRESH_KEY]);
  accessToken  = entries.find(([k]) => k === ACCESS_KEY)?.[1]  ?? null;
  refreshToken = entries.find(([k]) => k === REFRESH_KEY)?.[1] ?? null;
  return { accessToken, refreshToken };
}

// ─── Refresh (single-flight) ────────────────────────────────────────────────
// Refresh tokens rotate server-side: presenting one revokes it and issues a new
// one. If several requests 401 at once and each refreshed independently, the
// 2nd+ would replay an already-revoked token and trip the server's theft
// detection — burning the whole chain. So all concurrent refreshes share one
// in-flight promise.
let refreshPromise: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (!refreshToken) return Promise.resolve(null);
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.accessToken || !data?.refreshToken) return null;
      await setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ─── apiFetch ─────────────────────────────────────────────────────────────────
// `token` is accepted for backwards-compat with existing call sites, but the
// in-memory access token (kept fresh by refresh) takes precedence.
export async function apiFetch<T = unknown>(
  path: string,
  token: string | null = null,
  options: RequestInit = {},
  _retried = false,
): Promise<T> {
  const authToken = accessToken ?? token;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...((options.headers as Record<string, string>) ?? {}),
      },
    });
  } catch {
    throw new Error(`Cannot reach server at ${BASE}. Check your Wi-Fi and EXPO_PUBLIC_API_URL.`);
  }

  // Access token likely expired — refresh once and replay the original request.
  if (res.status === 401 && !_retried && refreshToken) {
    const fresh = await refreshAccessToken();
    if (fresh) return apiFetch<T>(path, fresh, options, true);
    // Refresh failed: session is unrecoverable. Clear and notify App.
    await clearTokens();
    onAuthExpired?.();
  }

  let data: any = {};
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }

  if (!res.ok) {
    const err: any = new Error(data.message ?? `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data as T;
}
