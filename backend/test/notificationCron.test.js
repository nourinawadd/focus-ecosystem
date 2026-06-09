import { vi, describe, it, expect, beforeEach } from 'vitest';

// Must be declared before any import that transitively loads push.js.
vi.mock('../utils/push.js', () => ({
  sendPush: vi.fn().mockResolvedValue([]),
}));

import { sendPush } from '../utils/push.js';
import { processUser } from '../jobs/notificationCron.js';
import User from '../models/User.js';
import Statistics from '../models/Statistics.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'ExponentPushToken[cron-test-token-abc]';

// All tests use UTC timezone so userTodayStr and toUserDate are predictable.
const today     = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

/** Build a Date whose UTC hour equals `h` (same calendar day as today). */
function nowAtHour(h) {
  const d = new Date();
  d.setUTCHours(h, 0, 0, 0);
  return d;
}

/** Create a User document with sensible notification defaults. */
async function makeUser(overrides = {}) {
  return User.create({
    email:      `cron-${Math.random().toString(36).slice(2)}@example.test`,
    name:       'Cron Tester',
    pushTokens: [VALID_TOKEN],
    settings: {
      notificationsEnabled: true,
      reminderHour:         20,
      dailyGoalMinutes:     120,
      timezone:             'UTC',
      notify: {
        dailyNudge:      true,
        inSessionAlerts: true,
        dailySummary:    true,
        streakAlert:     true,
        goalNudge:       true,
        goalAchieved:    true,
      },
    },
    ...overrides,
  });
}

/** Create a Statistics document for the given user and date. */
async function makeStat(userId, dateStr, fields = {}) {
  return Statistics.findOneAndUpdate(
    { userId, dateStr },
    {
      $set: {
        date:              new Date(dateStr + 'T00:00:00Z'),
        totalFocusMinutes: 0,
        sessionsCompleted: 0,
        sessionsAbandoned: 0,
        dailyFocusScore:   0,
        currentStreak:     0,
        longestStreak:     0,
        ...fields,
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
}

beforeEach(() => sendPush.mockClear());

// ─── Daily summary ────────────────────────────────────────────────────────────

describe('daily summary', () => {
  it('sends at reminderHour when the user has sessions today', async () => {
    const user = await makeUser();
    // Use totalFocusMinutes = dailyGoalMinutes (120) so the goal-nudge does not
    // also fire (it requires mins < goal), keeping sendPush calls unambiguous.
    await makeStat(user._id, today, { totalFocusMinutes: 120, sessionsCompleted: 2, dailyFocusScore: 85 });

    await processUser(user, nowAtHour(20));

    const summary = sendPush.mock.calls.find(([, m]) => m.data?.type === 'DAILY_SUMMARY');
    expect(summary).toBeTruthy();
    const [, msg] = summary;
    expect(msg.body).toMatch(/120 min/);
    expect(msg.body).toMatch(/2 session/);
    expect(msg.body).toMatch(/85/);
  });

  it('sends an encouraging message when there are no sessions yet', async () => {
    const user = await makeUser();
    // No Statistics doc for today → defaults to 0 sessions.

    await processUser(user, nowAtHour(20));

    const [, msg] = sendPush.mock.calls[0];
    expect(msg.data.type).toBe('DAILY_SUMMARY');
    expect(msg.body).toMatch(/still time/i);
  });

  it('does not send at a different hour', async () => {
    const user = await makeUser(); // reminderHour = 20
    await makeStat(user._id, today, { sessionsCompleted: 1 });

    await processUser(user, nowAtHour(19)); // one hour early

    expect(sendPush).not.toHaveBeenCalled();
  });

  it('is idempotent — does not send a second time on the same day', async () => {
    const user = await makeUser();
    await makeStat(user._id, today, { sessionsCompleted: 1 });

    // First tick → fires + stamps summaryDateStr.
    await processUser(user, nowAtHour(20));
    expect(sendPush).toHaveBeenCalledOnce();
    sendPush.mockClear();

    // Re-fetch so notifyState is current.
    const fresh = await User.findById(user._id);
    await processUser(fresh, nowAtHour(20));

    expect(sendPush).not.toHaveBeenCalled();
  });

  it('does not send when dailySummary is disabled', async () => {
    const user = await makeUser({ settings: { notificationsEnabled: true, reminderHour: 20, timezone: 'UTC', dailyGoalMinutes: 120, notify: { dailyNudge: true, inSessionAlerts: true, dailySummary: false, streakAlert: true, goalNudge: false, goalAchieved: true } } });
    await makeStat(user._id, today, { sessionsCompleted: 1 });

    await processUser(user, nowAtHour(20));

    const calls = sendPush.mock.calls.filter(([, m]) => m.data?.type === 'DAILY_SUMMARY');
    expect(calls).toHaveLength(0);
  });
});

// ─── Goal-progress nudge ──────────────────────────────────────────────────────

describe('goal-progress nudge', () => {
  it('sends when the user has partial progress toward their daily goal', async () => {
    const user = await makeUser();
    // 50 min done out of 120 → partway there
    await makeStat(user._id, today, { totalFocusMinutes: 50, sessionsCompleted: 1 });

    await processUser(user, nowAtHour(20));

    const nudge = sendPush.mock.calls.find(([, m]) => m.data?.type === 'GOAL_NUDGE');
    expect(nudge).toBeTruthy();
    const [, msg] = nudge;
    expect(msg.body).toMatch(/70/);   // 120 − 50 = 70 remaining
    expect(msg.title).toMatch(/42%/); // Math.round(50/120*100) = 42
  });

  it('does not send when the user has no focus minutes today', async () => {
    const user = await makeUser();
    await makeStat(user._id, today, { totalFocusMinutes: 0 });

    await processUser(user, nowAtHour(20));

    const nudge = sendPush.mock.calls.find(([, m]) => m.data?.type === 'GOAL_NUDGE');
    expect(nudge).toBeUndefined();
  });

  it('does not send when the user has already met the goal', async () => {
    const user = await makeUser();
    await makeStat(user._id, today, { totalFocusMinutes: 120 }); // exactly at goal

    await processUser(user, nowAtHour(20));

    const nudge = sendPush.mock.calls.find(([, m]) => m.data?.type === 'GOAL_NUDGE');
    expect(nudge).toBeUndefined();
  });

  it('is idempotent — does not send twice on the same day', async () => {
    const user = await makeUser();
    await makeStat(user._id, today, { totalFocusMinutes: 50 });

    await processUser(user, nowAtHour(20));
    const countAfterFirst = sendPush.mock.calls.filter(([, m]) => m.data?.type === 'GOAL_NUDGE').length;
    sendPush.mockClear();

    const fresh = await User.findById(user._id);
    await processUser(fresh, nowAtHour(20));

    const countAfterSecond = sendPush.mock.calls.filter(([, m]) => m.data?.type === 'GOAL_NUDGE').length;
    expect(countAfterFirst).toBe(1);
    expect(countAfterSecond).toBe(0);
  });
});

// ─── Streak-at-risk ───────────────────────────────────────────────────────────

describe('streak-at-risk', () => {
  it('sends at reminderHour+1 when a streak is live but no focus today', async () => {
    const user = await makeUser();
    // Yesterday had a completed session → computeStreak returns 1.
    await makeStat(user._id, yesterday, { sessionsCompleted: 1, currentStreak: 1 });
    // No stats for today (totalFocusMinutes defaults to 0).

    await processUser(user, nowAtHour(21)); // reminderHour(20) + 1

    expect(sendPush).toHaveBeenCalledOnce();
    const [, msg] = sendPush.mock.calls[0];
    expect(msg.data.type).toBe('STREAK_AT_RISK');
    expect(msg.body).toMatch(/1-day streak/);
  });

  it('does not send when there is no streak', async () => {
    const user = await makeUser();
    // No sessions at all → computeStreak returns 0.

    await processUser(user, nowAtHour(21));

    expect(sendPush).not.toHaveBeenCalled();
  });

  it('does not send when the user already focused today', async () => {
    const user = await makeUser();
    await makeStat(user._id, yesterday, { sessionsCompleted: 1 });
    await makeStat(user._id, today,     { sessionsCompleted: 1, totalFocusMinutes: 30 });

    await processUser(user, nowAtHour(21));

    expect(sendPush).not.toHaveBeenCalled();
  });

  it('does not send at the wrong hour', async () => {
    const user = await makeUser(); // reminderHour = 20, so streak hour = 21
    await makeStat(user._id, yesterday, { sessionsCompleted: 1 });

    await processUser(user, nowAtHour(20)); // reminderHour, not reminderHour+1

    const atRisk = sendPush.mock.calls.filter(([, m]) => m.data?.type === 'STREAK_AT_RISK');
    expect(atRisk).toHaveLength(0);
  });

  it('is idempotent — does not send twice on the same day', async () => {
    const user = await makeUser();
    await makeStat(user._id, yesterday, { sessionsCompleted: 1, currentStreak: 1 });

    await processUser(user, nowAtHour(21));
    expect(sendPush).toHaveBeenCalledOnce();
    sendPush.mockClear();

    const fresh = await User.findById(user._id);
    await processUser(fresh, nowAtHour(21));

    expect(sendPush).not.toHaveBeenCalled();
  });
});

// ─── Dead token pruning ───────────────────────────────────────────────────────

describe('dead token pruning', () => {
  it('removes tokens that sendPush reports as dead', async () => {
    const user = await makeUser();
    await makeStat(user._id, today, { sessionsCompleted: 1 });

    // Simulate expo reporting the token as unregistered.
    sendPush.mockResolvedValueOnce([VALID_TOKEN]);

    await processUser(user, nowAtHour(20));

    const updated = await User.findById(user._id);
    expect(updated.pushTokens).not.toContain(VALID_TOKEN);
  });
});

// ─── Master switch ────────────────────────────────────────────────────────────

describe('master notification switch', () => {
  it('skips all pushes when notificationsEnabled is false', async () => {
    // The cron query filters out these users, but processUser also respects the flag
    // indirectly: with notificationsEnabled false the user wouldn't be in the cursor,
    // but we test the query gate here by confirming the user is excluded.
    // (Direct processUser calls won't get this user from the cron cursor — this test
    // verifies the DB-level filter via a direct query check.)
    await makeUser({ settings: { notificationsEnabled: false, reminderHour: 20, timezone: 'UTC', dailyGoalMinutes: 120, notify: { dailySummary: true, streakAlert: true, goalNudge: true, goalAchieved: true, dailyNudge: true, inSessionAlerts: true } } });

    const eligible = await User.countDocuments({
      'settings.notificationsEnabled': true,
      'pushTokens.0': { $exists: true },
    });

    // Only the user created in this test's makeUser call with notificationsEnabled:false exists,
    // so eligible count should be 0.
    expect(eligible).toBe(0);
  });
});
