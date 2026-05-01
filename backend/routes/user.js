import express from 'express';
import User from '../models/User.js';
import NFCTag from '../models/NFCTag.js';
import UserTag from '../models/UserTag.js';
import auth from '../middleware/auth.js';

const router = express.Router();

router.use(auth);

// ─── GET /api/user/me ─────────────────────────────────────────────────────────
router.get('/me', (req, res) => res.json(req.user));

// ─── PATCH /api/user/settings ─────────────────────────────────────────────────
// Mirrors nav.updateUser() from the frontend.
// Body: any subset of the settings sub-document fields.
router.patch('/settings', async (req, res) => {
  const ALLOWED = [
    'defaultSessionType', 'defaultTimerMode', 'defaultDuration',
    'pomodoroWork', 'pomodoroBreak',
    'dailyGoalMinutes', 'weeklyGoalMinutes',
    'notificationsEnabled',
  ];
  const updates = {};
  for (const key of ALLOWED) {
    if (req.body[key] !== undefined) updates[`settings.${key}`] = req.body[key];
  }
  if (!Object.keys(updates).length)
    return res.status(400).json({ message: 'No valid settings fields provided' });

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updates },
    { new: true, runValidators: true },
  );
  res.json(user);
});

// ─── GET /api/user/nfc-tags ───────────────────────────────────────────────────
router.get('/nfc-tags', async (req, res) => {
  const userTags = await UserTag.find({ userId: req.user._id })
    .populate('tagId')
    .sort({ registeredAt: -1 });
  res.json(userTags);
});

// ─── POST /api/user/nfc-tags ──────────────────────────────────────────────────
// Body: { uid: string, label?: string }
router.post('/nfc-tags', async (req, res) => {
  const uid = (req.body.uid ?? '').trim().toUpperCase();
  if (!uid) return res.status(400).json({ message: 'uid is required' });

  const tag = await NFCTag.findOneAndUpdate(
    { uid },
    { uid },
    { upsert: true, new: true },
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
});

// ─── DELETE /api/user/nfc-tags/:userTagId ────────────────────────────────────
router.delete('/nfc-tags/:userTagId', async (req, res) => {
  const deleted = await UserTag.findOneAndDelete({
    _id:    req.params.userTagId,
    userId: req.user._id,
  });
  if (!deleted) return res.status(404).json({ message: 'Tag not found' });
  res.json({ deleted: true });
});

// ─── POST /api/user/nfc-verify ────────────────────────────────────────────────
// Body: { uid: string }
router.post('/nfc-verify', async (req, res) => {
  const uid = (req.body.uid ?? '').trim().toUpperCase();
  if (!uid) return res.status(400).json({ message: 'uid is required' });

  const tag = await NFCTag.findOne({ uid });
  if (!tag) return res.json({ valid: false, tag: null });

  const userTag = await UserTag.findOne({ userId: req.user._id, tagId: tag._id })
    .populate('tagId');

  res.json({ valid: !!userTag, tag: userTag || null });
});

export default router;
