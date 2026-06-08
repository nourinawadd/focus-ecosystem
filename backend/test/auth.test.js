import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';

const app = createApp();

const creds = { name: 'Test User', email: 'test@example.test', password: 'sup3rsecret' };

function register(overrides = {}) {
  return request(app).post('/api/auth/register').send({ ...creds, ...overrides });
}

describe('auth flow', () => {
  it('register → login → me → refresh → logout', async () => {
    // ── register ──
    const reg = await register();
    expect(reg.status).toBe(201);
    expect(reg.body.accessToken).toBeTruthy();
    expect(reg.body.refreshToken).toBeTruthy();
    expect(reg.body.user).toMatchObject({ name: creds.name, email: creds.email });
    expect(reg.body.user.id).toBeTruthy();
    // Never leak the password hash or full mongoose doc.
    expect(reg.body.user.passwordHash).toBeUndefined();

    // ── login ──
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: creds.email, password: creds.password });
    expect(login.status).toBe(200);
    expect(login.body.accessToken).toBeTruthy();
    expect(login.body.refreshToken).toBeTruthy();

    // ── me (protected) ──
    const me = await request(app)
      .get('/api/user/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(creds.email);
    expect(me.body.passwordHash).toBeUndefined();

    // ── refresh (rotation issues a new, different pair) ──
    const refresh = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(refresh.status).toBe(200);
    expect(refresh.body.accessToken).toBeTruthy();
    expect(refresh.body.refreshToken).toBeTruthy();
    expect(refresh.body.refreshToken).not.toBe(login.body.refreshToken);

    // ── logout (revokes the current refresh token) ──
    const logout = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: refresh.body.refreshToken });
    expect(logout.status).toBe(200);

    // The revoked token can no longer be refreshed.
    const afterLogout = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: refresh.body.refreshToken });
    expect(afterLogout.status).toBe(401);
  });

  it('rejects a duplicate email with 409', async () => {
    await register();
    const dup = await register({ name: 'Someone Else' });
    expect(dup.status).toBe(409);
  });

  it('rejects a wrong password with 401', async () => {
    await register();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: creds.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('rejects login for an unknown email with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.test', password: 'whatever123' });
    expect(res.status).toBe(401);
  });

  it('rejects an expired access token with 401', async () => {
    const reg = await register();
    const expired = jwt.sign(
      { id: reg.body.user.id },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' },
    );
    const res = await request(app)
      .get('/api/user/me')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('detects refresh-token reuse and burns the chain', async () => {
    const reg = await register();
    const original = reg.body.refreshToken;

    // First use rotates the token: `original` is now revoked, `rotated` is live.
    const first = await request(app).post('/api/auth/refresh').send({ refreshToken: original });
    expect(first.status).toBe(200);
    const rotated = first.body.refreshToken;

    // Replaying the revoked original is treated as theft → 401.
    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken: original });
    expect(reuse.status).toBe(401);

    // …and the whole chain is burned, so the freshly rotated token dies too.
    const burned = await request(app).post('/api/auth/refresh').send({ refreshToken: rotated });
    expect(burned.status).toBe(401);
  });

  it('rejects a protected route with no token', async () => {
    const res = await request(app).get('/api/user/me');
    expect(res.status).toBe(401);
  });
});
