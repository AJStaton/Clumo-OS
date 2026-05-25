// Verifies the embedded Node server lifecycle inside the Electron app:
//   - server is reachable on the dynamic port the main process chose
//   - /health returns ok
//   - server is killed cleanly when the Electron app exits

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

const ELECTRON_ENTRY = path.resolve(__dirname, '..', '..', 'electron', 'main.js');

test.describe('Electron — embedded server lifecycle', () => {
  test('server is reachable while app is running, unreachable after close', async () => {
    const app = await electron.launch({ args: [ELECTRON_ENTRY, '--test'], timeout: 60_000 });
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');

    const port = await win.evaluate(() => window.clumo.getServerPort());
    expect(port).toBeGreaterThan(1024);

    // The server's /health endpoint should answer 200.
    const reachable = await win.evaluate(async (p) => {
      try {
        const r = await fetch(`http://localhost:${p}/health`);
        return { ok: r.ok, status: r.status };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }, port);
    expect(reachable.ok).toBe(true);
    expect(reachable.status).toBe(200);

    await app.close();

    // After app.close() the embedded server should be dead. Probe from the
    // host node context (not the renderer, which no longer exists).
    let postCloseError = null;
    try {
      // small grace for SIGTERM → exit
      await new Promise(r => setTimeout(r, 1000));
      await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(2000) });
    } catch (e) {
      postCloseError = e;
    }
    expect(postCloseError, 'server should be unreachable after Electron app closes').toBeTruthy();
  });
});
