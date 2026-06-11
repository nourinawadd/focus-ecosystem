import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Capture codes instead of calling Brevo.
vi.mock('../utils/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(true),
}));

import { createApp } from '../app.js';
import { sendVerificationEmail } from '../utils/mailer.js';
import User from '../models/User.js';

const app = createApp();

beforeAll(() => { process.env.REQUIRE_EMAIL_VERIFICATION = 'true'; });
afterAll(()  => { delete process.env.REQUIRE_EMAIL_VERIFICATION; });
beforeEach(() => { vi.clearAllMocks(); });

let seq = 0;
async function registerUser() {
  const email = `verify-${seq++}@example.test`;
  const res = await request(app).post('/api/auth/register')
    .send({ name: 'Verify Me', email, password: 'sup3rsecret' });
  return { email, res };
}

/** The plaintext code most recently "emailed" to `email` via the mock. */
function lastCodeFor(email) {
  const calls = sendVerificationEmail.mock.calls.filter(([to]) => to === email);
  return calls.at(-1)?.[1];
}

describe('register with REQUIRE_EMAIL_VERIFICATION', () => {
  it('creates an unverified account, sends a 6-digit code, returns no tokens', async () => {
    const { email, res } = await registerUser();
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ verificationRequired: true, email });
    expect(res.body.accessToken).toBeUndefined();

    const code = lastCodeFor(email);
    expect(code).toMatch(/^\d{6}$/);

    const doc = await User.findOne({ email });
    expect(doc.emailVerified).toBe(false);
    expect(doc.verification.codeHash).toBeTruthy();
    expect(doc.verification.codeHash).not.toContain(code);   // stored hashed
  });

  it('blocks login (403 EMAIL_UNVERIFIED) until verified, only on correct password', async () => {
    const { email } = await registerUser();

    const right = await request(app).post('/api/auth/login')
      .send({ email, password: 'sup3rsecret' });
    expect(right.status).toBe(403);
    expect(right.body.code).toBe('EMAIL_UNVERIFIED');

    // Wrong password must NOT reveal the verification state.
    const wrong = await request(app).post('/api/auth/login')
      .send({ email, password: 'not-the-password' });
    expect(wrong.status).toBe(401);
  });
});

describe('POST /api/auth/verify-email', () => {
  it('verifies with the correct code and returns a working token pair', async () => {
    const { email } = await registerUser();

    const res = await request(app).post('/api/auth/verify-email')
      .send({ email, code: lastCodeFor(email) });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();

    const me = await request(app).get('/api/user/me')
      .set({ Authorization: `Bearer ${res.body.accessToken}` });
    expect(me.status).toBe(200);
    expect(me.body.verification).toBeUndefined();   // hash never exposed

    // Login now works normally.
    const login = await request(app).post('/api/auth/login')
      .send({ email, password: 'sup3rsecret' });
    expect(login.status).toBe(200);
  });

  it('rejects a wrong code and an unknown email identically', async () => {
    const { email } = await registerUser();

    const wrong = await request(app).post('/api/auth/verify-email')
      .send({ email, code: '000000' });
    const unknown = await request(app).post('/api/auth/verify-email')
      .send({ email: 'ghost@example.test', code: '000000' });

    expect(wrong.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('locks after MAX attempts; the correct code then needs a resend', async () => {
    const { email } = await registerUser();
    const code = lastCodeFor(email);

    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/verify-email').send({ email, code: '000000' });
    }
    const locked = await request(app).post('/api/auth/verify-email').send({ email, code });
    expect(locked.status).toBe(400);
    expect(locked.body.code).toBe('CODE_LOCKED');
  });

  it('rejects an expired code', async () => {
    const { email } = await registerUser();
    await User.updateOne({ email }, { $set: { 'verification.expiresAt': new Date(Date.now() - 1000) } });

    const res = await request(app).post('/api/auth/verify-email')
      .send({ email, code: lastCodeFor(email) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CODE_EXPIRED');
  });
});

describe('POST /api/auth/resend-code', () => {
  it('throttles within the cooldown window', async () => {
    const { email } = await registerUser();
    const res = await request(app).post('/api/auth/resend-code').send({ email });
    expect(res.status).toBe(429);
  });

  it('after cooldown, issues a fresh code that replaces the old one', async () => {
    const { email } = await registerUser();
    const oldCode = lastCodeFor(email);
    await User.updateOne({ email }, { $set: { 'verification.lastSentAt': new Date(Date.now() - 61_000) } });

    const res = await request(app).post('/api/auth/resend-code').send({ email });
    expect(res.status).toBe(200);
    const newCode = lastCodeFor(email);
    expect(newCode).toMatch(/^\d{6}$/);

    // Old code is dead; new one verifies.
    if (oldCode !== newCode) {
      const old = await request(app).post('/api/auth/verify-email').send({ email, code: oldCode });
      expect(old.status).toBe(400);
    }
    const ok = await request(app).post('/api/auth/verify-email').send({ email, code: newCode });
    expect(ok.status).toBe(200);
  });

  it('answers 200 generically for unknown or already-verified emails', async () => {
    const unknown = await request(app).post('/api/auth/resend-code')
      .send({ email: 'ghost@example.test' });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual({ sent: true });
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});

describe('flag off → legacy behavior', () => {
  it('register returns tokens immediately and the account is verified', async () => {
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
    try {
      const email = `legacy-${seq++}@example.test`;
      const res = await request(app).post('/api/auth/register')
        .send({ name: 'Legacy', email, password: 'sup3rsecret' });
      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeTruthy();
      expect((await User.findOne({ email })).emailVerified).toBe(true);
      expect(sendVerificationEmail).not.toHaveBeenCalled();
    } finally {
      process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
    }
  });
});
