import express from 'express';
import { Expo } from 'expo-server-sdk';
import User from '../models/User.js';
import NFCTag from '../models/NFCTag.js';
import UserTag from '../models/UserTag.js';
import auth from '../middleware/auth.js';
import asyncHandler from '../middleware/asyncHandler.js';
import {
  requireObjectId, requireInt, requireEnum, requireBool, badRequest,
} from '../middleware/validate.js';
import { isValidTimezone } from '../utils/datetime.js';

const router = express.Router();

router.use(auth);

// Per-field validators for the settings sub-document. A field is only updated
// if present in the body, and only after passing its bounds check.
const SETTING_VALIDATORS = {
  defaultSessionType:   v => requireEnum(v, ['STUDY', 'WORK', 'CUSTOM'], { field: 'defaultSessionType' }),
  defaultTimerMode:     v => requireEnum(v, ['COUNTDOWN', 'POMODORO', 'STOPWATCH'], { field: 'defaultTimerMode' }),
  defaultDuration:      v => requireInt(v, { min: 1, max: 480, field: 'defaultDuration' }),
  pomodoroWork:         v => requireInt(v, { min: 1, max: 60, field: 'pomodoroWork' }),
  pomodoroBreak:        v => requireInt(v, { min: 1, max: 60, field: 'pomodoroBreak' }),
  dailyGoalMinutes:     v => requireInt(v, { min: 0, max: 1440, field: 'dailyGoalMinutes' }),
  weeklyGoalMinutes:    v => requireInt(v, { min: 0, max: 10080, field: 'weeklyGoalMinutes' }),
  notificationsEnabled: v => requireBool(v, { field: 'notificationsEnabled' }),
  reminderHour:         v => requireInt(v, { min: 0, max: 23, field: 'reminderHour' }),
  timezone: (v) => {
    if (!isValidTimezone(v)) throw badRequest('timezone must be a valid IANA timezone');
    return v;
  },
};

// Validators for the nested settings.notify sub-document.
const NOTIFY_VALIDATORS = {
  dailyNudge:      v => requireBool(v, { field: 'notify.dailyNudge' }),
  inSessionAlerts: v => requireBool(v, { field: 'notify.inSessionAlerts' }),
  dailySummary:    v => requireBool(v, { field: 'notify.dailySummary' }),
  streakAlert:     v => requireBool(v, { field: 'notify.streakAlert' }),
  goalNudge:       v => requireBool(v, { field: 'notify.goalNudge' }),
  goalAchieved:    v => requireBool(v, { field: 'notify.goalAchieved' }),
};

// ─── GET /api/user/me ─────────────────────────────────────────────────────────
router.get('/me', (req, res) => res.json(req.user));

// ─── PATCH /api/user/settings ─────────────────────────────────────────────────
// Body: any subset of the settings sub-document fields.
router.patch('/settings', asyncHandler(async (req, res) => {
  const updates = {};
  for (const [key, validate] of Object.entries(SETTING_VALIDATORS)) {
    if (req.body[key] !== undefined) updates[`settings.${key}`] = validate(req.body[key]);
  }
  if (req.body.notify != null && typeof req.body.notify === 'object') {
    for (const [key, validate] of Object.entries(NOTIFY_VALIDATORS)) {
      if (req.body.notify[key] !== undefined) {
        updates[`settings.notify.${key}`] = validate(req.body.notify[key]);
      }
    }
  }
  if (!Object.keys(updates).length)
    return res.status(400).json({ message: 'No valid settings fields provided' });

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updates },
    { returnDocument: 'after', runValidators: true },
  );
  res.json(user);
}));

// ─── POST /api/user/push-token ────────────────────────────────────────────────
// Body: { token: string } — registers an Expo push token for this device.
router.post('/push-token', asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string' || !Expo.isExpoPushToken(token)) {
    return res.status(400).json({ message: 'Invalid Expo push token' });
  }
  await User.findByIdAndUpdate(req.user._id, { $addToSet: { pushTokens: token } });
  res.json({ ok: true });
}));

// ─── DELETE /api/user/push-token ─────────────────────────────────────────────
// Body: { token: string } — removes a push token on sign-out or permission revoke.
router.delete('/push-token', asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ message: 'token is required' });
  }
  await User.findByIdAndUpdate(req.user._id, { $pull: { pushTokens: token } });
  res.json({ ok: true });
}));

// ─── GET /api/user/nfc-tags ───────────────────────────────────────────────────
router.get('/nfc-tags', asyncHandler(async (req, res) => {
  const userTags = await UserTag.find({ userId: req.user._id })
    .populate('tagId')
    .sort({ registeredAt: -1 });
  res.json(userTags);
}));

// ─── POST /api/user/nfc-tags ──────────────────────────────────────────────────
// Body: { uid: string, label?: string }
router.post('/nfc-tags', asyncHandler(async (req, res) => {
  const uid = (req.body.uid ?? '').trim().toUpperCase();
  if (!uid) return res.status(400).json({ message: 'uid is required' });

  const tag = await NFCTag.findOneAndUpdate(
    { uid },
    { uid },
    { upsert: true, returnDocument: 'after' },
  );

  const existing = await UserTag.findOne({ userId: req.user._id, tagId: tag._id });
  if (existing) return res.status(409).json({ message: 'Tag already registered to your account' });

  const userTag = await UserTag.create({
    userId:       req.user._id,
    tagId:        tag._id,
    label:        req.body.label || 'My Tag',
    registeredAt: new Date(),
  });

  res.status(201).json(await userTag.populate('tagId'));
}));

// ─── DELETE /api/user/nfc-tags/:userTagId ────────────────────────────────────
router.delete('/nfc-tags/:userTagId', asyncHandler(async (req, res) => {
  requireObjectId(req.params.userTagId, { field: 'userTagId' });

  const deleted = await UserTag.findOneAndDelete({
    _id:    req.params.userTagId,
    userId: req.user._id,
  });
  if (!deleted) return res.status(404).json({ message: 'Tag not found' });
  res.json({ deleted: true });
}));

// ─── POST /api/user/nfc-verify ────────────────────────────────────────────────
// Body: { uid: string }
router.post('/nfc-verify', asyncHandler(async (req, res) => {
  const uid = (req.body.uid ?? '').trim().toUpperCase();
  if (!uid) return res.status(400).json({ message: 'uid is required' });

  const tag = await NFCTag.findOne({ uid });
  if (!tag) return res.json({ valid: false, tag: null });

  const userTag = await UserTag.findOne({ userId: req.user._id, tagId: tag._id })
    .populate('tagId');

  res.json({ valid: !!userTag, tag: userTag || null });
}));

export default router;
