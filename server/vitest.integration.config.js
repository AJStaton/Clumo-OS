// Separate Vitest config for HTTP recording integration tests (Polly.js).
// These run only via `npm run test:integration` and either:
//   - replay committed fixtures from tests/integration/fixtures/ (default), or
//   - hit real APIs when POLLY_MODE=record is set (requires real keys).

const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.test.js'],
    setupFiles: ['./tests/setup.js'],
    // Network round-trips can be slow even when recorded.
    testTimeout: 30000
  }
});
