// Separate Vitest config for the real-API Realtime WebSocket integration test.
// This test is opt-in via `npm run test:realtime` and either:
//   - skips cleanly when AZURE_OPENAI_ENDPOINT / KEY / REALTIME_DEPLOYMENT are unset, or
//   - hits the live Azure OpenAI Realtime API and asserts a transcript comes back.
//
// It is intentionally separate from `test:integration` (Polly recordings) because
// WebSocket frames are not captured by Polly's HTTP adapter — every run of this
// suite is a real network call (≈$0.001 / run when credentials are present).

const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/ai-provider.azure-realtime.test.js'],
    setupFiles: ['./tests/setup.js'],
    // Live WebSocket round-trips need headroom.
    testTimeout: 45000,
    hookTimeout: 45000
  }
});
