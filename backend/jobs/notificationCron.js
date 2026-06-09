import cron from 'node-cron';
import User from '../models/User.js';
import Statistics from '../models/Statistics.js';
import { sendPush } from '../utils/push.js';
import { toUserDate, userTodayStr } from '../utils/datetime.js';
import logger from '../utils/logger.js';

// ─── Per-user processing ──────────────────────────────────────────────────────

export async function processUser(user, now) {
  const tz           = user.settings?.timezone  || 'UTC';
  const { hour }     = toUserDate(now, tz);
  const today        = userTodayStr(tz);
  const reminderHour = user.settings?.reminderHour ?? 20;
  const notify       = user.settings?.notify        ?? {};
  const notifyState  = user.notifyState             ?? {};

  const dead         = [];
  const stateUpdates = {};

  // ── At reminderHour: daily summary + goal-progress nudge ─────────────────
  if (hour === reminderHour) {
    const stat = await Statistics.findOne(
      { userId: user._id, dateStr: today },
      { totalFocusMinutes: 1, sessionsCompleted: 1, dailyFocusScore: 1 },
    );
    const mins     = stat?.totalFocusMinutes ?? 0;
    const sessions = stat?.sessionsCompleted ?? 0;
    const score    = stat?.dailyFocusScore   ?? 0;

    if (notify.dailySummary && notifyState.summaryDateStr !== today) {
      const body = sessions > 0
        ? `${mins} min across ${sessions} session${sessions !== 1 ? 's' : ''} · score ${score}`
        : "No sessions yet today — there's still time!";
      const dead2 = await sendPush(user.pushTokens, {
        title: "Today's focus summary",
        body,
        data: { type: 'DAILY_SUMMARY' },
      });
      dead.push(...dead2);
      stateUpdates['notifyState.summaryDateStr'] = today;
    }

    // Goal-progress nudge: some progress but not yet at goal.
    const goal = user.settings?.dailyGoalMinutes ?? 120;
    if (notify.goalNudge && notifyState.goalDateStr !== today && mins > 0 && mins < goal) {
      const pct       = Math.round((mins / goal) * 100);
      const remaining = goal - mins;
      const dead2 = await sendPush(user.pushTokens, {
        title: `${pct}% to your daily goal`,
        body:  `${remaining} more minute${remaining !== 1 ? 's' : ''} of focus to hit ${goal} min today.`,
        data:  { type: 'GOAL_NUDGE' },
      });
      dead.push(...dead2);
      stateUpdates['notifyState.goalDateStr'] = today;
    }
  }

  // ── At reminderHour+1: streak-at-risk ────────────────────────────────────
  if (hour === (reminderHour + 1) % 24) {
    if (notify.streakAlert && notifyState.streakDateStr !== today) {
      // computeStreak is authoritative: it uses a grace period so a day with no
      // sessions yet doesn't prematurely zero a live streak.
      const { current: streak } = await Statistics.computeStreak(user._id, tz);
      if (streak > 0) {
        const todayStat = await Statistics.findOne(
          { userId: user._id, dateStr: today },
          { totalFocusMinutes: 1 },
        );
        if ((todayStat?.totalFocusMinutes ?? 0) === 0) {
          const dead2 = await sendPush(user.pushTokens, {
            title: 'Your streak is at risk 🔥',
            body:  `You have a ${streak}-day streak — start a session to keep it alive.`,
            data:  { type: 'STREAK_AT_RISK' },
          });
          dead.push(...dead2);
          stateUpdates['notifyState.streakDateStr'] = today;
        }
      }
    }
  }

  // Flush idempotency stamps and prune dead tokens in a single write.
  if (!Object.keys(stateUpdates).length && !dead.length) return;

  const update = {};
  if (Object.keys(stateUpdates).length) update.$set  = stateUpdates;
  if (dead.length)                       update.$pull = { pushTokens: { $in: dead } };
  await User.findByIdAndUpdate(user._id, update);
}

// ─── Cron tick ────────────────────────────────────────────────────────────────

async function runNotificationCron() {
  const now = new Date();
  logger.info('[notifCron] tick');

  // Stream eligible users; never load the full collection into memory.
  const cursor = User.find({
    'settings.notificationsEnabled': true,
    'pushTokens.0': { $exists: true },
  }).cursor();

  for await (const user of cursor) {
    try {
      await processUser(user, now);
    } catch (err) {
      logger.error({ err, userId: user._id }, '[notifCron] user error');
    }
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function startNotificationCron() {
  cron.schedule('0 * * * *', () => {
    runNotificationCron().catch(err =>
      logger.error({ err }, '[notifCron] run failed'),
    );
  });
  logger.info('[notifCron] scheduled (0 * * * *)');
}
