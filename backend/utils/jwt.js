import jwt    from 'jsonwebtoken';
import crypto from 'crypto';

// Access tokens are short-lived (1h) so a leaked one expires quickly; the
// refresh token (stored hashed, see models/RefreshToken.js) does the long-haul.
const ACCESS_TTL = process.env.JWT_EXPIRES_IN || '1h';

export const signAccess = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL });

export const verify = (token) => jwt.verify(token, process.env.JWT_SECRET);

/**
 * Mint a new refresh token. Returns the raw token (handed to the client, never
 * persisted) alongside its hash (the only form stored server-side).
 */
export const signRefresh = () => {
  const token = crypto.randomBytes(48).toString('hex');
  return { token, tokenHash: hashToken(token) };
};

/**
 * Keyed sha256 of a refresh token. HMAC with JWT_REFRESH_SECRET (rather than a
 * bare sha256) means a DB leak alone can't be used to recognise or forge
 * tokens without also holding the server secret.
 */
export const hashToken = (token) =>
  crypto.createHmac('sha256', process.env.JWT_REFRESH_SECRET).update(token).digest('hex');
