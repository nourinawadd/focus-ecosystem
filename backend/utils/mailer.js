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

const TESTFLIGHT_URL = process.env.TESTFLIGHT_URL || 'https://testflight.apple.com/join/EYsXpufP';
const CONTACT_TO     = process.env.CONTACT_TO || process.env.BREVO_SENDER || 'anchorr26@gmail.com';

/**
 * Landing-page "get the beta link" autoresponder: emails the subscriber the
 * TestFlight link and a gentle feedback ask. Best-effort; never throws.
 */
export async function sendBetaInviteEmail(to) {
  if (!process.env.BREVO_API_KEY) {
    logger.warn({ to }, 'BREVO_API_KEY not set — beta invite email skipped');
    return false;
  }
  try {
    const res = await fetch(BREVO_URL, {
      method:  'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender:  sender(),
        to:      [{ email: to }],
        replyTo: { email: CONTACT_TO, name: 'Anchor' },
        subject: 'Your Anchor beta link is inside',
        htmlContent: `
          <div style="background:#f2f5f7;padding:32px 16px;font-family:-apple-system,'Segoe UI',Arial,sans-serif;">
            <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #d4e0e8;border-radius:16px;overflow:hidden;">
              <div style="background:#313852;padding:24px 32px;text-align:center;">
                <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:.5px;">Anchor</span>
              </div>
              <div style="padding:32px 32px 8px;">
                <h1 style="margin:0 0 12px;font-size:22px;color:#0f1e27;">You're in. Welcome aboard.</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4a5e6a;">Thanks for wanting to focus better with Anchor. The beta is live on TestFlight, and you can have it on your iPhone in about a minute.</p>
                <div style="text-align:center;margin:28px 0;">
                  <a href="${TESTFLIGHT_URL}" style="display:inline-block;background:#313852;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 28px;border-radius:99px;">Open the TestFlight beta</a>
                </div>
                <p style="margin:0 0 8px;font-size:15px;line-height:1.7;color:#4a5e6a;">Two quick steps:</p>
                <ol style="margin:0 0 18px 18px;font-size:15px;line-height:1.8;color:#4a5e6a;">
                  <li>Install Apple's free TestFlight app if you don't already have it.</li>
                  <li>Tap the button above to add Anchor, then open it and create your account.</li>
                </ol>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#4a5e6a;">One small favour: after a session or two, we would love to know what you think. What felt great, what got in your way, anything you wish it did. Just reply to this email and it comes straight to us.</p>
                <p style="margin:0 0 2px;font-size:15px;color:#4a5e6a;">Thanks for helping us build it,</p>
                <p style="margin:0 0 22px;font-size:15px;color:#0f1e27;font-weight:600;">The Anchor team</p>
              </div>
              <div style="border-top:1px solid #d4e0e8;padding:16px 32px;background:#f8fafb;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#7a909c;">You're getting this because you asked for the Anchor beta link on our site. If that wasn't you, you can ignore this email. Questions? <a href="mailto:${CONTACT_TO}" style="color:#4a8fa8;">${CONTACT_TO}</a></p>
              </div>
            </div>
          </div>`,
      }),
    });
    if (!res.ok) {
      logger.error({ to, status: res.status, body: await res.text() }, 'Brevo beta invite failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ to, err: err.message }, 'Brevo beta invite threw');
    return false;
  }
}

/**
 * Landing-page contact form: emails the team the visitor's message, with
 * replyTo set to the visitor so a plain "reply" reaches them. Best-effort.
 */
export async function sendContactEmail({ topic, name, email, message }) {
  if (!process.env.BREVO_API_KEY) {
    logger.warn({ email }, 'BREVO_API_KEY not set — contact email skipped');
    return false;
  }
  const esc = (s) => String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  try {
    const res = await fetch(BREVO_URL, {
      method:  'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender:  sender(),
        to:      [{ email: CONTACT_TO }],
        replyTo: { email, name: name || email },
        subject: `New Anchor message: ${esc(topic)}`,
        htmlContent: `
          <div style="font-family:-apple-system,'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f1e27;">
            <h2 style="margin:0 0 16px;font-size:18px;">New message from the Anchor site</h2>
            <p style="margin:0 0 6px;font-size:14px;"><strong>Topic:</strong> ${esc(topic)}</p>
            <p style="margin:0 0 6px;font-size:14px;"><strong>Name:</strong> ${esc(name) || 'Not provided'}</p>
            <p style="margin:0 0 16px;font-size:14px;"><strong>Email:</strong> ${esc(email)}</p>
            <div style="background:#f2f5f7;border:1px solid #d4e0e8;border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.7;white-space:pre-wrap;">${esc(message)}</div>
            <p style="margin:16px 0 0;font-size:12px;color:#7a909c;">Reply directly to this email to respond to ${esc(email)}.</p>
          </div>`,
      }),
    });
    if (!res.ok) {
      logger.error({ email, status: res.status, body: await res.text() }, 'Brevo contact send failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ email, err: err.message }, 'Brevo contact send threw');
    return false;
  }
}

/**
 * Confirmation auto-reply to whoever submitted the contact form, so they get an
 * acknowledgement instead of silence. Best-effort; never throws.
 */
export async function sendContactAckEmail(to, name) {
  if (!process.env.BREVO_API_KEY) {
    logger.warn({ to }, 'BREVO_API_KEY not set — contact ack email skipped');
    return false;
  }
  const greeting = name ? `Hi ${String(name).replace(/[<>&]/g, '')},` : 'Hi there,';
  try {
    const res = await fetch(BREVO_URL, {
      method:  'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender:  sender(),
        to:      [{ email: to }],
        replyTo: { email: CONTACT_TO, name: 'Anchor' },
        subject: 'Thanks for reaching out to Anchor',
        htmlContent: `
          <div style="background:#f2f5f7;padding:32px 16px;font-family:-apple-system,'Segoe UI',Arial,sans-serif;">
            <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #d4e0e8;border-radius:16px;overflow:hidden;">
              <div style="background:#313852;padding:24px 32px;text-align:center;">
                <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:.5px;">Anchor</span>
              </div>
              <div style="padding:32px 32px 8px;">
                <h1 style="margin:0 0 12px;font-size:22px;color:#0f1e27;">Thanks for getting in touch.</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4a5e6a;">${greeting}</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4a5e6a;">We have your message and someone on the team will get back to you soon. If you need to add anything, just reply to this email and it reaches us directly.</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4a5e6a;">While you wait, Anchor is live on TestFlight if you would like to try it:</p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="${TESTFLIGHT_URL}" style="display:inline-block;background:#313852;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 26px;border-radius:99px;">Open the TestFlight beta</a>
                </div>
                <p style="margin:0 0 2px;font-size:15px;color:#4a5e6a;">Talk soon,</p>
                <p style="margin:0 0 22px;font-size:15px;color:#0f1e27;font-weight:600;">The Anchor team</p>
              </div>
              <div style="border-top:1px solid #d4e0e8;padding:16px 32px;background:#f8fafb;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#7a909c;">You're getting this because you contacted us through the Anchor site. Questions? <a href="mailto:${CONTACT_TO}" style="color:#4a8fa8;">${CONTACT_TO}</a></p>
              </div>
            </div>
          </div>`,
      }),
    });
    if (!res.ok) {
      logger.error({ to, status: res.status, body: await res.text() }, 'Brevo contact ack failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ to, err: err.message }, 'Brevo contact ack threw');
    return false;
  }
}
