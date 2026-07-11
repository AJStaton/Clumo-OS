// Vitest config for the Clumo server (CommonJS Node)
// Tests live under server/tests/ with *.test.js suffix.

const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.js'],
    // Integration tests run against recorded HTTP fixtures and are opt-in via
    // `npm run test:integration` so a fresh clone with no recordings doesn't
    // turn `npm test` red. See server/tests/integration/README.md.
    exclude: ['node_modules', 'tests/integration/**'],
    setupFiles: ['./tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['*.js', 'routes/**/*.js'],
      exclude: ['index.js', 'tests/**', 'data/**', 'uploads/**', 'public/**']
    },
    testTimeout: 10000
  }
});
