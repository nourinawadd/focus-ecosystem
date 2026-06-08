import 'dotenv/config';
import express  from 'express';
import mongoose from 'mongoose';
import cors     from 'cors';
import helmet   from 'helmet';
import pinoHttp from 'pino-http';
import './models/User.js';
import './models/NFCTag.js';
import './models/UserTag.js';
import './models/Session.js';
import './models/FocusLog.js';
import './models/Statistics.js';
import './models/AIInsight.js';
import './models/Task.js';
import './models/RefreshToken.js';
import { connectDB, disconnectDB } from './config/db.js';
import authRoutes      from './routes/auth.js';
import userRoutes      from './routes/user.js';
import sessionRoutes   from './routes/sessions.js';
import analyticsRoutes from './routes/analytics.js';
import errorHandler    from './middleware/errorHandler.js';
import logger          from './utils/logger.js';
import aiRoutes from './routes/ai.js';
import taskRoutes from './routes/tasks.js';

// ─── Fail fast on misconfiguration ──────────────────────────────────────────
// Better to crash on boot than to run with a weak/absent secret or open CORS.
function assertEnv() {
  const required = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'MONGO_URI', 'CORS_ORIGINS'];
  const missing  = required.filter(key => !process.env[key]);
  if (missing.length)
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  if (process.env.JWT_SECRET.length < 32)
    throw new Error('JWT_SECRET must be at least 32 characters');
}
assertEnv();

const app  = express();
const PORT = process.env.PORT || 5000;

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
app.use('/api/tasks', taskRoutes);

// Liveness + readiness: 503 unless the Mongo connection is actually up.
app.get('/api/health', (_req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'ok' : 'degraded',
    db:     dbUp ? 'connected' : 'disconnected',
    ts:     new Date(),
  });
});

app.use(errorHandler);

connectDB()
  .then(() => {
    const server = app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

    // Graceful shutdown: stop accepting connections, drain in-flight requests,
    // close Mongo, then exit. Force-exit if draining stalls.
    const shutdown = (signal) => {
      logger.info(`${signal} received — shutting down gracefully`);
      server.close(async () => {
        await disconnectDB();
        process.exit(0);
      });
      setTimeout(() => {
        logger.error('Could not close connections in time — forcing exit');
        process.exit(1);
      }, 10_000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
  })
  .catch(err => {
    logger.error({ err }, 'MongoDB connection error');
    process.exit(1);
  });