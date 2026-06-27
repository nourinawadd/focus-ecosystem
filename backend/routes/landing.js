// Public landing-page endpoint: the contact form. No auth (it's for anonymous
// site visitors). It has a
// honeypot field + an IP rate limit for spam resistance, and emails are
// best-effort (a Brevo outage must not surface as a 500 to the visitor).
import express from 'express';
import rateLimit from 'express-rate-limit';
import asyncHandler from '../middleware/asyncHandler.js';
import { sendContactEmail, sendContactAckEmail } from '../utils/mailer.js';

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
