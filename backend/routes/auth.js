import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { signAccess, signRefresh, hashToken } from '../utils/jwt.js';
import { verifyGoogleToken, verifyAppleToken } from '../utils/socialAuth.js';

const router = express.Router();

const MIN_PASSWORD = 8;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days

// Dummy hash compared against when no user is found, so /login takes the same
// time whether or not the email exists (mitigates user-enumeration timing).
const DUMMY_HASH = bcrypt.hashSync('timing-attack-placeholder', 12);

// Only expose non-sensitive fields to the client.
const publicUser = (user) => ({
  id:       user._id,
  name:     user.name,
  email:    user.email,
  settings: user.settings,
});

// Issue a fresh access+refresh pair and persist the refresh token's hash.
async function issueTokens(user, req) {
  const accessToken = signAccess(user._id);
  const { token: refreshToken, tokenHash } = signRefresh();

  await RefreshToken.create({
    userId:    user._id,
    tokenHash,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    userAgent: req.get('user-agent') || null,
    ip:        req.ip || null,
  });

  return { accessToken, refreshToken, user: publicUser(user) };
}

// Rate limits would otherwise trip during the test suite (many logins/registers
// from one IP), so they're disabled under NODE_ENV=test.
const skipInTest = () => process.env.NODE_ENV === 'test';

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,           // 1 minute
  max: 5,                        // 5 attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { message: 'Too many login attempts, please try again later' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,      // 1 hour
  max: 10,                       // 10 accounts per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { message: 'Too many accounts created, please try again later' },
});

const socialLimiter = rateLimit({
  windowMs: 60 * 1000,           // 1 minute
  max: 10,                       // 10 social sign-in attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { message: 'Too many sign-in attempts, please try again later' },
});

// Resolve a verified third-party identity to a User, applying the account-linking
// policy: (1) reuse the account already linked to this provider id; else
// (2) link to an existing account that owns the *verified* email; else
// (3) create a fresh account. Linking only ever happens on a provider-verified
// email, so a third party can't claim someone's account via an unverified one.
async function findOrCreateSocialUser({ provider, providerUserId, email, emailVerified, name }) {
  const idField = provider === 'google' ? 'googleId' : 'appleId';

  // 1. Already linked.
  let user = await User.findOne({ [idField]: providerUserId });
  if (user) return user;

  // 2. Link to an existing account by verified email.
  if (email && emailVerified) {
    user = await User.findOne({ email });
    if (user) {
      user[idField] = providerUserId;
      if (!user.name && name) user.name = name;
      await user.save();
      return user;
    }
  }

  // 3. Create a new account (no password — social-only).
  const fallbackName = name || (email ? email.split('@')[0] : '') || 'Anchor User';
  
  // Create default categories for new social users
  const defaultCategories = [
    { id: `cat_${Date.now()}_work`, name: 'Work' },
    { id: `cat_${Date.now()}_personal`, name: 'Personal' },
    { id: `cat_${Date.now()}_learning`, name: 'Learning' },
  ];
  
  try {
    return await User.create({
      [idField]: providerUserId,
      email:     email ?? undefined,
      name:      fallbackName,
      categories: defaultCategories,
    });
  } catch (err) {
    if (err.code === 11000) {
      // Lost a race on the same provider identity → safe to return that account.
      const byId = await User.findOne({ [idField]: providerUserId });
      if (byId) return byId;
      // Otherwise it's an email collision (e.g. an unverified email matching an
      // existing account). Refuse rather than hand over someone else's account.
      const conflict = new Error('An account with this email already exists. Please sign in with your original method.');
      conflict.status = 409;
      throw conflict;
    }
    throw err;
  }
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', registerLimiter, asyncHandler(async (req, res) => {
  const name     = (req.body.name  ?? '').trim();
  const email    = (req.body.email ?? '').trim().toLowerCase();
  const password = req.body.password ?? '';

  if (!name || !email || !password)
    return res.status(400).json({ message: 'name, email and password are required' });

  if (password.length < MIN_PASSWORD)
    return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD} characters` });

  // Defensive duplicate check; the unique index is the source of truth (E11000 → 409 via errorHandler).
  if (await User.findOne({ email }))
    return res.status(409).json({ message: 'Email already registered' });

  // Create default categories for new users
  const defaultCategories = [
    { id: `cat_${Date.now()}_work`, name: 'Work' },
    { id: `cat_${Date.now()}_personal`, name: 'Personal' },
    { id: `cat_${Date.now()}_learning`, name: 'Learning' },
  ];

  const user = await User.create({
    name,
    email,
    passwordHash: password,
    categories: defaultCategories,
  });
  res.status(201).json(await issueTokens(user, req));
}));

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const email    = (req.body.email ?? '').trim().toLowerCase();
  const password = req.body.password ?? '';

  if (!email || !password)
    return res.status(400).json({ message: 'email and password are required' });

  const user = await User.findOne({ email });

  // Always run a bcrypt comparison — against the real hash if the user exists,
  // otherwise against a dummy — so the response time doesn't reveal whether the
  // email is registered. The result of the dummy compare is discarded.
  const valid = user
    ? await user.comparePassword(password)
    : (await bcrypt.compare(password, DUMMY_HASH), false);

  if (!user || !valid)
    return res.status(401).json({ message: 'Invalid credentials' });

  res.json(await issueTokens(user, req));
}));

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
// Exchange a valid refresh token for a new pair (rotation). The presented token
// is revoked and linked to its successor. Replaying an already-revoked token is
// treated as theft: the user's entire live token set is burned.
router.post('/refresh', asyncHandler(async (req, res) => {
  const refreshToken = req.body.refreshToken ?? '';
  if (!refreshToken)
    return res.status(400).json({ message: 'refreshToken is required' });

  const stored = await RefreshToken.findOne({ tokenHash: hashToken(refreshToken) });
  if (!stored)
    return res.status(401).json({ message: 'Invalid refresh token' });

  // Reuse of a revoked token ⇒ likely stolen. Revoke every live token for the
  // user so both the legitimate client and the attacker are forced to re-login.
  if (stored.revokedAt) {
    await RefreshToken.updateMany(
      { userId: stored.userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    return res.status(401).json({ message: 'Refresh token reuse detected' });
  }

  if (stored.expiresAt.getTime() < Date.now())
    return res.status(401).json({ message: 'Refresh token expired' });

  const user = await User.findById(stored.userId);
  if (!user)
    return res.status(401).json({ message: 'Invalid refresh token' });

  // Rotate: mint a new pair, then mark the old token revoked + replaced.
  const pair = await issueTokens(user, req);
  stored.revokedAt  = new Date();
  stored.replacedBy = hashToken(pair.refreshToken);
  await stored.save();

  res.json(pair);
}));

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
// Revoke the supplied refresh token. Idempotent — unknown/expired tokens are a
// no-op so logout never leaks whether a token was valid.
router.post('/logout', asyncHandler(async (req, res) => {
  const refreshToken = req.body.refreshToken ?? '';
  if (refreshToken) {
    await RefreshToken.findOneAndUpdate(
      { tokenHash: hashToken(refreshToken), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }
  res.json({ success: true });
}));

// ─── POST /api/auth/google ────────────────────────────────────────────────────
// Body: { idToken }. The client obtains idToken from the native Google SDK.
router.post('/google', socialLimiter, asyncHandler(async (req, res) => {
  const idToken = req.body.idToken ?? '';
  const identity = await verifyGoogleToken(idToken);   // throws 401 if invalid

  const user = await findOrCreateSocialUser({ provider: 'google', ...identity });
  res.json(await issueTokens(user, req));
}));

// ─── POST /api/auth/apple ─────────────────────────────────────────────────────
// Body: { identityToken, fullName?, email? }. Apple returns the name (and a
// non-relay email) only on the *first* authorization, so the client forwards
// them here; the token itself remains the source of truth for sub + email.
router.post('/apple', socialLimiter, asyncHandler(async (req, res) => {
  const identityToken = req.body.identityToken ?? '';
  const identity = await verifyAppleToken(identityToken);   // throws 401 if invalid

  // Prefer the verified email from the token; fall back to the client-supplied
  // one only on first sign-in (some Apple flows omit it from later tokens).
  const email = identity.email ?? (typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : null);
  const name  = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : null;

  const user = await findOrCreateSocialUser({
    provider:       'apple',
    providerUserId: identity.providerUserId,
    email,
    // A token-borne email is provider-verified; a client-supplied fallback is
    // only trusted for linking when the token also vouched for it.
    emailVerified:  identity.emailVerified && identity.email != null,
    name,
  });
  res.json(await issueTokens(user, req));
}));

export default router;
