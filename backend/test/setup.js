// Global test setup: spin up an in-memory MongoDB, point mongoose at it, and
// provide the env vars the app expects. Collections are wiped after every test
// so cases stay isolated. No external infrastructure required.
import { beforeAll, afterEach, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Must be set before any module reads them (createApp reads CORS_ORIGINS;
// utils/jwt reads the secrets at call time). NODE_ENV=test also silences the
// logger and disables auth rate limiting.
process.env.NODE_ENV           = 'test';
process.env.JWT_SECRET         = 'test-jwt-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-also-quite-long-enough';
process.env.JWT_EXPIRES_IN     = '1h';
process.env.CORS_ORIGINS       = 'http://localhost:3000';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGO_URI);
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});
