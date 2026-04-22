import express from 'express';
import Session from '../models/Session.js';
import FocusLog from '../models/FocusLog.js';
import Statistics from '../models/Statistics.js';
import auth from '../middleware/auth.js';

const router = express.Router();

router.use(auth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d) {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Consecutive-day streak from an array of active dateStr strings. */
function computeStreak(activeDates) {
  const set = new Set(activeDates);
  const d   = new Date();
  let streak = 0;
  while (set.has(toDateStr(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** Compute score using the same formula as the frontend ActiveSessionScreen. */
function computeFocusScore(actualMins, plannedMins, isPomo, distractionCount) {
  const ratio    = Math.min(1, actualMins / Math.max(1, plannedMins));
  const pomoBon  = isPomo ? 8 : 0;
  const penalty  = Math.min(24, distractionCount * 4);
  return Math.min(99, Math.max(20, Math.round(ratio * 80) + pomoBon - penalty + 12));
}

/**
 * After any session mutation, resync:
 *   - Statistics document for the affected day
 *   - Streak values (passed into Statistics.rebuildForDay)
 */
async function syncStats(userId, dateStr) {
  const completedSessions = await Session.find({ userId, status: 'COMPLETED' });
  const activeDates = [...new Set(completedSessions.map(s => s.dateStr))];
  const streak      = computeStreak(activeDates);

  // Longest streak — walk sorted dates
  const sorted = [...activeDates].sort();
  let maxStreak = 0, cur = 0, prev = null;
  for (const ds of sorted) {
    const diff = prev
      ? Math.round((new Date(ds + 'T12:00:00') - new Date(prev + 'T12:00:00')) / 86_400_000)
      : null;
    cur = diff === 1 ? cur + 1 : 1;
    if (cur > maxStreak) maxStreak = cur;
    prev = ds;
  }

  await Statistics.rebuildForDay(userId, dateStr, {
    streak,
    longestStreak: Math.max(maxStreak, streak),
  });

  return { streak, longestStreak: Math.max(maxStreak, streak) };
}

// ─── GET /api/sessions ────────────────────────────────────────────────────────
// Query params: ?status=COMPLETED&dateStr=YYYY-MM-DD&limit=50
router.get('/', async (req, res) => {
  try {
    const filter = { userId: req.user._id };
    if (req.query.status)  filter.status  = req.query.status;
    if (req.query.dateStr) filter.dateStr = req.query.dateStr;

    const sessions = await Session
      .find(filter)
      .sort({ dateStr: -1, startedAt: -1 })
      .limit(Number(req.query.limit) || 100);

    res.json(sessions.map(Session.toFrontendRecord));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/sessions ───────────────────────────────────────────────────────
// Create a new session (PENDING state) when the user taps "Start".
// Body: { type, timerMode, timerConfig, blockedApps, dateStr, startedAt, nfcTagUid? }
router.post('/', async (req, res) => {
  try {
    const {
      type, timerMode, timerConfig, blockedApps,
      dateStr, startedAt, nfcTagUid,
    } = req.body;

    if (!timerConfig?.plannedDuration || !dateStr)
      return res.status(400).json({ message: 'timerConfig.plannedDuration and dateStr are required' });

    const session = await Session.create({
      userId:      req.user._id,
      type:        type      || 'STUDY',
      status:      'ACTIVE',
      timerMode:   timerMode || 'COUNTDOWN',
      timerConfig: {
        plannedDuration: timerConfig.plannedDuration,
        pomodoroWork:    timerConfig.pomodoroWork  || req.user.settings.pomodoroWork,
        pomodoroBreak:   timerConfig.pomodoroBreak || req.user.settings.pomodoroBreak,
        pomodoroRounds:  timerConfig.pomodoroRounds || 4,
      },
      blockedApps: blockedApps || [],
      dateStr,
      startedAt:   startedAt ? new Date(startedAt) : new Date(),
      nfcTagUid:   nfcTagUid || null,
    });

    // Log SESSION_STARTED event
    await FocusLog.create({
      sessionId: session._id,
      userId:    req.user._id,
      event:     'SESSION_STARTED',
      timestamp: session.startedAt,
    });

    res.status(201).json(Session.toFrontendRecord(session));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PATCH /api/sessions/:id/end ─────────────────────────────────────────────
// Called when the user ends a session (from ActiveSessionScreen confirmEnd).
// Body: { status: 'COMPLETED'|'ABANDONED', timerState, focusScore?, endedAt?, nfcTagUid? }
router.patch('/:id/end', async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, userId: req.user._id });
    if (!session) return res.status(404).json({ message: 'Session not found' });
    if (session.status !== 'ACTIVE')
      return res.status(400).json({ message: `Session is already ${session.status}` });

    const { status, timerState, endedAt, nfcTagUid } = req.body;
    const finalStatus = ['COMPLETED', 'ABANDONED'].includes(status) ? status : 'ABANDONED';
    const endTime     = endedAt ? new Date(endedAt) : new Date();

    // Compute focus score server-side if not provided
    const actualMins       = timerState?.actualDuration || 0;
    const distractionCount = req.body.distractionCount  || 0;
    const isPomo           = session.timerMode === 'POMODORO';
    const focusScore       = finalStatus === 'COMPLETED'
      ? (req.body.focusScore ?? computeFocusScore(actualMins, session.timerConfig.plannedDuration, isPomo, distractionCount))
      : null;

    session.status     = finalStatus;
    session.timerState = timerState || {};
    session.focusScore = focusScore;
    session.endedAt    = endTime;
    if (nfcTagUid) session.nfcTagUid = nfcTagUid;
    await session.save();

    // Log SESSION_ENDED
    await FocusLog.create({
      sessionId: session._id,
      userId:    req.user._id,
      event:     'SESSION_ENDED',
      timestamp: endTime,
      metadata:  { reason: finalStatus },
    });

    // Rebuild statistics for the day
    const streakData = await syncStats(req.user._id, session.dateStr);

    res.json({
      session: Session.toFrontendRecord(session),
      streak:  streakData.streak,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/sessions/:id/log ───────────────────────────────────────────────
// Append a focus event during an active session.
// Called by the native foreground service when an app block occurs, etc.
// Body: { event, metadata? }
router.post('/:id/log', async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, userId: req.user._id });
    if (!session) return res.status(404).json({ message: 'Session not found' });

    const { event, metadata } = req.body;
    const log = await FocusLog.create({
      sessionId: session._id,
      userId:    req.user._id,
      event,
      timestamp: new Date(),
      metadata:  metadata || {},
    });

    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/sessions/:id/logs ──────────────────────────────────────────────
// All focus log events for a specific session.
router.get('/:id/logs', async (req, res) => {
  try {
    const logs = await FocusLog
      .find({ sessionId: req.params.id, userId: req.user._id })
      .sort({ timestamp: 1 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/sessions/:id ─────────────────────────────────────────────────
// Matches nav.deleteSession(id) — also cleans up focus logs.
router.delete('/:id', async (req, res) => {
  try {
    const session = await Session.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!session) return res.status(404).json({ message: 'Session not found' });

    await FocusLog.deleteMany({ sessionId: session._id });
    await syncStats(req.user._id, session.dateStr);

    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;