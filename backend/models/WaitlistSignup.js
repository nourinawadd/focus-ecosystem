import mongoose from 'mongoose';

// Emails collected from the landing page's "get the beta link" form. Kept as a
// simple growing list so we can message beta testers later. `email` is unique
// so re-submits are idempotent (the route swallows the duplicate-key error).
const waitlistSignupSchema = new mongoose.Schema(
  {
    email:  { type: String, required: true, unique: true, lowercase: true, trim: true },
    source: { type: String, default: 'landing' },
  },
  { timestamps: true },
);

export default mongoose.model('WaitlistSignup', waitlistSignupSchema);
