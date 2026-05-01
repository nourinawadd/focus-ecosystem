// Global Express error handler. Maps known error shapes to proper HTTP status
// codes; everything else falls through to 500.
export default function errorHandler(err, _req, res, _next) {
  // Mongoose document validation
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(e => e.message).join(', ');
    return res.status(400).json({ message });
  }

  // Mongoose cast (e.g. malformed ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({ message: `Invalid ${err.path}` });
  }

  // Duplicate key (unique index violation)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue ?? {})[0] ?? 'field';
    return res.status(409).json({ message: `${field} already in use` });
  }

  // JWT errors (when verify is called outside auth middleware's own try)
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  // Errors thrown with an explicit status (e.g. createError-style)
  if (typeof err.status === 'number') {
    return res.status(err.status).json({ message: err.message });
  }

  console.error(err);
  res.status(500).json({ message: err.message || 'Server error' });
}
