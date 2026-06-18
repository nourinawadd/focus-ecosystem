// frontend/auth/social.ts
// Native Google / Apple sign-in. Each helper drives the platform sheet, then
// exchanges the provider's ID token with our backend (/auth/google, /auth/apple)
// for the same access+refresh pair that /auth/login returns. The caller treats
// the result exactly like a password login.
//
// Client IDs are public (they ship inside the app binary), so they're safe to
// commit. The Web client *secret* is NOT used here — ID-token verification needs
// only the client IDs. Override via EXPO_PUBLIC_* env if they ever change.

import { Platform } from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { apiFetch } from '../api/client';

const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
  '129531586894-1411osps9jtidoh98n39bdq71en6b8ci.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ??
  '129531586894-j4idsokok0s7nvlb3lifbhkpvh4dmg9j.apps.googleusercontent.com';

let googleConfigured = false;
function ensureGoogleConfigured() {
  if (googleConfigured) return;
  GoogleSignin.configure({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    // webClientId sets the audience (`aud`) of the returned idToken; the backend
    // verifies the token against this same ID.
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });
  googleConfigured = true;
}

// Returned when the user dismisses the native sheet — a normal outcome, not an
// error, so screens should stay put rather than show a failure message.
export const CANCELLED = Symbol('social-auth-cancelled');

export type AuthResult = {
  accessToken:  string;
  refreshToken: string;
  user:         { name: string; email: string; hasPassword?: boolean };
};

export async function signInWithGoogle(): Promise<AuthResult | typeof CANCELLED> {
  ensureGoogleConfigured();
  try {
    await GoogleSignin.hasPlayServices();          // no-op on iOS
    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') return CANCELLED;

    const idToken = response.data?.idToken;
    if (!idToken) throw new Error('Google sign-in did not return an ID token.');

    return await apiFetch<AuthResult>('/auth/google', null, {
      method: 'POST',
      body:   JSON.stringify({ idToken }),
    });
  } catch (e: any) {
    if (e?.code === statusCodes.SIGN_IN_CANCELLED) return CANCELLED;
    throw e;
  }
}

export async function signInWithApple(): Promise<AuthResult | typeof CANCELLED> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    const { identityToken, fullName, email } = credential;
    if (!identityToken) throw new Error('Apple sign-in did not return an identity token.');

    // Apple supplies name/email only on the FIRST authorization; forward them so
    // the backend can persist them on account creation. The token stays the
    // source of truth for the stable user id + verified email.
    const name = [fullName?.givenName, fullName?.familyName].filter(Boolean).join(' ') || undefined;

    return await apiFetch<AuthResult>('/auth/apple', null, {
      method: 'POST',
      body:   JSON.stringify({ identityToken, fullName: name, email: email ?? undefined }),
    });
  } catch (e: any) {
    // expo-apple-authentication cancellation codes.
    if (e?.code === 'ERR_REQUEST_CANCELED' || e?.code === 'ERR_CANCELED') return CANCELLED;
    throw e;
  }
}

// Apple sign-in is iOS-only in this app; gate the button on it.
export const isAppleAuthSupported = Platform.OS === 'ios';
