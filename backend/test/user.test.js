import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

let seq = 0;
async function makeUser() {
  const reg = await request(app).post('/api/auth/register')
    .send({ name: 'Settings User', email: `settings-${seq++}@example.test`, password: 'sup3rsecret' });
  return reg.body.accessToken;
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('GET /api/user/me', () => {
  it('returns the current user without the password hash', async () => {
    const token = await makeUser();
    const res = await request(app).get('/api/user/me').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.email).toMatch(/settings-\d+@example\.test/);
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.settings).toBeDefined();
  });
});

describe('PATCH /api/user/settings', () => {
  it('updates valid fields and returns the new settings', async () => {
    const token = await makeUser();
    const res = await request(app).patch('/api/user/settings').set(auth(token))
      .send({ dailyGoalMinutes: 180, defaultTimerMode: 'POMODORO', timezone: 'Europe/Istanbul' });
    expect(res.status).toBe(200);
    expect(res.body.settings).toMatchObject({
      dailyGoalMinutes: 180, defaultTimerMode: 'POMODORO', timezone: 'Europe/Istanbul',
    });
  });

  it('rejects an out-of-bounds numeric setting (400)', async () => {
    const token = await makeUser();
    const res = await request(app).patch('/api/user/settings').set(auth(token))
      .send({ dailyGoalMinutes: 99999 });   // max is 1440
    expect(res.status).toBe(400);
  });

  it('rejects an invalid enum value (400)', async () => {
    const token = await makeUser();
    const res = await request(app).patch('/api/user/settings').set(auth(token))
      .send({ defaultSessionType: 'NAPPING' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid IANA timezone (400)', async () => {
    const token = await makeUser();
    const res = await request(app).patch('/api/user/settings').set(auth(token))
      .send({ timezone: 'Not/AZone' });
    expect(res.status).toBe(400);
  });

  it('rejects an empty update (400)', async () => {
    const token = await makeUser();
    const res = await request(app).patch('/api/user/settings').set(auth(token)).send({});
    expect(res.status).toBe(400);
  });
});

describe('NFC tags', () => {
  it('registers a tag (uppercased), lists it, and rejects a duplicate', async () => {
    const token = await makeUser();
    const reg = await request(app).post('/api/user/nfc-tags').set(auth(token))
      .send({ uid: ' a1b2c3 ', label: 'Desk' });
    expect(reg.status).toBe(201);
    expect(reg.body.label).toBe('Desk');
    expect(reg.body.tagId.uid).toBe('A1B2C3');   // trimmed + uppercased

    const list = await request(app).get('/api/user/nfc-tags').set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const dup = await request(app).post('/api/user/nfc-tags').set(auth(token)).send({ uid: 'a1b2c3' });
    expect(dup.status).toBe(409);
  });

  it('requires a uid (400)', async () => {
    const token = await makeUser();
    const res = await request(app).post('/api/user/nfc-tags').set(auth(token)).send({ label: 'No uid' });
    expect(res.status).toBe(400);
  });

  it('deletes an owned tag and 404s on an unknown one', async () => {
    const token = await makeUser();
    const reg = await request(app).post('/api/user/nfc-tags').set(auth(token)).send({ uid: 'DEADBEEF' });

    const del = await request(app).delete(`/api/user/nfc-tags/${reg.body._id}`).set(auth(token));
    expect(del.status).toBe(200);

    const missing = await request(app)
      .delete('/api/user/nfc-tags/64b7f0000000000000000000').set(auth(token));
    expect(missing.status).toBe(404);
  });

  it('verifies tag ownership: owned → valid, unknown → invalid, others → invalid', async () => {
    const owner    = await makeUser();
    const intruder = await makeUser();
    await request(app).post('/api/user/nfc-tags').set(auth(owner)).send({ uid: 'SHARED01' });

    const ownerCheck = await request(app).post('/api/user/nfc-verify').set(auth(owner)).send({ uid: 'shared01' });
    expect(ownerCheck.body.valid).toBe(true);

    const unknown = await request(app).post('/api/user/nfc-verify').set(auth(owner)).send({ uid: 'NOPE' });
    expect(unknown.body.valid).toBe(false);

    // The tag exists globally but isn't registered to the intruder.
    const intruderCheck = await request(app).post('/api/user/nfc-verify').set(auth(intruder)).send({ uid: 'SHARED01' });
    expect(intruderCheck.body.valid).toBe(false);
  });
});
