import express from 'express';
import { Expo } from 'expo-server-sdk';
import User from '../models/User.js';
import NFCTag from '../models/NFCTag.js';
import UserTag from '../models/UserTag.js';
import Session from '../models/Session.js';
import FocusLog from '../models/FocusLog.js';
import Statistics from '../models/Statistics.js';
import AIInsight from '../models/AIInsight.js';
import RefreshToken from '../models/RefreshToken.js';
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
  nudgeHour:            v => requireInt(v, { min: 0, max: 23, field: 'nudgeHour' }),
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
// req.user has passwordHash stripped by the auth middleware, so derive the
// hasPassword flag with a tiny extra lookup (the hash itself is never exposed).
router.get('/me', asyncHandler(async (req, res) => {
  const withHash = await User.findById(req.user._id).select('passwordHash').lean();
  res.json({ ...req.user.toJSON(), hasPassword: !!withHash?.passwordHash });
}));

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

// ─── DELETE /api/user/me ──────────────────────────────────────────────────────
// Permanently delete the account and every document it owns (App Store
// requirement: apps with account creation must offer in-app deletion).
// Global NFCTag records are shared across users and stay; only this user's
// links to them (UserTag) are removed. The user doc is deleted last so a
// failure partway leaves the account intact and the deletion retryable.
router.delete('/me', asyncHandler(async (req, res) => {
  const userId = req.user._id;
  await Promise.all([
    Session.deleteMany({ userId }),
    FocusLog.deleteMany({ userId }),
    Statistics.deleteMany({ userId }),
    UserTag.deleteMany({ userId }),
    AIInsight.deleteMany({ userId }),
    RefreshToken.deleteMany({ userId }),
  ]);
  await User.findByIdAndDelete(userId);
  res.json({ deleted: true });
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

// ─── PATCH /api/user/nfc-tags/:userTagId ─────────────────────────────────────
// Body: { label: string } — renames a registered tag.
router.patch('/nfc-tags/:userTagId', asyncHandler(async (req, res) => {
  requireObjectId(req.params.userTagId, { field: 'userTagId' });

  const label = (req.body.label ?? '').trim();
  if (!label)            return res.status(400).json({ message: 'label is required' });
  if (label.length > 32) return res.status(400).json({ message: 'label must be at most 32 characters' });

  const updated = await UserTag.findOneAndUpdate(
    { _id: req.params.userTagId, userId: req.user._id },
    { $set: { label } },
    { returnDocument: 'after' },
  ).populate('tagId');

  if (!updated) return res.status(404).json({ message: 'Tag not found' });
  res.json(updated);
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

// ─── GET /api/user/categories ────────────────────────────────────────────────
// Returns all session categories for the user.
router.get('/categories', asyncHandler(async (req, res) => {
  res.json(req.user.categories || []);
}));

// ─── POST /api/user/categories ────────────────────────────────────────────────
// Body: { name: string } — creates a new session category.
router.post('/categories', asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw badRequest('name is required and must be a non-empty string');
  }
  const trimmedName = name.trim();
  if (trimmedName.length > 100) {
    throw badRequest('name must be at most 100 characters');
  }
  if ((req.user.categories || []).length >= 3) {
    throw badRequest('Maximum of 3 categories allowed');
  }

  // Generate a unique ID for this category (using timestamp + random)
  const categoryId = `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const updated = await User.findByIdAndUpdate(
    req.user._id,
    {
      $push: {
        categories: {
          id: categoryId,
          name: trimmedName,
          createdAt: new Date(),
        },
      },
    },
    { returnDocument: 'after' },
  );

  const newCategory = updated.categories.find(c => c.id === categoryId);
  res.status(201).json(newCategory);
}));

// ─── PATCH /api/user/categories/:categoryId ──────────────────────────────────
// Body: { name: string } — renames a category.
router.patch('/categories/:categoryId', asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const { name } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw badRequest('name is required and must be a non-empty string');
  }
  const trimmedName = name.trim();
  if (trimmedName.length > 100) {
    throw badRequest('name must be at most 100 characters');
  }

  const updated = await User.findOneAndUpdate(
    { _id: req.user._id, 'categories.id': categoryId },
    { $set: { 'categories.$.name': trimmedName } },
    { returnDocument: 'after' },
  );

  if (!updated) {
    return res.status(404).json({ message: 'Category not found' });
  }

  const category = updated.categories.find(c => c.id === categoryId);
  res.json(category);
}));

// ─── DELETE /api/user/categories/:categoryId ────────────────────────────────
// Deletes a category.
router.delete('/categories/:categoryId', asyncHandler(async (req, res) => {
  const { categoryId } = req.params;

  const updated = await User.findByIdAndUpdate(
    req.user._id,
    { $pull: { categories: { id: categoryId } } },
    { returnDocument: 'after' },
  );

  if (!updated || !updated.categories.length) {
    return res.status(404).json({ message: 'Category not found or user has no categories' });
  }

  res.json({ ok: true });
}));

export default router;
