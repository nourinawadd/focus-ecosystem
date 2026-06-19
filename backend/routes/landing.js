// Public landing-page endpoints: the "get the beta link" waitlist form and the
// contact form. No auth (these are for anonymous site visitors). Each has a
// honeypot field + an IP rate limit for spam resistance, and emails are
// best-effort (a Brevo outage must not surface as a 500 to the visitor).
import express from 'express';
import rateLimit from 'express-rate-limit';
import WaitlistSignup from '../models/WaitlistSignup.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { sendBetaInviteEmail, sendContactEmail, sendContactAckEmail } from '../utils/mailer.js';

const router = express.Router();

const skipInTest = () => process.env.NODE_ENV === 'test';

// Generous enough for real visitors, tight enough to blunt abuse.
const formLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 20,                    // 20 submissions per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { message: 'Too many submissions, please try again later.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/landing/waitlist  { email, website? }
// `website` is a honeypot: real users never see it, bots fill it. If present,
// we 200 silently so the bot thinks it succeeded.
router.post('/waitlist', formLimiter, asyncHandler(async (req, res) => {
  const { email, website } = req.body || {};
  if (website) return res.json({ ok: true });

  const clean = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(clean))
    return res.status(400).json({ message: 'Please enter a valid email address.' });

  // Idempotent save: ignore the duplicate-key error on re-submits.
  try { await WaitlistSignup.create({ email: clean }); }
  catch (err) { if (err.code !== 11000) throw err; }

  await sendBetaInviteEmail(clean);   // best-effort; never throws
  res.json({ ok: true });
}));

// POST /api/landing/contact  { topic, name?, email, message, website? }
router.post('/contact', formLimiter, asyncHandler(async (req, res) => {
  const { topic, name, email, message, website } = req.body || {};
  if (website) return res.json({ ok: true });

  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanMsg   = String(message || '').trim();
  if (!EMAIL_RE.test(cleanEmail))
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  if (cleanMsg.length < 5)
    return res.status(400).json({ message: 'Please add a short message.' });

  const cleanName = String(name || '').trim().slice(0, 120);
  await sendContactEmail({
    topic:   String(topic || 'General').slice(0, 60),
    name:    cleanName,
    email:   cleanEmail,
    message: cleanMsg.slice(0, 4000),
  });
  await sendContactAckEmail(cleanEmail, cleanName);   // confirmation to the sender; best-effort
  res.json({ ok: true });
}));

export default router;
