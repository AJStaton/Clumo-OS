// Smoke test: launch the full Electron app under --test mode and confirm
// it boots, the first window appears, and no uncaught console errors fire.
//
// --test mode (electron/main.js) wires up Chromium's fake-media flags and
// sets CLUMO_FAKE_PROVIDER=1 so the embedded server returns canned
// responses instead of calling OpenAI/Azure.

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

const ELECTRON_ENTRY = path.resolve(__dirname, '..', '..', 'electron', 'main.js');

test.describe('Electron — boot', () => {
  test('launches, opens a window, no uncaught console errors', async () => {
    const app = await electron.launch({
      args: [ELECTRON_ENTRY, '--test'],
      timeout: 60_000
    });

    const consoleErrors = [];
    app.on('window', (win) => {
      win.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
      win.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
      });
    });

    const window = await app.firstWindow();
    expect(window).toBeTruthy();

    // Wait for the React root to mount.
    await window.waitForLoadState('domcontentloaded');
    await window.waitForLoadState('networkidle').catch(() => {});

    const title = await window.title();
    expect(title.length).toBeGreaterThan(0);

    // Ignore noisy DevTools / autofill warnings which Chromium emits in
    // headless / dev contexts. Real app errors should be empty.
    const real = consoleErrors.filter(e =>
      !/Autofill|DevTools|sourcemaps|Failed to load resource: net::ERR_FILE_NOT_FOUND/i.test(e)
    );
    expect(real, `unexpected console errors:\n${real.join('\n')}`).toEqual([]);

    await app.close();
  });
});
