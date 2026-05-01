import express from 'express';
import User from '../models/User.js';
import { sign } from '../utils/jwt.js';

const router = express.Router();

const MIN_PASSWORD = 8;

// ─── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const name     = (req.body.name  ?? '').trim();
  const email    = (req.body.email ?? '').trim().toLowerCase();
  const password = req.body.password ?? '';

  if (!name || !email || !password)
    return res.status(400).json({ message: 'name, email and password are required' });

  if (password.length < MIN_PASSWORD)
    return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD} characters` });

  // Defensive duplicate check; the unique index is the source of truth (E11000 → 409 via errorHandler).
  if (await User.findOne({ email }))
    return res.status(409).json({ message: 'Email already registered' });

  const user = await User.create({ name, email, passwordHash: password });
  res.status(201).json({ token: sign(user._id), user });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const email    = (req.body.email ?? '').trim().toLowerCase();
  const password = req.body.password ?? '';

  if (!email || !password)
    return res.status(400).json({ message: 'email and password are required' });

  const user = await User.findOne({ email });
  if (!user || !(await user.comparePassword(password)))
    return res.status(401).json({ message: 'Invalid credentials' });

  res.json({ token: sign(user._id), user });
});

export default router;
