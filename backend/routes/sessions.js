import express from 'express';
import Session from '../models/Session.js';
import FocusLog from '../models/FocusLog.js';
import Statistics from '../models/Statistics.js';
import auth from '../middleware/auth.js';
import asyncHandler from '../middleware/asyncHandler.js';
import {
  requireObjectId, requireInt, requireEnum, requireString, requireDateStr, badRequest,
} from '../middleware/validate.js';
import { userTodayStr, shiftDateStr } from '../utils/datetime.js';
import { invalidateSuggestion } from '../services/aiSuggestionService.js';

const router = express.Router();

router.use(auth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Compute score using the same formula as the frontend ActiveSessionScreen. */
function computeFocusScore(actualMins, plannedMins, isPomo, distractionCount) {
  const ratio    = Math.min(1, actualMins / Math.max(1, plannedMins));
  const pomoBon  = isPomo ? 8 : 0;
  const penalty  = Math.min(24, distractionCount * 4);
  return Math.min(99, Math.max(20, Math.round(ratio * 80) + pomoBon - penalty + 12));
}

/** Validate + normalize the blockedApps array (≤50 items, each ≤200 chars). */
function validateBlockedApps(arr) {
  if (arr === undefined || arr === null) return [];
  if (!Array.isArray(arr)) throw badRequest('blockedApps must be an array');
  if (arr.length > 50)     throw badRequest('blockedApps may contain at most 50 items');
  return arr.map((a, i) => requireString(a, { max: 200, field: `blockedApps[${i}]` }));
}

/**
 * Current streak: walk back day-by-day from today (user tz), hitting the
 * unique {userId, dateStr} index, until a day without a completed session.
 * O(streak length) rather than O(all sessions). Longest streak only grows, so
 * it's max(current, the largest longestStreak already recorded).
 */
async function computeStreaks(userId, tz) {
  let cursor  = userTodayStr(tz);
  let current = 0;
  for (;;) {
    const stat = await Statistics.findOne({ userId, dateStr: cursor }, { sessionsCompleted: 1 });
    if (stat?.sessionsCompleted > 0) {
      current++;
      cursor = shiftDateStr(cursor, -1);
    } else break;
  }

  const longestDoc = await Statistics
    .findOne({ userId }, { longestStreak: 1 })
    .sort({ longestStreak: -1 });
  const longest = Math.max(current, longestDoc?.longestStreak ?? 0);

  return { current, longest };
}

/**
 * After any session mutation: rebuild the affected day's metrics, recompute the
 * streak efficiently, and persist it. Statistics is never mutated directly.
 */
async function syncStats(userId, dateStr, tz) {
  await Statistics.rebuildForDay(userId, dateStr, tz);
  const { current, longest } = await computeStreaks(userId, tz);
  await Statistics.setStreak(userId, dateStr, current, longest);
  return { streak: current, longestStreak: longest };
}

// ─── GET /api/sessions ────────────────────────────────────────────────────────
// Query params: ?status=COMPLETED&dateStr=YYYY-MM-DD&limit=50
router.get('/', asyncHandler(async (req, res) => {
  const filter = { userId: req.user._id };
  if (req.query.status)  filter.status  = req.query.status;
  if (req.query.dateStr) filter.dateStr = req.query.dateStr;

  const sessions = await Session
    .find(filter)
    .sort({ dateStr: -1, startedAt: -1 })
    .limit(Number(req.query.limit) || 100);

  res.json(sessions.map(Session.toFrontendRecord));
}));

// ─── POST /api/sessions ───────────────────────────────────────────────────────
// Create a new session (ACTIVE state) when the user taps "Start".
// Body: { type, timerMode, timerConfig, blockedApps, dateStr, startedAt, nfcTagUid? }
router.post('/', asyncHandler(async (req, res) => {
  const { type, timerMode, timerConfig, blockedApps, dateStr, startedAt, nfcTagUid } = req.body;

  requireDateStr(dateStr);
  if (!timerConfig || typeof timerConfig !== 'object')
    throw badRequest('timerConfig is required');

  const finalType = type === undefined
    ? 'STUDY'
    : requireEnum(type, ['STUDY', 'WORK', 'CUSTOM'], { field: 'type' });
  const finalMode = timerMode === undefined
    ? 'COUNTDOWN'
    : requireEnum(timerMode, ['COUNTDOWN', 'POMODORO', 'STOPWATCH'], { field: 'timerMode' });

  const plannedDuration = requireInt(timerConfig.plannedDuration, { min: 1, max: 480, field: 'timerConfig.plannedDuration' });
  const pomodoroWork = timerConfig.pomodoroWork === undefined
    ? req.user.settings.pomodoroWork
    : requireInt(timerConfig.pomodoroWork, { min: 1, max: 60, field: 'timerConfig.pomodoroWork' });
  const pomodoroBreak = timerConfig.pomodoroBreak === undefined
    ? req.user.settings.pomodoroBreak
    : requireInt(timerConfig.pomodoroBreak, { min: 1, max: 60, field: 'timerConfig.pomodoroBreak' });
  const pomodoroRounds = timerConfig.pomodoroRounds === undefined
    ? 4
    : requireInt(timerConfig.pomodoroRounds, { min: 1, max: 20, field: 'timerConfig.pomodoroRounds' });

  const apps = validateBlockedApps(blockedApps);

  const session = await Session.create({
    userId:      req.user._id,
    type:        finalType,
    status:      'ACTIVE',
    timerMode:   finalMode,
    timerConfig: { plannedDuration, pomodoroWork, pomodoroBreak, pomodoroRounds },
    blockedApps: apps,
    dateStr,
    startedAt:   startedAt ? new Date(startedAt) : new Date(),
    nfcTagUid:   nfcTagUid || null,
  });

  await FocusLog.create({
    sessionId: session._id,
    userId:    req.user._id,
    event:     'SESSION_STARTED',
    timestamp: session.startedAt,
  });

  res.status(201).json(Session.toFrontendRecord(session));
}));

// ─── PATCH /api/sessions/:id/end ─────────────────────────────────────────────
// Body: { status: 'COMPLETED'|'ABANDONED', timerState, endedAt?, nfcTagUid? }
router.patch('/:id/end', asyncHandler(async (req, res) => {
  requireObjectId(req.params.id);

  const session = await Session.findOne({ _id: req.params.id, userId: req.user._id });
  if (!session) return res.status(404).json({ message: 'Session not found' });
  if (session.status !== 'ACTIVE')
    return res.status(400).json({ message: `Session is already ${session.status}` });

  const { status, timerState, endedAt, nfcTagUid } = req.body;
  const finalStatus = ['COMPLETED', 'ABANDONED'].includes(status) ? status : 'ABANDONED';
  const endTime     = endedAt ? new Date(endedAt) : new Date();

  // Focus score is computed server-side from authoritative sources only.
  // Client-supplied focusScore / distractionCount values are ignored.
  const actualMins       = timerState?.actualDuration || 0;
  const distractionCount = await FocusLog.countDocuments({
    sessionId: session._id,
    event:     'APP_BLOCKED',
  });
  const isPomo     = session.timerMode === 'POMODORO';
  const focusScore = finalStatus === 'COMPLETED'
    ? computeFocusScore(actualMins, session.timerConfig.plannedDuration, isPomo, distractionCount)
    : null;

  // Atomic transition: the guard on status:'ACTIVE' means only the first of two
  // racing end requests wins. The loser gets null and does no side effects, so
  // logs and stats can't be double-counted.
  const updated = await Session.findOneAndUpdate(
    { _id: session._id, userId: req.user._id, status: 'ACTIVE' },
    {
      $set: {
        status:     finalStatus,
        timerState: {
          actualDuration:          timerState?.actualDuration          ?? 0,
          pomodoroRoundsCompleted: timerState?.pomodoroRoundsCompleted ?? 0,
          breaks:                  timerState?.breaks                  ?? 0,
        },
        focusScore,
        endedAt: endTime,
      },
    },
    { new: true },
  );
  if (!updated) return res.status(409).json({ message: 'Session already ended' });

  // Log NFC_VERIFIED before SESSION_ENDED so the event order is chronological.
  if (nfcTagUid) {
    await FocusLog.create({
      sessionId: updated._id,
      userId:    req.user._id,
      event:     'NFC_VERIFIED',
      timestamp: endTime,
      metadata:  { uid: nfcTagUid },
    });
  }

  await FocusLog.create({
    sessionId: updated._id,
    userId:    req.user._id,
    event:     'SESSION_ENDED',
    timestamp: endTime,
    metadata:  { reason: finalStatus },
  });

  const tz         = req.user.settings?.timezone || 'UTC';
  const streakData = await syncStats(req.user._id, updated.dateStr, tz);

  invalidateSuggestion(req.user._id);

  res.json({
    session: Session.toFrontendRecord(updated),
    streak:  streakData.streak,
  });
}));

// ─── POST /api/sessions/:id/log ───────────────────────────────────────────────
// Append a focus event during an active session. Body: { event, metadata? }
router.post('/:id/log', asyncHandler(async (req, res) => {
  requireObjectId(req.params.id);

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
}));

// ─── GET /api/sessions/:id/logs ──────────────────────────────────────────────
router.get('/:id/logs', asyncHandler(async (req, res) => {
  requireObjectId(req.params.id);

  const logs = await FocusLog
    .find({ sessionId: req.params.id, userId: req.user._id })
    .sort({ timestamp: 1 });
  res.json(logs);
}));

// ─── DELETE /api/sessions/:id ─────────────────────────────────────────────────
router.delete('/:id', asyncHandler(async (req, res) => {
  requireObjectId(req.params.id);

  const session = await Session.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!session) return res.status(404).json({ message: 'Session not found' });

  await FocusLog.deleteMany({ sessionId: session._id });
  const tz = req.user.settings?.timezone || 'UTC';
  await syncStats(req.user._id, session.dateStr, tz);

  invalidateSuggestion(req.user._id);

  res.json({ deleted: true });
}));

export default router;
