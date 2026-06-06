import mongoose from 'mongoose';

// Refresh tokens are opaque random strings handed to the client. Only their
// keyed hash (see utils/jwt.hashToken) is ever stored, so a database leak does
// not expose usable tokens. Rotation links each token to its successor via
// `replacedBy`, forming a chain we can burn entirely if a revoked token is
// ever replayed (a token-theft signal).
const RefreshTokenSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true,
  },
  tokenHash:  { type: String, required: true, unique: true },
  expiresAt:  { type: Date,   required: true },
  revokedAt:  { type: Date,   default: null },
  replacedBy: { type: String, default: null },   // tokenHash of the rotated successor
  userAgent:  { type: String, default: null },
  ip:         { type: String, default: null },
}, {
  timestamps: true,
});

// Fast lookup of a user's live tokens (chain revocation, listing sessions).
RefreshTokenSchema.index({ userId: 1, revokedAt: 1 });
// TTL: Mongo purges documents once expiresAt passes.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('RefreshToken', RefreshTokenSchema);
