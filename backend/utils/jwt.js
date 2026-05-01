import jwt from 'jsonwebtoken';

export const sign = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

export const verify = (token) => jwt.verify(token, process.env.JWT_SECRET);
