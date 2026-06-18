// Transactional email via Brevo's REST API (free tier: 300/day).
// No SDK — one endpoint, plain fetch. Without BREVO_API_KEY (local dev, tests)
// sends are skipped and logged so auth flows still work end-to-end.
import logger from './logger.js';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

const sender = () => ({
  name:  'Anchor',
  email: process.env.BREVO_SENDER || 'anchorr26@gmail.com',
});

/**
 * Send the 6-digit verification code. Returns true if Brevo accepted the send.
 * Never throws — a mail outage must not fail the register/resend request; the
 * user can always tap "resend code".
 */
export async function sendVerificationEmail(to, code) {
  if (!process.env.BREVO_API_KEY) {
    logger.warn({ to }, 'BREVO_API_KEY not set — verification email skipped');
    return false;
  }
  try {
    const res = await fetch(BREVO_URL, {
      method:  'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender:  sender(),
        to:      [{ email: to }],
        subject: `${code} is your Anchor verification code`,
        htmlContent: `
          <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px">
            <h2 style="color:#111;margin-bottom:4px">Verify your email</h2>
            <p style="color:#555;font-size:14px">Enter this code in the Anchor app to activate your account:</p>
            <p style="font-size:34px;font-weight:700;letter-spacing:8px;color:#111;text-align:center;margin:24px 0">${code}</p>
            <p style="color:#999;font-size:12px">The code expires in 10 minutes. If you didn't create an Anchor account, ignore this email.</p>
          </div>`,
      }),
    });
    if (!res.ok) {
      logger.error({ to, status: res.status, body: await res.text() }, 'Brevo send failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ to, err: err.message }, 'Brevo send threw');
    return false;
  }
}

/**
 * Send the 6-digit password-reset code. Same contract as
 * sendVerificationEmail: returns true on accepted send, never throws, and is a
 * no-op (logged) when BREVO_API_KEY is unset so the reset flow still works
 * end-to-end in local dev and tests.
 */
export async function sendPasswordResetEmail(to, code) {
  if (!process.env.BREVO_API_KEY) {
    logger.warn({ to }, 'BREVO_API_KEY not set — password reset email skipped');
    return false;
  }
  try {
    const res = await fetch(BREVO_URL, {
      method:  'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender:  sender(),
        to:      [{ email: to }],
        subject: `${code} is your Anchor password reset code`,
        htmlContent: `
          <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px">
            <h2 style="color:#111;margin-bottom:4px">Reset your password</h2>
            <p style="color:#555;font-size:14px">Enter this code in the Anchor app to set a new password:</p>
            <p style="font-size:34px;font-weight:700;letter-spacing:8px;color:#111;text-align:center;margin:24px 0">${code}</p>
            <p style="color:#999;font-size:12px">The code expires in 10 minutes. If you didn't request a password reset, ignore this email — your password won't change.</p>
          </div>`,
      }),
    });
    if (!res.ok) {
      logger.error({ to, status: res.status, body: await res.text() }, 'Brevo reset send failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ to, err: err.message }, 'Brevo reset send threw');
    return false;
  }
}
