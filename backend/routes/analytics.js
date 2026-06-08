import express   from 'express';
import Session   from '../models/Session.js';
import Statistics from '../models/Statistics.js';
import AIInsight  from '../models/AIInsight.js';
import auth      from '../middleware/auth.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { toUserDate, userTodayStr, shiftDateStr, diffDays, weekdayOfDateStr } from '../utils/datetime.js';

const router     = express.Router();

router.use(auth);

// YYYY-MM-DD for n days ago, anchored to the user's timezone "today".
function daysAgo(n, tz) {
  return shiftDateStr(userTodayStr(tz), -n);
}

// ─── GET /api/analytics/summary?period=day|week|month ─────────────────────────
// Primary endpoint for AnalyticsScreen filter cards and Dashboard stats.
// Reads from both the Statistics documents and live Session data.
router.get('/summary', asyncHandler(async (req, res) => {
    const tz     = req.user.settings?.timezone || 'UTC';
    const period = req.query.period || 'week';
    const days   = period === 'day' ? 1 : period === 'week' ? 7 : 30;

    const startStr = daysAgo(days - 1, tz);
    const endStr   = daysAgo(0, tz);

    // Pull sessions directly for bar chart data + fine-grained stats
    const sessions = await Session.find({
      userId:  req.user._id,
      dateStr: { $gte: startStr, $lte: endStr },
    });

    const completed = sessions.filter(s => s.status === 'COMPLETED');
    const abandoned = sessions.filter(s => s.status === 'ABANDONED');

    const totalMins = completed.reduce(
      (a, s) => a + (s.timerState?.actualDuration || 0), 0,
    );
    const compRate = sessions.length > 0
      ? Math.round((completed.length / sessions.length) * 100) : 0;
    const avgScore = completed.filter(s => s.focusScore !== null).length > 0
      ? Math.round(
          completed.filter(s => s.focusScore !== null)
            .reduce((a, s) => a + (s.focusScore || 0), 0) /
          completed.filter(s => s.focusScore !== null).length,
        )
      : 0;

    // Best productive hour (in the user's timezone)
    const hCounts = {};
    for (const s of completed) {
      if (s.startedAt) {
        const h = toUserDate(s.startedAt, tz).hour;
        hCounts[h] = (hCounts[h] || 0) + 1;
      }
    }
    const bestHour = Object.keys(hCounts).length > 0
      ? Number(Object.entries(hCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0][0])
      : null;

    // Health score (mirrors frontend AnalyticsScreen algorithm)
    const { dailyGoalMinutes, weeklyGoalMinutes } = req.user.settings;
    const target = period === 'day' ? dailyGoalMinutes
                 : period === 'week' ? weeklyGoalMinutes
                 : weeklyGoalMinutes * 4;
    const activeDays  = new Set(completed.map(s => s.dateStr)).size;
    const consistency = Math.round(Math.min(activeDays / days, 1) * 40);
    const completion  = Math.round((compRate / 100) * 30);
    const volume      = Math.round(Math.min(totalMins / Math.max(target, 1), 1) * 30);
    const healthScore = consistency + completion + volume;

    // Bar chart data
    const DAY = ['S','M','T','W','T','F','S'];
    let barData;
    // Bars show completed focus minutes only, matching totalFocusMinutes
    // (abandoned sessions contribute to neither).
    if (period === 'day') {
      const labels = ['12a','4a','8a','12p','4p','8p'];
      const today  = daysAgo(0, tz);
      barData = labels.map((label, i) => {
        const startH = i * 4;
        const mins   = completed
          .filter(s => s.dateStr === today && s.startedAt)
          .filter(s => { const h = toUserDate(s.startedAt, tz).hour; return h >= startH && h < startH + 4; })
          .reduce((a, s) => a + (s.timerState?.actualDuration || 0), 0);
        return { label, minutes: mins };
      });
    } else if (period === 'week') {
      barData = Array.from({ length: 7 }, (_, i) => {
        const ds  = daysAgo(6 - i, tz);
        const dow = weekdayOfDateStr(ds);
        const mins = completed.filter(s => s.dateStr === ds)
          .reduce((a, s) => a + (s.timerState?.actualDuration || 0), 0);
        return { label: DAY[dow], minutes: mins };
      });
    } else {
      const today = daysAgo(0, tz);
      barData = Array.from({ length: 4 }, (_, i) => {
        const hi = (3 - i) * 7, lo = hi + 7;
        const mins = completed.filter(s => {
          const dAgo = diffDays(s.dateStr, today);
          return dAgo >= hi && dAgo < lo;
        }).reduce((a, s) => a + (s.timerState?.actualDuration || 0), 0);
        return { label: `W${i + 1}`, minutes: mins };
      });
    }

    // Compute the streak live (with the until-midnight grace) rather than
    // reading today's stored doc, which wouldn't exist on a still-idle day.
    const { current: currentStreak, longest: longestStreak } =
      await Statistics.computeStreak(req.user._id, tz);

    res.json({
      period,
      totalFocusMinutes: totalMins,
      sessionsCount:     sessions.length,
      completedCount:    completed.length,
      abandonedCount:    abandoned.length,
      completionRate:    compRate,
      averageFocusScore: avgScore,
      bestHour,
      healthScore,
      healthBreakdown:   { consistency, completion, volume },
      currentStreak,
      longestStreak,
      barData,
    });
}));

// ─── GET /api/analytics/statistics?from=YYYY-MM-DD&to=YYYY-MM-DD ─────────────
// Raw daily statistics documents — consumed by ML service for training data.
router.get('/statistics', asyncHandler(async (req, res) => {
  const tz   = req.user.settings?.timezone || 'UTC';
  const from = req.query.from || daysAgo(30, tz);
  const to   = req.query.to   || daysAgo(0, tz);

  const stats = await Statistics.find({
    userId:  req.user._id,
    dateStr: { $gte: from, $lte: to },
  }).sort({ dateStr: 1 });

  res.json(stats);
}));

// ─── GET /api/analytics/ai-insight ───────────────────────────────────────────
router.get('/ai-insight', asyncHandler(async (req, res) => {
  const insight = await AIInsight.findOne({ userId: req.user._id });
  if (!insight) return res.status(204).send();
  res.json(insight);
}));

// NOTE: PUT /api/analytics/ai-insight was removed. Insight generation is now
// owned server-side by /api/ai/insights (see routes/ai.js); no external writer.

export default router;