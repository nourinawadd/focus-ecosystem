import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import User from '../models/User.js';

const app = createApp();
let seq = 0;
const VALID_TOKEN = 'ExponentPushToken[test-push-token-abc123]';

async function makeUser() {
  const reg = await request(app).post('/api/auth/register')
    .send({ name: 'Push User', email: `push-${seq++}@example.test`, password: 'sup3rsecret' });
  return { token: reg.body.accessToken, id: reg.body.user.id };
}

const auth = t => ({ Authorization: `Bearer ${t}` });

// ─── POST /api/user/push-token ────────────────────────────────────────────────

describe('POST /api/user/push-token', () => {
  it('stores a valid Expo push token', async () => {
    const { token, id } = await makeUser();
    const res = await request(app).post('/api/user/push-token').set(auth(token))
      .send({ token: VALID_TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const user = await User.findById(id);
    expect(user.pushTokens).toContain(VALID_TOKEN);
  });

  it('deduplicates the same token ($addToSet)', async () => {
    const { token, id } = await makeUser();
    await request(app).post('/api/user/push-token').set(auth(token)).send({ token: VALID_TOKEN });
    await request(app).post('/api/user/push-token').set(auth(token)).send({ token: VALID_TOKEN });
    const user = await User.findById(id);
    expect(user.pushTokens.filter(t => t === VALID_TOKEN)).toHaveLength(1);
  });

  it('accepts a second distinct token', async () => {
    const { token, id } = await makeUser();
    const other = 'ExponentPushToken[second-device-token-xyz]';
    await request(app).post('/api/user/push-token').set(auth(token)).send({ token: VALID_TOKEN });
    await request(app).post('/api/user/push-token').set(auth(token)).send({ token: other });
    const user = await User.findById(id);
    expect(user.pushTokens).toHaveLength(2);
  });

  it('rejects a non-Expo token with 400', async () => {
    const { token } = await makeUser();
    const res = await request(app).post('/api/user/push-token').set(auth(token))
      .send({ token: 'not-an-expo-token' });
    expect(res.status).toBe(400);
  });

  it('rejects a missing token body with 400', async () => {
    const { token } = await makeUser();
    const res = await request(app).post('/api/user/push-token').set(auth(token)).send({});
    expect(res.status).toBe(400);
  });

  it('requires authentication (401 without header)', async () => {
    const res = await request(app).post('/api/user/push-token').send({ token: VALID_TOKEN });
    expect(res.status).toBe(401);
  });
});

// ─── DELETE /api/user/push-token ─────────────────────────────────────────────

describe('DELETE /api/user/push-token', () => {
  it('removes a stored push token', async () => {
    const { token, id } = await makeUser();
    await request(app).post('/api/user/push-token').set(auth(token)).send({ token: VALID_TOKEN });

    const del = await request(app).delete('/api/user/push-token').set(auth(token))
      .send({ token: VALID_TOKEN });
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);

    const user = await User.findById(id);
    expect(user.pushTokens).not.toContain(VALID_TOKEN);
  });

  it('is a no-op for a token that was never stored (200)', async () => {
    const { token } = await makeUser();
    const res = await request(app).delete('/api/user/push-token').set(auth(token))
      .send({ token: VALID_TOKEN });
    expect(res.status).toBe(200);
  });

  it('does not remove a different user\'s token', async () => {
    const alice = await makeUser();
    const bob   = await makeUser();
    await request(app).post('/api/user/push-token').set(auth(alice.token)).send({ token: VALID_TOKEN });

    await request(app).delete('/api/user/push-token').set(auth(bob.token))
      .send({ token: VALID_TOKEN });

    const aliceUser = await User.findById(alice.id);
    expect(aliceUser.pushTokens).toContain(VALID_TOKEN);
  });

  it('rejects a missing token body with 400', async () => {
    const { token } = await makeUser();
    const res = await request(app).delete('/api/user/push-token').set(auth(token)).send({});
    expect(res.status).toBe(400);
  });
});

// ─── notify settings (PATCH /api/user/settings) ──────────────────────────────

describe('notify settings', () => {
  it('persists individual notify.* flags and leaves others at their defaults', async () => {
    const { token } = await makeUser();
    const res = await request(app).patch('/api/user/settings').set(auth(token))
      .send({ notify: { dailyNudge: false, streakAlert: false } });
    expect(res.status).toBe(200);
    const { notify } = res.body.settings;
    expect(notify.dailyNudge).toBe(false);
    expect(notify.streakAlert).toBe(false);
    // Untouched flags keep their schema defaults.
    expect(notify.inSessionAlerts).toBe(true);
    expect(notify.dailySummary).toBe(true);
    expect(notify.goalNudge).toBe(true);
    expect(notify.goalAchieved).toBe(true);
  });

  it('persists reminderHour', async () => {
    const { token } = await makeUser();
    const res = await request(app).patch('/api/user/settings').set(auth(token))
      .send({ reminderHour: 21 });
    expect(res.status).toBe(200);
    expect(res.body.settings.reminderHour).toBe(21);
  });

  it('rejects reminderHour out of range (0–23)', async () => {
    const { token } = await makeUser();
    expect((await request(app).patch('/api/user/settings').set(auth(token)).send({ reminderHour: 24 })).status).toBe(400);
    expect((await request(app).patch('/api/user/settings').set(auth(token)).send({ reminderHour: -1 })).status).toBe(400);
  });

  it('rejects a non-boolean notify flag with 400', async () => {
    const { token } = await makeUser();
    const res = await request(app).patch('/api/user/settings').set(auth(token))
      .send({ notify: { dailyNudge: 'yes' } });
    expect(res.status).toBe(400);
  });

  it('can toggle all six notify flags in a single PATCH', async () => {
    const { token } = await makeUser();
    const allOff = {
      notify: {
        dailyNudge: false, inSessionAlerts: false, dailySummary: false,
        streakAlert: false, goalNudge: false, goalAchieved: false,
      },
    };
    const res = await request(app).patch('/api/user/settings').set(auth(token)).send(allOff);
    expect(res.status).toBe(200);
    const { notify } = res.body.settings;
    expect(Object.values(notify).every(v => v === false)).toBe(true);
  });
});
