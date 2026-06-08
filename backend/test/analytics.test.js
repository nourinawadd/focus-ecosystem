import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { userTodayStr, shiftDateStr } from '../utils/datetime.js';

const app = createApp();

// Dates anchored to the server's default-tz (UTC) "today", matching how
// computeStreaks walks back day-by-day.
const today = userTodayStr('UTC');
const day = (n) => shiftDateStr(today, -n); // n days ago, YYYY-MM-DD

let seq = 0;
async function makeUser() {
  const email = `analytics-${seq++}@example.test`;
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ name: 'A', email, password: 'sup3rsecret' });
  return reg.body.accessToken;
}

// Create a session on a specific day (started at noon UTC that day) and end it.
async function sessionOn(token, dateStr, { status = 'COMPLETED', actualDuration = 30 } = {}) {
  const created = await request(app)
    .post('/api/sessions')
    .set('Authorization', `Bearer ${token}`)
    .send({
      type: 'STUDY', timerMode: 'COUNTDOWN',
      timerConfig: { plannedDuration: 30 },
      dateStr, startedAt: `${dateStr}T12:00:00.000Z`,
    });
  expect(created.status).toBe(201);
  const ended = await request(app)
    .patch(`/api/sessions/${created.body.id}/end`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status, timerState: { actualDuration } });
  expect(ended.status).toBe(200);
  return ended.body;
}

const authGet = (token, path) =>
  request(app).get(path).set('Authorization', `Bearer ${token}`);

describe('streaks', () => {
  it('counts consecutive completed days ending today', async () => {
    const token = await makeUser();
    await sessionOn(token, day(2));
    await sessionOn(token, day(1));
    const last = await sessionOn(token, day(0)); // end "today" last → full streak on today's doc
    expect(last.streak).toBe(3);

    const summary = await authGet(token, '/api/analytics/summary?period=week');
    expect(summary.status).toBe(200);
    expect(summary.body.currentStreak).toBe(3);
    expect(summary.body.longestStreak).toBeGreaterThanOrEqual(3);
  });

  it('resets when a day is skipped (gap breaks the streak)', async () => {
    const token = await makeUser();
    await sessionOn(token, day(2));        // 2 days ago
    const last = await sessionOn(token, day(0)); // today, skipping yesterday
    expect(last.streak).toBe(1);
  });

  it('does not count an abandoned session toward the streak', async () => {
    const token = await makeUser();
    const ended = await sessionOn(token, day(0), { status: 'ABANDONED' });
    expect(ended.streak).toBe(0);
    expect(ended.session.focusScore).toBeNull();
  });

  it('preserves the streak through a still-idle today (grace until midnight)', async () => {
    const token = await makeUser();
    // Completed yesterday, nothing today yet. The streak must not show 0 just
    // because today has no session — it survives until the day ends.
    await sessionOn(token, day(1));
    const summary = await authGet(token, '/api/analytics/summary?period=week');
    expect(summary.status).toBe(200);
    expect(summary.body.currentStreak).toBe(1);
  });

  // LIMITATION (characterization): computeStreaks always counts back from the
  // *real* current date, so backfilling past-dated sessions never reconstructs
  // a historical streak, and longestStreak only ever captures a run that
  // included the actual "today" when it was recorded. In normal day-by-day use
  // (a session completed each real day) this is correct; bulk/retroactive
  // imports are not credited.
  it('does not reconstruct streaks from backdated sessions', async () => {
    const token = await makeUser();
    // "today" is empty, so completing past days yields streak 0 each time.
    const peak = await sessionOn(token, day(2));
    expect(peak.streak).toBe(0);
    await sessionOn(token, day(3));
    await sessionOn(token, day(4));

    // Completing today walks back, but the day(1) gap stops it at 1.
    const todayEnd = await sessionOn(token, day(0));
    expect(todayEnd.streak).toBe(1);

    const summary = await authGet(token, '/api/analytics/summary?period=week');
    expect(summary.body.currentStreak).toBe(1);
    // The 4/3/2-days-ago run was never live "today", so it isn't counted.
    expect(summary.body.longestStreak).toBe(1);
  });
});

describe('analytics summary', () => {
  it('aggregates minutes, counts, completion rate, best hour, bar data', async () => {
    const token = await makeUser();
    await sessionOn(token, day(0), { actualDuration: 30 });
    await sessionOn(token, day(0), { actualDuration: 30 });
    await sessionOn(token, day(0), { status: 'ABANDONED' }); // counts in total, not completed

    const res = await authGet(token, '/api/analytics/summary?period=week');
    expect(res.status).toBe(200);
    expect(res.body.totalFocusMinutes).toBe(60);   // 2 completed × 30
    expect(res.body.completedCount).toBe(2);
    expect(res.body.abandonedCount).toBe(1);
    expect(res.body.sessionsCount).toBe(3);
    expect(res.body.completionRate).toBe(67);       // round(2/3*100)
    expect(res.body.bestHour).toBe(12);             // started at noon UTC
    expect(res.body.barData).toHaveLength(7);       // week → 7 day buckets
    const todayBucket = res.body.barData[6];        // last bucket = today
    // barData counts only COMPLETED minutes (60), matching totalFocusMinutes —
    // the abandoned session contributes to neither.
    expect(todayBucket.minutes).toBe(60);
  });

  it('day period returns 6 four-hour buckets with minutes in the noon slot', async () => {
    const token = await makeUser();
    await sessionOn(token, day(0), { actualDuration: 45 });
    const res = await authGet(token, '/api/analytics/summary?period=day');
    expect(res.status).toBe(200);
    expect(res.body.barData).toHaveLength(6);
    // labels 12a,4a,8a,12p,4p,8p — noon falls in the '12p' bucket (index 3).
    expect(res.body.barData[3]).toMatchObject({ label: '12p', minutes: 45 });
  });
});

describe('history & raw statistics', () => {
  it('lists sessions newest-first and exposes per-day statistics docs', async () => {
    const token = await makeUser();
    await sessionOn(token, day(1));
    await sessionOn(token, day(0));

    const list = await authGet(token, '/api/sessions');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    expect(list.body[0].dateStr).toBe(day(0)); // sorted dateStr desc
    expect(list.body[0].completed).toBe(true);

    const stats = await authGet(token, `/api/analytics/statistics?from=${day(7)}&to=${day(0)}`);
    expect(stats.status).toBe(200);
    expect(stats.body).toHaveLength(2);
    expect(stats.body.map(s => s.dateStr)).toEqual([day(1), day(0)]); // sorted asc
    expect(stats.body.every(s => s.sessionsCompleted === 1)).toBe(true);
    expect(stats.body.every(s => s.mostProductiveHour === 12)).toBe(true);
  });
});
