// Small manual-validation helpers. Each throws a 400 error (picked up by
// errorHandler) when the value is out of bounds, otherwise returns the
// normalized value so callers can use it directly.
import mongoose from 'mongoose';

export function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

export function requireString(v, { min = 0, max = Infinity, field = 'value' } = {}) {
  if (typeof v !== 'string') throw badRequest(`${field} must be a string`);
  if (v.length < min) throw badRequest(`${field} must be at least ${min} character(s)`);
  if (v.length > max) throw badRequest(`${field} must be at most ${max} character(s)`);
  return v;
}

export function requireInt(v, { min = -Infinity, max = Infinity, field = 'value' } = {}) {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n)) throw badRequest(`${field} must be an integer`);
  if (n < min) throw badRequest(`${field} must be >= ${min}`);
  if (n > max) throw badRequest(`${field} must be <= ${max}`);
  return n;
}

export function requireEnum(v, set, { field = 'value' } = {}) {
  const allowed = Array.isArray(set) ? set : [...set];
  if (!allowed.includes(v)) throw badRequest(`${field} must be one of: ${allowed.join(', ')}`);
  return v;
}

export function requireBool(v, { field = 'value' } = {}) {
  if (typeof v !== 'boolean') throw badRequest(`${field} must be a boolean`);
  return v;
}

export function requireObjectId(v, { field = 'id' } = {}) {
  if (typeof v !== 'string' || !mongoose.Types.ObjectId.isValid(v))
    throw badRequest(`${field} is not a valid id`);
  return v;
}

const DATE_STR_RE = /^\d{4}-\d{2}-\d{2}$/;
export function requireDateStr(v, { field = 'dateStr' } = {}) {
  if (typeof v !== 'string' || !DATE_STR_RE.test(v))
    throw badRequest(`${field} must be in YYYY-MM-DD format`);
  return v;
}
