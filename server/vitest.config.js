// Vitest config for the Clumo server (CommonJS Node)
// Tests live under server/tests/ with *.test.js suffix.

const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.js'],
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
