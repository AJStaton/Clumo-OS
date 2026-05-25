// Playwright config for Clumo end-to-end tests.
// Two projects:
//   - browser: drives the React UI served at http://localhost:3000 (server) or 5173 (vite dev)
//   - electron: drives the full Electron app (mic/desktopCapturer/IPC paths)

const { defineConfig } = require('@playwright/test');

const PORT = process.env.CLUMO_E2E_PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'browser',
      testMatch: /e2e\/browser\/.*\.spec\.js/,
      use: {
        browserName: 'chromium'
      },
      // Start the server before running browser tests
      // (Electron tests boot their own server via the Electron main process)
    },
    {
      name: 'electron',
      testMatch: /e2e\/electron\/.*\.spec\.js/
    }
  ],
  webServer: process.env.CLUMO_E2E_NO_SERVER
    ? undefined
    : {
        command: 'npm --prefix server run start',
        url: `${BASE_URL}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      }
});
