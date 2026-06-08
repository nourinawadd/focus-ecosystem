// Single pino logger for the whole backend. Production emits structured JSON
// (one object per line — ready for a log collector); development pretty-prints
// via pino-pretty for readable local output. Import this everywhere instead of
// calling console.* directly.
import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? 'silent' : isProd ? 'info' : 'debug'),
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
  // pino-pretty spawns a worker thread; skip it in prod (JSON) and test (would
  // leave an open handle that stalls the test runner's exit).
  transport: isProd || isTest
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
});

export default logger;
