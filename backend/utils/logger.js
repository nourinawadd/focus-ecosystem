// Single pino logger for the whole backend. Production emits structured JSON
// (one object per line — ready for a log collector); development pretty-prints
// via pino-pretty for readable local output. Import this everywhere instead of
// calling console.* directly.
import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  // Never let a stray token/password reach the logs.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.refreshToken',
      'req.body.idToken',
      'req.body.identityToken',
    ],
    remove: true,
  },
  transport: isProd
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
});

export default logger;
