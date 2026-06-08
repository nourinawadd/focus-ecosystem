import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

// dateStr in UTC, matching the server's default-timezone "today".
const today = new Date().toISOString().slice(0, 10);

let userSeq = 0;
async function makeUser() {
  const email = `session-user-${userSeq++}@example.test`;
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Session User', email, password: 'sup3rsecret' });
  return { token: reg.body.accessToken, userId: reg.body.user.id };
}

function createSession(token, overrides = {}) {
  return request(app)
    .post('/api/sessions')
    .set('Authorization', `Bearer ${token}`)
    .send({
      type:        'STUDY',
      timerMode:   'COUNTDOWN',
      timerConfig: { plannedDuration: 25 },
      dateStr:     today,
      startedAt:   new Date().toISOString(),
      ...overrides,
    });
}

describe('session lifecycle', () => {
  it('create → log distractions → end → score, logs, stats, streak', async () => {
    const { token } = await makeUser();

    // ── create ──
    const created = await createSession(token);
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect(id).toBeTruthy();

    // ── log two distractions ──
    for (let i = 0; i < 2; i++) {
      const log = await request(app)
        .post(`/api/sessions/${id}/log`)
        .set('Authorization', `Bearer ${token}`)
        .send({ event: 'APP_BLOCKED', metadata: { packageName: 'com.example.app' } });
      expect(log.status).toBe(201);
    }

    // ── end (completed) ──
    const ended = await request(app)
      .patch(`/api/sessions/${id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'COMPLETED', timerState: { actualDuration: 25 } });
    expect(ended.status).toBe(200);
    expect(ended.body.session.completed).toBe(true);
    // ratio 1 → 80, +12, − min(24, 2*4)=8 → 84. Score is server-computed.
    expect(ended.body.session.focusScore).toBe(84);
    expect(ended.body.streak).toBe(1);

    // ── focus log count: STARTED + 2×APP_BLOCKED + ENDED = 4 ──
    const logs = await request(app)
      .get(`/api/sessions/${id}/logs`)
      .set('Authorization', `Bearer ${token}`);
    expect(logs.status).toBe(200);
    expect(logs.body).toHaveLength(4);

    // ── statistics rebuilt for the day ──
    const stats = await request(app)
      .get(`/api/analytics/statistics?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${token}`);
    expect(stats.status).toBe(200);
    expect(stats.body).toHaveLength(1);
    expect(stats.body[0]).toMatchObject({
      sessionsCompleted: 1,
      totalFocusMinutes: 25,
      dailyFocusScore:   84,
      currentStreak:     1,
    });
  });

  it('ignores a client-supplied focusScore and recomputes server-side', async () => {
    const { token } = await makeUser();
    const created = await createSession(token);
    const ended = await request(app)
      .patch(`/api/sessions/${created.body.id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'COMPLETED', timerState: { actualDuration: 25 }, focusScore: 100 });
    expect(ended.status).toBe(200);
    // No distractions: 80 + 12 = 92, not the client's 100.
    expect(ended.body.session.focusScore).toBe(92);
  });

  it('rejects ending an already-ended session with 400', async () => {
    const { token } = await makeUser();
    const created = await createSession(token);
    const end = () => request(app)
      .patch(`/api/sessions/${created.body.id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'COMPLETED', timerState: { actualDuration: 25 } });

    expect((await end()).status).toBe(200);
    expect((await end()).status).toBe(400);
  });

  it("returns 404 when ending another user's session", async () => {
    const owner = await makeUser();
    const created = await createSession(owner.token);

    const intruder = await makeUser();
    const res = await request(app)
      .patch(`/api/sessions/${created.body.id}/end`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .send({ status: 'COMPLETED', timerState: { actualDuration: 25 } });
    expect(res.status).toBe(404);
  });

  it('rejects out-of-bounds plannedDuration with 400', async () => {
    const { token } = await makeUser();
    const tooLow  = await createSession(token, { timerConfig: { plannedDuration: 0 } });
    const tooHigh = await createSession(token, { timerConfig: { plannedDuration: 9999 } });
    expect(tooLow.status).toBe(400);
    expect(tooHigh.status).toBe(400);
  });

  it('rejects a malformed session id with 400', async () => {
    const { token } = await makeUser();
    const res = await request(app)
      .get('/api/sessions/not-an-object-id/logs')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
