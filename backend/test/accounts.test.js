import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Mock the provider-token verifiers so we can drive every account type without
// real Google/Apple tokens. vi.mock is hoisted above the imports below, so the
// auth route resolves these mocks when createApp() wires it up.
vi.mock('../utils/socialAuth.js', () => ({
  verifyGoogleToken: vi.fn(),
  verifyAppleToken:  vi.fn(),
}));

import { createApp } from '../app.js';
import { verifyGoogleToken, verifyAppleToken } from '../utils/socialAuth.js';

const app = createApp();

const google = (body = { idToken: 'g.token' }) => request(app).post('/api/auth/google').send(body);
const apple  = (body = { identityToken: 'a.token' }) => request(app).post('/api/auth/apple').send(body);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('account types — social sign-in', () => {
  it('creates a passwordless account for a new Google user', async () => {
    verifyGoogleToken.mockResolvedValue({
      providerUserId: 'google-uid-1',
      email:          'new.google@example.test',
      emailVerified:  true,
      name:           'Goog Le',
    });

    const res = await google();
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: 'new.google@example.test', name: 'Goog Le' });

    // Passwordless: /login can never authenticate this account.
    const login = await request(app).post('/api/auth/login')
      .send({ email: 'new.google@example.test', password: 'anything-at-all' });
    expect(login.status).toBe(401);
  });

  it('creates a passwordless account for a new Apple user', async () => {
    verifyAppleToken.mockResolvedValue({
      providerUserId: 'apple-uid-1',
      email:          'new.apple@example.test',
      emailVerified:  true,
      name:           null,
    });

    const res = await apple({ identityToken: 'a.token', fullName: 'App Le' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('new.apple@example.test');
    // Name falls back to the client-supplied fullName on first sign-in.
    expect(res.body.user.name).toBe('App Le');
  });

  it('links a provider identity onto an existing account by verified email', async () => {
    // Existing password account.
    const reg = await request(app).post('/api/auth/register')
      .send({ name: 'Pass User', email: 'link@example.test', password: 'sup3rsecret' });
    expect(reg.status).toBe(201);
    const passwordUserId = reg.body.user.id;

    // Google token for the SAME, verified email → links rather than duplicates.
    verifyGoogleToken.mockResolvedValue({
      providerUserId: 'google-uid-link',
      email:          'link@example.test',
      emailVerified:  true,
      name:           'Pass User',
    });
    const social = await google();
    expect(social.status).toBe(200);
    expect(social.body.user.id).toBe(passwordUserId);   // same account

    // The original password still works after linking.
    const login = await request(app).post('/api/auth/login')
      .send({ email: 'link@example.test', password: 'sup3rsecret' });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(passwordUserId);
  });

  it('reuses the same account on repeat sign-in with the same provider id', async () => {
    verifyGoogleToken.mockResolvedValue({
      providerUserId: 'google-uid-repeat',
      email:          'repeat@example.test',
      emailVerified:  true,
      name:           'Repeat',
    });

    const first  = await google();
    const second = await google();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(first.body.user.id);
  });

  it('refuses to link via an UNverified email (no account takeover)', async () => {
    await request(app).post('/api/auth/register')
      .send({ name: 'Owner', email: 'owner@example.test', password: 'sup3rsecret' });

    // Same email but the provider did NOT verify it → must not link; the unique
    // email index then makes account creation a conflict.
    verifyGoogleToken.mockResolvedValue({
      providerUserId: 'google-uid-evil',
      email:          'owner@example.test',
      emailVerified:  false,
      name:           'Imposter',
    });
    const res = await google();
    expect(res.status).toBe(409);

    // The owner's password login is untouched.
    const login = await request(app).post('/api/auth/login')
      .send({ email: 'owner@example.test', password: 'sup3rsecret' });
    expect(login.status).toBe(200);
  });

  it('rejects an invalid provider token with 401', async () => {
    const err = new Error('Invalid Google token');
    err.status = 401;
    verifyGoogleToken.mockRejectedValue(err);
    const res = await google();
    expect(res.status).toBe(401);
  });
});

describe('account types — feature parity for a social account', () => {
  it('a Google-created account gets working sessions, analytics and history', async () => {
    verifyGoogleToken.mockResolvedValue({
      providerUserId: 'google-uid-parity',
      email:          'parity@example.test',
      emailVerified:  true,
      name:           'Parity',
    });
    const auth = await google();
    const token = auth.body.accessToken;
    const today = new Date().toISOString().slice(0, 10);

    // Run the core productivity loop exactly as a password user would.
    const created = await request(app).post('/api/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'STUDY', timerMode: 'COUNTDOWN', timerConfig: { plannedDuration: 25 },
              dateStr: today, startedAt: `${today}T09:00:00.000Z` });
    expect(created.status).toBe(201);

    const ended = await request(app).patch(`/api/sessions/${created.body.id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'COMPLETED', timerState: { actualDuration: 25 } });
    expect(ended.status).toBe(200);
    expect(ended.body.streak).toBe(1);

    const summary = await request(app).get('/api/analytics/summary?period=week')
      .set('Authorization', `Bearer ${token}`);
    expect(summary.status).toBe(200);
    expect(summary.body.totalFocusMinutes).toBe(25);
    expect(summary.body.currentStreak).toBe(1);

    const history = await request(app).get('/api/sessions')
      .set('Authorization', `Bearer ${token}`);
    expect(history.status).toBe(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].completed).toBe(true);
  });
});
