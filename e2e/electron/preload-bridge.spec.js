// Verifies the preload security boundary:
//   - window.clumo exposes the documented surface
//   - No Node globals leak into the renderer (no `require`, no `process`)
//   - IPC handlers respond with the expected shapes

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

const ELECTRON_ENTRY = path.resolve(__dirname, '..', '..', 'electron', 'main.js');

test.describe('Electron — preload bridge', () => {
  let app;
  let win;

  test.beforeAll(async () => {
    app = await electron.launch({ args: [ELECTRON_ENTRY, '--test'], timeout: 60_000 });
    win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    if (app) await app.close();
  });

  test('window.clumo exposes the documented surface', async () => {
    const surface = await win.evaluate(() => {
      const c = window.clumo;
      return {
        keys: c ? Object.keys(c) : null,
        isElectron: c?.isElectron,
        getAudioSourcesType: typeof c?.getAudioSources,
        getMeetingSourcesType: typeof c?.getMeetingSources,
        getServerPortType: typeof c?.getServerPort
      };
    });

    expect(surface.keys).toEqual(expect.arrayContaining([
      'getAudioSources', 'getMeetingSources', 'getServerPort', 'isElectron'
    ]));
    expect(surface.isElectron).toBe(true);
    expect(surface.getAudioSourcesType).toBe('function');
    expect(surface.getMeetingSourcesType).toBe('function');
    expect(surface.getServerPortType).toBe('function');
  });

  test('Node globals are NOT exposed to the renderer (contextIsolation works)', async () => {
    const leaks = await win.evaluate(() => ({
      hasRequire: typeof window.require !== 'undefined',
      hasProcess: typeof window.process !== 'undefined',
      hasModule: typeof window.module !== 'undefined',
      hasBuffer: typeof window.Buffer !== 'undefined',
      hasGlobal: typeof window.global !== 'undefined'
    }));

    expect(leaks.hasRequire).toBe(false);
    expect(leaks.hasProcess).toBe(false);
    expect(leaks.hasModule).toBe(false);
    expect(leaks.hasBuffer).toBe(false);
    expect(leaks.hasGlobal).toBe(false);
  });

  test('clumo.getServerPort() returns a valid port number from the embedded server', async () => {
    const port = await win.evaluate(() => window.clumo.getServerPort());
    expect(typeof port).toBe('number');
    expect(port).toBeGreaterThan(1024);
    expect(port).toBeLessThan(65536);
  });

  test('clumo.getMeetingSources() returns categorized shape', async () => {
    const result = await win.evaluate(() => window.clumo.getMeetingSources());
    expect(result).toHaveProperty('meetings');
    expect(result).toHaveProperty('screens');
    expect(result).toHaveProperty('allSources');
    expect(Array.isArray(result.meetings)).toBe(true);
    expect(Array.isArray(result.screens)).toBe(true);
    expect(Array.isArray(result.allSources)).toBe(true);
  });
});
