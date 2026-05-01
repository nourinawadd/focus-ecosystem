// frontend/api/client.ts
// Central HTTP wrapper. Every screen imports apiFetch from here — never raw fetch().
// Set EXPO_PUBLIC_API_URL in frontend/.env to override the dev URL (required for
// physical phones — 10.0.2.2 only resolves from the Android emulator).

const DEV_URL  = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:5000/api';
const PROD_URL = 'https://your-production-url/api';

const BASE = __DEV__ ? DEV_URL : PROD_URL;

export async function apiFetch<T = unknown>(
  path: string,
  token: string | null,
  options: RequestInit = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...((options.headers as Record<string, string>) ?? {}),
      },
    });
  } catch {
    throw new Error(`Cannot reach server at ${BASE}. Check your Wi-Fi and EXPO_PUBLIC_API_URL.`);
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
