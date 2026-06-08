import mongoose from 'mongoose';
import { toUserDate, userTodayStr, shiftDateStr } from '../utils/datetime.js';

const StatisticsSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true,
  },
  date:    { type: Date,   required: true },
  dateStr: { type: String, required: true },   
  totalFocusMinutes: { type: Number, default: 0 },
  sessionsCompleted: { type: Number, default: 0 },
  sessionsAbandoned: { type: Number, default: 0 },
  currentStreak: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  mostProductiveHour: { type: Number, default: null, min: 0, max: 23 },
  topBlockedApp:      { type: String, default: null }, 
  dailyFocusScore:  { type: Number, default: 0, min: 0, max: 100 },
  weeklyFocusScore: { type: Number, default: 0, min: 0, max: 100 },

}, {
  timestamps: true,
});

StatisticsSchema.index({ userId: 1, dateStr: 1 }, { unique: true });
StatisticsSchema.index({ userId: 1, date: -1 });

// Rebuild the day's aggregate metrics from raw Session/FocusLog data.
// Streak fields are owned by the caller (sessions.syncStats) and written
// separately, so they are intentionally not touched here.
StatisticsSchema.statics.rebuildForDay = async function (userId, dateStr, tz = 'UTC') {
  const Session  = mongoose.model('Session');
  const FocusLog = mongoose.model('FocusLog');

  const daySessions = await Session.find({ userId, dateStr });
  const completed   = daySessions.filter(s => s.status === 'COMPLETED');
  const abandoned   = daySessions.filter(s => s.status === 'ABANDONED');

  const totalMins = completed.reduce(
    (a, s) => a + (s.timerState?.actualDuration || 0), 0,
  );

  const hourCounts = {};
  for (const s of completed) {
    if (s.startedAt) {
      const h = toUserDate(s.startedAt, tz).hour;
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    }
  }
  const mostProductiveHour = Object.keys(hourCounts).length > 0
    ? Number(Object.entries(hourCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0][0])
    : null;

  const sessionIds = daySessions.map(s => s._id);
  const blockedLogs = await FocusLog.find({
    sessionId: { $in: sessionIds },
    event:     'APP_BLOCKED',
  });
  const pkgCounts = {};
  for (const log of blockedLogs) {
    const pkg = log.metadata?.packageName;
    if (pkg) pkgCounts[pkg] = (pkgCounts[pkg] || 0) + 1;
  }
  const topBlockedApp = Object.keys(pkgCounts).length > 0
    ? Object.entries(pkgCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0][0]
    : null;

  const scored = completed.filter(s => s.focusScore !== null);
  const dailyFocusScore = scored.length > 0
    ? Math.round(scored.reduce((a, s) => a + (s.focusScore || 0), 0) / scored.length)
    : 0;

  const date = new Date(dateStr + 'T00:00:00.000Z');

  return this.findOneAndUpdate(
    { userId, dateStr },
    {
      $set: {
        date,
        totalFocusMinutes: totalMins,
        sessionsCompleted: completed.length,
        sessionsAbandoned: abandoned.length,
        mostProductiveHour,
        topBlockedApp,
        dailyFocusScore,
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
};

// Persist the streak figures computed by sessions.syncStats onto a day's doc.
StatisticsSchema.statics.setStreak = function (userId, dateStr, currentStreak, longestStreak) {
  return this.updateOne(
    { userId, dateStr },
    { $set: { currentStreak, longestStreak } },
  );
};

/**
 * Current + longest streak, walking back day-by-day from "today" in the user's
 * timezone, hitting the unique {userId, dateStr} index. O(streak length).
 *
 * Grace period: a streak stays alive until the day actually ends. We begin the
 * walk at today only if today already has a completed session; otherwise we
 * begin at yesterday — so a day that's merely idle (or has only an abandoned
 * session) so far doesn't prematurely zero a streak that's still live. Longest
 * streak only grows, so it's max(current, the largest ever recorded).
 */
StatisticsSchema.statics.computeStreak = async function (userId, tz = 'UTC') {
  const todayStr  = userTodayStr(tz);
  const todayStat = await this.findOne({ userId, dateStr: todayStr }, { sessionsCompleted: 1 });

  let cursor  = todayStat?.sessionsCompleted > 0 ? todayStr : shiftDateStr(todayStr, -1);
  let current = 0;
  for (;;) {
    const stat = await this.findOne({ userId, dateStr: cursor }, { sessionsCompleted: 1 });
    if (stat?.sessionsCompleted > 0) {
      current++;
      cursor = shiftDateStr(cursor, -1);
    } else break;
  }

  const longestDoc = await this
    .findOne({ userId }, { longestStreak: 1 })
    .sort({ longestStreak: -1 });
  const longest = Math.max(current, longestDoc?.longestStreak ?? 0);

  return { current, longest };
};

export default mongoose.model('Statistics', StatisticsSchema);