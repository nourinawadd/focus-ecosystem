import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Capture codes instead of calling Brevo. Both senders are mocked so neither
// the verification nor the reset flow hits the network.
vi.mock('../utils/mailer.js', () => ({
  sendVerificationEmail:  vi.fn().mockResolvedValue(true),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
}));

import { createApp } from '../app.js';
import { sendPasswordResetEmail } from '../utils/mailer.js';
import { signAccess } from '../utils/jwt.js';
import User from '../models/User.js';

const app = createApp();

beforeEach(() => { vi.clearAllMocks(); });

let seq = 0;
const PASS = 'sup3rsecret';

async function registerUser() {
  const email = `reset-${seq++}@example.test`;
  await request(app).post('/api/auth/register')
    .send({ name: 'Reset Me', email, password: PASS });
  return email;
}

/** The plaintext reset code most recently "emailed" to `email`. */
function lastResetCodeFor(email) {
  const calls = sendPasswordResetEmail.mock.calls.filter(([to]) => to === email);
  return calls.at(-1)?.[1];
}

describe('POST /api/auth/forgot-password', () => {
  it('returns 404 NO_ACCOUNT for an unknown email without sending', async () => {
    const res = await request(app).post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.test' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NO_ACCOUNT');
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('issues a 6-digit code (stored hashed) for a real user', async () => {
    const email = await registerUser();
    const res = await request(app).post('/api/auth/forgot-password').send({ email });
    expect(res.status).toBe(200);

    const code = lastResetCodeFor(email);
    expect(code).toMatch(/^\d{6}$/);

    const doc = await User.findOne({ email });
    expect(doc.passwordReset.codeHash).toBeTruthy();
    expect(doc.passwordReset.codeHash).not.toContain(code);   // hashed, not plaintext
  });

  it('throttles repeat requests within the cooldown window', async () => {
    const email = await registerUser();
    await request(app).post('/api/auth/forgot-password').send({ email });
    const again = await request(app).post('/api/auth/forgot-password').send({ email });
    expect(again.status).toBe(429);
  });
});

describe('POST /api/auth/reset-password', () => {
  it('rejects a wrong code with a generic message and counts the attempt', async () => {
    const email = await registerUser();
    await request(app).post('/api/auth/forgot-password').send({ email });

    const res = await request(app).post('/api/auth/reset-password')
      .send({ email, code: '000000', newPassword: 'brand-new-pass' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid email or code');

    const doc = await User.findOne({ email });
    expect(doc.passwordReset.attempts).toBe(1);
  });

  it('locks after too many attempts', async () => {
    const email = await registerUser();
    await request(app).post('/api/auth/forgot-password').send({ email });

    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/reset-password')
        .send({ email, code: '000000', newPassword: 'brand-new-pass' });
    }
    const locked = await request(app).post('/api/auth/reset-password')
      .send({ email, code: '000000', newPassword: 'brand-new-pass' });
    expect(locked.status).toBe(400);
    expect(locked.body.code).toBe('CODE_LOCKED');
  });

  it('rejects a new password shorter than the minimum', async () => {
    const email = await registerUser();
    await request(app).post('/api/auth/forgot-password').send({ email });
    const code = lastResetCodeFor(email);

    const res = await request(app).post('/api/auth/reset-password')
      .send({ email, code, newPassword: 'short' });
    expect(res.status).toBe(400);
  });

  it('resets the password, auto-logs-in, kills the old code, and lets the new password log in', async () => {
    const email = await registerUser();
    await request(app).post('/api/auth/forgot-password').send({ email });
    const code = lastResetCodeFor(email);
    const newPassword = 'a-fresh-password';

    const res = await request(app).post('/api/auth/reset-password')
      .send({ email, code, newPassword });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();

    // Old code can't be replayed.
    const replay = await request(app).post('/api/auth/reset-password')
      .send({ email, code, newPassword: 'another-one-99' });
    expect(replay.status).toBe(400);

    // Old password no longer works; new one does.
    const oldLogin = await request(app).post('/api/auth/login').send({ email, password: PASS });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post('/api/auth/login').send({ email, password: newPassword });
    expect(newLogin.status).toBe(200);
  });

  it('revokes existing refresh tokens on reset', async () => {
    const email = await registerUser();
    const login = await request(app).post('/api/auth/login').send({ email, password: PASS });
    const oldRefresh = login.body.refreshToken;

    await request(app).post('/api/auth/forgot-password').send({ email });
    const code = lastResetCodeFor(email);
    await request(app).post('/api/auth/reset-password')
      .send({ email, code, newPassword: 'a-fresh-password' });

    const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken: oldRefresh });
    expect(refresh.status).toBe(401);
  });

  it('lets a social-only account set a password via reset', async () => {
    const email = `social-${seq++}@example.test`;
    await User.create({ email, name: 'Social', googleId: `g-${seq}` });

    await request(app).post('/api/auth/forgot-password').send({ email });
    const code = lastResetCodeFor(email);
    expect(code).toMatch(/^\d{6}$/);

    const reset = await request(app).post('/api/auth/reset-password')
      .send({ email, code, newPassword: 'now-i-have-one' });
    expect(reset.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email, password: 'now-i-have-one' });
    expect(login.status).toBe(200);
  });
});

describe('POST /api/auth/change-password', () => {
  async function loginToken(email, password = PASS) {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    return res.body;
  }

  it('changes the password with the correct current password and rotates tokens', async () => {
    const email = await registerUser();
    const { accessToken, refreshToken } = await loginToken(email);
    const newPassword = 'changed-it-up';

    const res = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: PASS, newPassword });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();

    // Old session is revoked; new password logs in; old one doesn't.
    const oldRefresh = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(oldRefresh.status).toBe(401);
    const newLogin = await request(app).post('/api/auth/login').send({ email, password: newPassword });
    expect(newLogin.status).toBe(200);
    const oldLogin = await request(app).post('/api/auth/login').send({ email, password: PASS });
    expect(oldLogin.status).toBe(401);
  });

  it('rejects a wrong current password', async () => {
    const email = await registerUser();
    const { accessToken } = await loginToken(email);

    const res = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'not-it', newPassword: 'whatever-123' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WRONG_PASSWORD');
  });

  it('rejects reusing the same password', async () => {
    const email = await registerUser();
    const { accessToken } = await loginToken(email);

    const res = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: PASS, newPassword: PASS });
    expect(res.status).toBe(400);
  });

  it('returns NO_PASSWORD for a social-only account', async () => {
    const email = `social-cp-${seq++}@example.test`;
    const user = await User.create({ email, name: 'Social', appleId: `a-${seq}` });
    const accessToken = signAccess(user._id);

    const res = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'anything', newPassword: 'whatever-123' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_PASSWORD');
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/auth/change-password')
      .send({ currentPassword: PASS, newPassword: 'whatever-123' });
    expect(res.status).toBe(401);
  });
});
