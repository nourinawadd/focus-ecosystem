// JWT verification middleware. Attaches req.user to every protected request.
import User from '../models/User.js';
import { verify } from '../utils/jwt.js';

export default async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ message: 'No token provided' });

  const token = header.slice('Bearer '.length).trim();
  try {
    const { id } = verify(token);
    req.user = await User.findById(id).select('-passwordHash');
    if (!req.user) return res.status(401).json({ message: 'User not found' });
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}
