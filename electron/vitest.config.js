// Vitest config for the Electron workspace.
// Tests live under electron/tests/ and exercise the Node-side Electron
// helpers (server-manager, etc.) that don't require the GUI runtime.
// Full Electron-app GUI tests live under e2e/electron/ and use Playwright.

const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.js'],
    testTimeout: 20000
  }
});
