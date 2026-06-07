// Verification of third-party (Google / Apple) ID tokens.
//
// The mobile app obtains a provider-signed JWT and posts it here. We NEVER trust
// the email/sub the client claims directly — we verify the token's signature
// against the provider's published keys and check the issuer + audience, then
// read the identity out of the *verified* claims. A user can only authenticate
// if they hold a token that Apple/Google actually signed for *our* app.

import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// ─── Google ───────────────────────────────────────────────────────────────────
// `@react-native-google-signin` mints an ID token whose `aud` is the Web client
// ID when configured with `webClientId`; on some paths it can be the iOS client
// ID instead. Accepting both removes the single most common Google footgun.
const googleAudiences = [
  process.env.GOOGLE_WEB_CLIENT_ID,
  process.env.GOOGLE_IOS_CLIENT_ID,
].filter(Boolean);

const googleClient = new OAuth2Client();

/**
 * Verify a Google ID token. Returns { providerUserId, email, emailVerified, name }.
 * Throws a 401-tagged error on any verification failure.
 */
export async function verifyGoogleToken(idToken) {
  if (!idToken) throw unauthorized('Missing Google ID token');
  if (googleAudiences.length === 0)
    throw new Error('GOOGLE_WEB_CLIENT_ID / GOOGLE_IOS_CLIENT_ID not configured');

  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({ idToken, audience: googleAudiences });
  } catch {
    throw unauthorized('Invalid Google token');
  }

  const payload = ticket.getPayload();
  if (!payload?.sub) throw unauthorized('Invalid Google token');

  return {
    providerUserId: payload.sub,
    email:          payload.email?.toLowerCase() ?? null,
    emailVerified:  payload.email_verified === true,
    name:           payload.name ?? null,
  };
}

// ─── Apple ────────────────────────────────────────────────────────────────────
const APPLE_ISSUER = 'https://appleid.apple.com';
const appleJWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

/**
 * Verify an Apple identity token. Apple's token carries `sub` and (usually)
 * `email`, but never a name — the name arrives once, client-side, on the first
 * authorization, so callers pass it separately. Returns
 * { providerUserId, email, emailVerified }.
 */
export async function verifyAppleToken(identityToken) {
  if (!identityToken) throw unauthorized('Missing Apple identity token');
  const audience = process.env.APPLE_BUNDLE_ID;
  if (!audience) throw new Error('APPLE_BUNDLE_ID not configured');

  let payload;
  try {
    ({ payload } = await jwtVerify(identityToken, appleJWKS, {
      issuer:   APPLE_ISSUER,
      audience,
    }));
  } catch {
    throw unauthorized('Invalid Apple token');
  }

  if (!payload?.sub) throw unauthorized('Invalid Apple token');

  // Apple sends email_verified as the boolean true or the string "true".
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';

  return {
    providerUserId: payload.sub,
    email:          typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
    emailVerified,
  };
}

function unauthorized(message) {
  const err = new Error(message);
  err.status = 401;
  return err;
}
