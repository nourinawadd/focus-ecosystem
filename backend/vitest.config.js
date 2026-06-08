import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    // Booting mongodb-memory-server (first run downloads a mongod binary) and
    // bcrypt hashing are slow, so allow generous timeouts.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    // One Mongo instance shared across files; run files serially so they don't
    // race on the same in-memory database.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      // Report on our own source only (test files + entrypoints excluded).
      // socialAuth.js / config/gemini.js are intentionally mocked in tests, so
      // their real verification/SDK paths show low coverage — by design.
      include: ['routes/**', 'models/**', 'utils/**', 'services/**', 'middleware/**'],
      reporter: ['text', 'html'],
    },
  },
});
