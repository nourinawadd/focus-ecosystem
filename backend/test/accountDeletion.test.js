import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import User from '../models/User.js';
import Session from '../models/Session.js';
import FocusLog from '../models/FocusLog.js';
import Statistics from '../models/Statistics.js';
import UserTag from '../models/UserTag.js';
import NFCTag from '../models/NFCTag.js';
import AIInsight from '../models/AIInsight.js';
import RefreshToken from '../models/RefreshToken.js';

const app = createApp();

let seq = 0;
async function makeUser() {
  const reg = await request(app).post('/api/auth/register')
    .send({ name: 'Delete Me', email: `delete-${seq++}@example.test`, password: 'sup3rsecret' });
  return { token: reg.body.accessToken, refreshToken: reg.body.refreshToken, user: reg.body.user };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Create one of each owned document type for the user behind `token`. */
async function seedOwnedData(token) {
  // Session (+ its SESSION_STARTED FocusLog) via the API.
  const session = await request(app).post('/api/sessions').set(auth(token))
    .send({ dateStr: today(), timerConfig: { plannedDuration: 25 } });
  expect(session.status).toBe(201);

  // End it so Statistics get built via syncStats.
  const end = await request(app).patch(`/api/sessions/${session.body.id}/end`).set(auth(token))
    .send({ status: 'COMPLETED', timerState: { actualDuration: 25 } });
  expect(end.status).toBe(200);

  // NFC tag link via the API (creates the global NFCTag + the UserTag join).
  const tag = await request(app).post('/api/user/nfc-tags').set(auth(token))
    .send({ uid: 'AA:BB:CC:DD', label: 'Desk' });
  expect(tag.status).toBe(201);

  return session.body.id;
}

describe('DELETE /api/user/me', () => {
  it('requires authentication', async () => {
    const res = await request(app).delete('/api/user/me');
    expect(res.status).toBe(401);
  });

  it('deletes the user and every owned document, but keeps global NFC tags', async () => {
    const { token, user } = await makeUser();
    await seedOwnedData(token);
    await AIInsight.create({ userId: user.id });

    const userId = (await User.findOne({ email: user.email }))._id;

    const res = await request(app).delete('/api/user/me').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });

    expect(await User.findById(userId)).toBeNull();
    expect(await Session.countDocuments({ userId })).toBe(0);
    expect(await FocusLog.countDocuments({ userId })).toBe(0);
    expect(await Statistics.countDocuments({ userId })).toBe(0);
    expect(await UserTag.countDocuments({ userId })).toBe(0);
    expect(await AIInsight.countDocuments({ userId })).toBe(0);
    expect(await RefreshToken.countDocuments({ userId })).toBe(0);

    // The physical tag record is shared across users and must survive.
    expect(await NFCTag.countDocuments({ uid: 'AA:BB:CC:DD' })).toBe(1);
  });

  it('invalidates the session: subsequent authed requests fail', async () => {
    const { token, refreshToken } = await makeUser();

    const res = await request(app).delete('/api/user/me').set(auth(token));
    expect(res.status).toBe(200);

    // Access token now resolves to a missing user.
    const me = await request(app).get('/api/user/me').set(auth(token));
    expect(me.status).toBe(401);

    // Refresh chain is dead too.
    const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(refresh.status).toBe(401);
  });

  it('does not touch another user\'s data', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await seedOwnedData(b.token);

    const res = await request(app).delete('/api/user/me').set(auth(a.token));
    expect(res.status).toBe(200);

    const bUserId = (await User.findOne({ email: b.user.email }))._id;
    expect(await User.findById(bUserId)).not.toBeNull();
    expect(await Session.countDocuments({ userId: bUserId })).toBe(1);
    expect(await UserTag.countDocuments({ userId: bUserId })).toBe(1);
  });
});
