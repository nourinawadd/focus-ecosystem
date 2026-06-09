import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock before any import that loads routes/sessions.js.
vi.mock('../utils/push.js', () => ({
  sendPush: vi.fn().mockResolvedValue([]),
}));

import { sendPush } from '../utils/push.js';
import request from 'supertest';
import { createApp } from '../app.js';
import User from '../models/User.js';

const app   = createApp();
let seq     = 0;
const today = new Date().toISOString().slice(0, 10);
// A token that passes Expo.isExpoPushToken validation.
const PUSH_TOKEN = 'ExponentPushToken[goal-achieved-test-token]';

const auth = t => ({ Authorization: `Bearer ${t}` });

async function makeUser() {
  const reg = await request(app).post('/api/auth/register')
    .send({ name: 'Goal User', email: `goal-${seq++}@example.test`, password: 'sup3rsecret' });
  return { token: reg.body.accessToken, id: reg.body.user.id };
}

function startSession(token, plannedDuration = 25) {
  return request(app).post('/api/sessions').set(auth(token)).send({
    type: 'STUDY', timerMode: 'COUNTDOWN',
    timerConfig: { plannedDuration },
    dateStr: today, startedAt: new Date().toISOString(),
  });
}

function endSession(token, id, actualDuration = 25, status = 'COMPLETED') {
  return request(app).patch(`/api/sessions/${id}/end`).set(auth(token))
    .send({ status, timerState: { actualDuration } });
}

beforeEach(() => sendPush.mockClear());

describe('goal-achieved push (session end)', () => {
  it('fires when a COMPLETED session crosses the daily goal threshold', async () => {
    const { token, id } = await makeUser();
    // Small goal so one 25-min session crosses it.
    await request(app).patch('/api/user/settings').set(auth(token))
      .send({ dailyGoalMinutes: 25 });
    // Insert push token directly — the route is unit-tested in pushToken.test.js.
    await User.findByIdAndUpdate(id, { $addToSet: { pushTokens: PUSH_TOKEN } });

    const created = await startSession(token, 25);
    await endSession(token, created.body.id, 25);

    expect(sendPush).toHaveBeenCalledOnce();
    const [tokens, msg] = sendPush.mock.calls[0];
    expect(tokens).toContain(PUSH_TOKEN);
    expect(msg.data.type).toBe('GOAL_ACHIEVED');
    expect(msg.title).toMatch(/goal achieved/i);
    expect(msg.body).toMatch(/25/);
  });

  it('does not fire for an ABANDONED session', async () => {
    const { token, id } = await makeUser();
    await request(app).patch('/api/user/settings').set(auth(token))
      .send({ dailyGoalMinutes: 25 });
    await User.findByIdAndUpdate(id, { $addToSet: { pushTokens: PUSH_TOKEN } });

    const created = await startSession(token, 25);
    await endSession(token, created.body.id, 25, 'ABANDONED');

    expect(sendPush).not.toHaveBeenCalled();
  });

  it('does not fire when the goal was already exceeded before the session ended', async () => {
    const { token, id } = await makeUser();
    await request(app).patch('/api/user/settings').set(auth(token))
      .send({ dailyGoalMinutes: 25 });
    await User.findByIdAndUpdate(id, { $addToSet: { pushTokens: PUSH_TOKEN } });

    // First session crosses the goal.
    const s1 = await startSession(token, 25);
    await endSession(token, s1.body.id, 25);
    expect(sendPush).toHaveBeenCalledOnce();
    sendPush.mockClear();

    // Second session: prevMinutes(25) is already ≥ goal(25), so condition prevMinutes < goal is false.
    const s2 = await startSession(token, 25);
    await endSession(token, s2.body.id, 25);

    expect(sendPush).not.toHaveBeenCalled();
  });

  it('does not fire when the user has no push tokens', async () => {
    const { token } = await makeUser();
    await request(app).patch('/api/user/settings').set(auth(token))
      .send({ dailyGoalMinutes: 25 });
    // No tokens added.

    const created = await startSession(token, 25);
    await endSession(token, created.body.id, 25);

    expect(sendPush).not.toHaveBeenCalled();
  });

  it('does not fire when notificationsEnabled is false', async () => {
    const { token, id } = await makeUser();
    await request(app).patch('/api/user/settings').set(auth(token))
      .send({ dailyGoalMinutes: 25, notificationsEnabled: false });
    await User.findByIdAndUpdate(id, { $addToSet: { pushTokens: PUSH_TOKEN } });

    const created = await startSession(token, 25);
    await endSession(token, created.body.id, 25);

    expect(sendPush).not.toHaveBeenCalled();
  });

  it('does not fire when goalAchieved notify flag is off', async () => {
    const { token, id } = await makeUser();
    await request(app).patch('/api/user/settings').set(auth(token))
      .send({ dailyGoalMinutes: 25, notify: { goalAchieved: false } });
    await User.findByIdAndUpdate(id, { $addToSet: { pushTokens: PUSH_TOKEN } });

    const created = await startSession(token, 25);
    await endSession(token, created.body.id, 25);

    expect(sendPush).not.toHaveBeenCalled();
  });

  it('prunes dead tokens returned from sendPush', async () => {
    const { token, id } = await makeUser();
    await request(app).patch('/api/user/settings').set(auth(token))
      .send({ dailyGoalMinutes: 25 });
    await User.findByIdAndUpdate(id, { $addToSet: { pushTokens: PUSH_TOKEN } });

    // Expo reports this device as unregistered.
    sendPush.mockResolvedValueOnce([PUSH_TOKEN]);

    const created = await startSession(token, 25);
    await endSession(token, created.body.id, 25);

    const user = await User.findById(id);
    expect(user.pushTokens).not.toContain(PUSH_TOKEN);
  });
});
