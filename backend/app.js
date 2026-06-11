// Express app factory. Kept separate from server.js so tests can build an app
// instance (and drive it with supertest) without opening a port or connecting
// to Mongo. server.js owns the runtime bootstrap (env check, DB, listen).
//
// createApp() reads CORS_ORIGINS at call time, so callers must validate env
// (server.js: assertEnv) or set it (tests: setup) before invoking it.
import express  from 'express';
import mongoose from 'mongoose';
import cors     from 'cors';
import helmet   from 'helmet';
import pinoHttp from 'pino-http';

// Register every model once (side-effect imports) before routes resolve them.
import './models/User.js';
import './models/NFCTag.js';
import './models/UserTag.js';
import './models/Session.js';
import './models/FocusLog.js';
import './models/Statistics.js';
import './models/AIInsight.js';
import './models/RefreshToken.js';

import authRoutes      from './routes/auth.js';
import userRoutes      from './routes/user.js';
import sessionRoutes   from './routes/sessions.js';
import analyticsRoutes from './routes/analytics.js';
import aiRoutes        from './routes/ai.js';
import errorHandler    from './middleware/errorHandler.js';
import logger          from './utils/logger.js';
import { getLLMStatus } from './config/llm.js';

export function createApp() {
  const app = express();

  // Trust the first proxy hop so express-rate-limit sees real client IPs.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({
    origin:      process.env.CORS_ORIGINS.split(',').map(o => o.trim()),
    credentials: false,
  }));
  // Structured per-request logging. Health checks are noisy and uninteresting,
  // so skip auto-logging them. Each request gets a `req.log` child logger.
  app.use(pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === '/api/health' },
  }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/auth',      authRoutes);
  app.use('/api/user',      userRoutes);
  app.use('/api/sessions',  sessionRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/ai',        aiRoutes);

  // Liveness + readiness: 503 unless the Mongo connection is actually up.
  // `ai` reports the primary LLM provider (the Gemini fallback hides its
  // failures from users, so this is where they become visible).
  app.get('/api/health', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({
      status: dbUp ? 'ok' : 'degraded',
      db:     dbUp ? 'connected' : 'disconnected',
      ai:     getLLMStatus(),
      ts:     new Date(),
    });
  });

  app.use(errorHandler);

  return app;
}
