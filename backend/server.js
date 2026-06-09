import 'dotenv/config';
import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import logger from './utils/logger.js';
import { startNotificationCron } from './jobs/notificationCron.js';

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

const app  = createApp();
const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    startNotificationCron();
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
