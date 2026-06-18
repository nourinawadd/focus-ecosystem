import express from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { signAccess, signRefresh, hashToken } from '../utils/jwt.js';
import { verifyGoogleToken, verifyAppleToken } from '../utils/socialAuth.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/mailer.js';
import auth from '../middleware/auth.js';

const router = express.Router();

const MIN_PASSWORD = 8;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days

// ─── Email verification ──────────────────────────────────────────────────────
// Gated by REQUIRE_EMAIL_VERIFICATION=true (set on Render). When off, /register
// behaves as before — accounts are created verified and get tokens immediately —
// so local dev and the test suite need no Brevo setup.
const VERIFICATION_TTL_MS  = 10 * 60 * 1000;  // code lifetime
const RESEND_COOLDOWN_MS   = 60 * 1000;       // min gap between sends
const MAX_VERIFY_ATTEMPTS  = 5;               // wrong codes before a resend is forced

const requireVerification = () => process.env.REQUIRE_EMAIL_VERIFICATION === 'true';

// crypto.randomInt is uniform — no modulo bias; always 6 digits.
const generateCode = () => String(crypto.randomInt(100000, 1000000));

// Mint + store a fresh code (invalidating any previous one) and email it.
async function issueVerificationCode(user) {
  const code = generateCode();
  user.verification = {
    codeHash:   await bcrypt.hash(code, 10),
    expiresAt:  new Date(Date.now() + VERIFICATION_TTL_MS),
    attempts:   0,
    lastSentAt: new Date(),
  };
  await user.save();
  await sendVerificationEmail(user.email, code);   // best-effort; never throws
}

// Same as above for the password-reset code (stored in the separate
// passwordReset sub-document) and emailed via the reset template.
async function issueResetCode(user) {
  const code = generateCode();
  user.passwordReset = {
    codeHash:   await bcrypt.hash(code, 10),
    expiresAt:  new Date(Date.now() + VERIFICATION_TTL_MS),
    attempts:   0,
    lastSentAt: new Date(),
  };
  await user.save();
  await sendPasswordResetEmail(user.email, code);   // best-effort; never throws
}

// Dummy hash compared against when no user is found, so /login takes the same
// time whether or not the email exists (mitigates user-enumeration timing).
const DUMMY_HASH = bcrypt.hashSync('timing-attack-placeholder', 12);

// Only expose non-sensitive fields to the client.
const publicUser = (user) => ({
  id:       user._id,
  name:     user.name,
  email:    user.email,
  settings: user.settings,
  // Lets the app distinguish password accounts from social-only ones (e.g. to
  // show/hide "Change password"). Never exposes the hash itself.
  hasPassword: !!user.passwordHash,
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

  if (requireVerification()) {
    const user = await User.create({
      name, email, passwordHash: password, emailVerified: false, categories: defaultCategories,
    });
    await issueVerificationCode(user);
    // No tokens until the email is verified — the client routes to the
    // verification screen and exchanges the code for tokens there.
    return res.status(201).json({ verificationRequired: true, email: user.email });
  }

  const user = await User.create({ name, email, passwordHash: password, categories: defaultCategories });
  res.status(201).json(await issueTokens(user, req));
}));

// ─── POST /api/auth/verify-email ─────────────────────────────────────────────
// Body: { email, code }. On success the account is activated and the same
// access+refresh pair as /login is returned, so verification flows straight
// into the app. Responses for unknown email / wrong code are identical to
// avoid account enumeration.
router.post('/verify-email', loginLimiter, asyncHandler(async (req, res) => {
  const email = (req.body.email ?? '').trim().toLowerCase();
  const code  = String(req.body.code ?? '').trim();

  if (!email || !code)
    return res.status(400).json({ message: 'email and code are required' });

  const user = await User.findOne({ email });
  if (!user || user.emailVerified || !user.verification?.codeHash)
    return res.status(400).json({ message: 'Invalid email or code' });

  const v = user.verification;
  if (v.expiresAt && v.expiresAt.getTime() < Date.now())
    return res.status(400).json({ message: 'Code expired — request a new one', code: 'CODE_EXPIRED' });
  if (v.attempts >= MAX_VERIFY_ATTEMPTS)
    return res.status(400).json({ message: 'Too many attempts — request a new code', code: 'CODE_LOCKED' });

  // Count the attempt before comparing so a hammering client can't race the
  // increment.
  user.verification.attempts += 1;
  await user.save();

  if (!(await bcrypt.compare(code, v.codeHash)))
    return res.status(400).json({ message: 'Invalid email or code' });

  user.emailVerified = true;
  user.verification  = { codeHash: null, expiresAt: null, attempts: 0, lastSentAt: null };
  await user.save();

  res.json(await issueTokens(user, req));
}));

// ─── POST /api/auth/resend-code ──────────────────────────────────────────────
// Body: { email }. Always answers 200 for unknown/already-verified emails so
// the endpoint can't be used to probe which addresses have accounts. A real
// resend is throttled to one per RESEND_COOLDOWN_MS.
router.post('/resend-code', loginLimiter, asyncHandler(async (req, res) => {
  const email = (req.body.email ?? '').trim().toLowerCase();
  if (!email)
    return res.status(400).json({ message: 'email is required' });

  const user = await User.findOne({ email });
  if (user && !user.emailVerified) {
    const last = user.verification?.lastSentAt?.getTime() ?? 0;
    if (Date.now() - last < RESEND_COOLDOWN_MS)
      return res.status(429).json({ message: 'Please wait a minute before requesting another code' });
    await issueVerificationCode(user);
  }

  res.json({ sent: true });
}));

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
// Body: { email }. Verifies the email belongs to a real account and 404s with
// NO_ACCOUNT otherwise, so the app can tell the user up-front rather than send
// them to enter a code that will never arrive. (This deliberately trades away
// account-enumeration resistance for clearer UX; the IP rate limiter still caps
// probing.) A real send is throttled to one per RESEND_COOLDOWN_MS. Works for
// social-only accounts too: they own the verified email, so a reset lets them
// add password login.
router.post('/forgot-password', loginLimiter, asyncHandler(async (req, res) => {
  const email = (req.body.email ?? '').trim().toLowerCase();
  if (!email)
    return res.status(400).json({ message: 'email is required' });

  const user = await User.findOne({ email });
  if (!user)
    return res.status(404).json({ message: 'No account found with that email', code: 'NO_ACCOUNT' });

  const last = user.passwordReset?.lastSentAt?.getTime() ?? 0;
  if (Date.now() - last < RESEND_COOLDOWN_MS)
    return res.status(429).json({ message: 'Please wait a minute before requesting another code' });

  await issueResetCode(user);
  res.json({ sent: true });
}));

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
// Body: { email, code, newPassword }. Verifies the emailed code, sets the new
// password, and (since the user proved control of the inbox) marks the email
// verified. All existing refresh tokens are revoked, then a fresh pair is
// returned so the flow auto-logs-in. Unknown email / wrong code share an
// identical response to avoid account enumeration.
router.post('/reset-password', loginLimiter, asyncHandler(async (req, res) => {
  const email       = (req.body.email ?? '').trim().toLowerCase();
  const code        = String(req.body.code ?? '').trim();
  const newPassword = req.body.newPassword ?? '';

  if (!email || !code || !newPassword)
    return res.status(400).json({ message: 'email, code and newPassword are required' });
  if (newPassword.length < MIN_PASSWORD)
    return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD} characters` });

  const user = await User.findOne({ email });
  if (!user || !user.passwordReset?.codeHash)
    return res.status(400).json({ message: 'Invalid email or code' });

  const r = user.passwordReset;
  if (r.expiresAt && r.expiresAt.getTime() < Date.now())
    return res.status(400).json({ message: 'Code expired — request a new one', code: 'CODE_EXPIRED' });
  if (r.attempts >= MAX_VERIFY_ATTEMPTS)
    return res.status(400).json({ message: 'Too many attempts — request a new code', code: 'CODE_LOCKED' });

  // Count the attempt before comparing so a hammering client can't race it.
  user.passwordReset.attempts += 1;
  await user.save();

  if (!(await bcrypt.compare(code, r.codeHash)))
    return res.status(400).json({ message: 'Invalid email or code' });

  // pre('save') hashes the plaintext assignment.
  user.passwordHash  = newPassword;
  user.emailVerified = true;
  user.passwordReset = { codeHash: null, expiresAt: null, attempts: 0, lastSentAt: null };
  await user.save();

  // Burn every existing session — a reset should invalidate anything an
  // attacker might have established.
  await RefreshToken.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  res.json(await issueTokens(user, req));
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

  // Only after a correct password (an attacker without it learns nothing):
  // unverified accounts get a distinct code so the client can route to the
  // verification screen instead of showing "wrong credentials".
  if (!user.emailVerified)
    return res.status(403).json({ message: 'Email not verified', code: 'EMAIL_UNVERIFIED' });

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

// ─── POST /api/auth/change-password ──────────────────────────────────────────
// Authenticated. Body: { currentPassword, newPassword }. Verifies the current
// password, sets the new one, then revokes every existing refresh token and
// issues a fresh pair — so other devices are signed out while this one stays in
// via the returned tokens. Social-only accounts (no passwordHash) get a 400
// with code NO_PASSWORD and should use the forgot-password flow to set one.
router.post('/change-password', auth, asyncHandler(async (req, res) => {
  const currentPassword = req.body.currentPassword ?? '';
  const newPassword     = req.body.newPassword ?? '';

  // req.user comes from the auth middleware with passwordHash stripped — reload
  // the full doc so we can compare and save.
  const user = await User.findById(req.user._id);
  if (!user)
    return res.status(401).json({ message: 'User not found' });

  if (!user.passwordHash)
    return res.status(400).json({ message: 'This account has no password. Use “Forgot password” to set one.', code: 'NO_PASSWORD' });

  if (!currentPassword || !newPassword)
    return res.status(400).json({ message: 'currentPassword and newPassword are required' });
  if (newPassword.length < MIN_PASSWORD)
    return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD} characters` });

  if (!(await user.comparePassword(currentPassword)))
    return res.status(400).json({ message: 'Current password is incorrect', code: 'WRONG_PASSWORD' });

  if (await user.comparePassword(newPassword))
    return res.status(400).json({ message: 'New password must be different from the current one' });

  user.passwordHash = newPassword;   // pre('save') hashes it
  await user.save();

  // Revoke all existing sessions, then hand this device a fresh pair.
  await RefreshToken.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  res.json(await issueTokens(user, req));
}));

export default router;
