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
  try {
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
      { new: true },
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/user/nfc-tags ───────────────────────────────────────────────────
// Returns all tags registered to the authenticated user.
router.get('/nfc-tags', async (req, res) => {
  try {
    const userTags = await UserTag.find({ userId: req.user._id })
      .populate('tagId')   // resolves to the NFCTag document (uid, createdAt)
      .sort({ registeredAt: -1 });
    res.json(userTags);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/user/nfc-tags ──────────────────────────────────────────────────
// Register a physical NFC tag to the user's account.
// Body: { uid: string, label?: string }
//
// Flow:
//   1. Find-or-create the NFCTag document (the physical tag may already exist
//      in the DB if another user registered it — that's fine, UIDs are unique).
//   2. Create a UserTag linking this user to that tag.
router.post('/nfc-tags', async (req, res) => {
  try {
    const { uid, label } = req.body;
    if (!uid) return res.status(400).json({ message: 'uid is required' });

    // Upsert the global tag record
    const tag = await NFCTag.findOneAndUpdate(
      { uid: uid.toUpperCase() },
      { uid: uid.toUpperCase() },
      { upsert: true, new: true },
    );

    // Check if this user already has this tag
    const existing = await UserTag.findOne({ userId: req.user._id, tagId: tag._id });
    if (existing) return res.status(409).json({ message: 'Tag already registered to your account' });

    const userTag = await UserTag.create({
      userId:       req.user._id,
      tagId:        tag._id,
      label:        label || 'My Tag',
      registeredAt: new Date(),
    });

    res.status(201).json(await userTag.populate('tagId'));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/user/nfc-tags/:userTagId ────────────────────────────────────
// Removes the link between the user and the tag. Does NOT delete the NFCTag
// document itself (another user might still have it registered).
router.delete('/nfc-tags/:userTagId', async (req, res) => {
  try {
    const deleted = await UserTag.findOneAndDelete({
      _id:    req.params.userTagId,
      userId: req.user._id,   // scoped to this user — prevents deleting others' tags
    });
    if (!deleted) return res.status(404).json({ message: 'Tag not found' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/user/nfc-verify ────────────────────────────────────────────────
// Verify a scanned UID belongs to the authenticated user.
// Called by NFCScreen before starting or ending a session.
// Body: { uid: string }
router.post('/nfc-verify', async (req, res) => {
  try {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ message: 'uid is required' });

    const tag = await NFCTag.findOne({ uid: uid.toUpperCase() });
    if (!tag) return res.json({ valid: false, tag: null });

    const userTag = await UserTag.findOne({ userId: req.user._id, tagId: tag._id })
      .populate('tagId');

    res.json({ valid: !!userTag, tag: userTag || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;