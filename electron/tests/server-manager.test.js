// Unit tests for ServerManager.
// Uses a tiny fixture server (electron/tests/fixtures/tiny-server.js)
// rather than spawning the real production server, so the test is fast
// and doesn't depend on SQLite / OpenAI client init / etc.

const path = require('path');
const ServerManager = require('../server-manager');

const TINY_SERVER = path.join(__dirname, 'fixtures', 'tiny-server.js');

describe('ServerManager', () => {
  describe('findPort', () => {
    it('returns a usable TCP port number', async () => {
      const sm = new ServerManager();
      const port = await sm.findPort();
      expect(typeof port).toBe('number');
      expect(port).toBeGreaterThan(1024);
      expect(port).toBeLessThan(65536);
    });
  });

  describe('getPort', () => {
    it('returns null before start()', () => {
      const sm = new ServerManager();
      expect(sm.getPort()).toBeNull();
    });
  });

  describe('stop', () => {
    it('is a safe no-op when not started', () => {
      const sm = new ServerManager();
      expect(() => sm.stop()).not.toThrow();
    });
  });

  describe('start → /health → stop lifecycle', () => {
    let sm;

    afterEach(() => {
      if (sm) sm.stop();
    });

    it('spawns the server, polls /health, resolves when ready, then exits on stop()', async () => {
      sm = new ServerManager({
        serverEntry: TINY_SERVER,
        healthTimeoutMs: 5000,
        healthPollIntervalMs: 100
      });

      await sm.start();
      expect(sm.getPort()).toBeGreaterThan(1024);

      // The tiny-server should be reachable on the chosen port.
      const res = await fetch(`http://localhost:${sm.getPort()}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');

      // Capture process ref then stop and confirm it exits.
      const proc = sm.process;
      const exitedPromise = new Promise(resolve => proc.on('exit', resolve));
      sm.stop();
      await exitedPromise;
    }, 15000);

    it('forwards extraEnv into the spawned process env', async () => {
      sm = new ServerManager({
        serverEntry: TINY_SERVER,
        extraEnv: { CLUMO_FAKE_PROVIDER: '1', CLUMO_TEST_MARKER: 'hello-marker' },
        healthTimeoutMs: 5000,
        healthPollIntervalMs: 100
      });
      await sm.start();
      const res = await fetch(`http://localhost:${sm.getPort()}/health`);
      const body = await res.json();
      expect(body.env.fakeProvider).toBe('1');
      expect(body.env.testMarker).toBe('hello-marker');
    }, 15000);

    it('rejects if the server never becomes healthy in time', async () => {
      // Point at a fixture that delays listening longer than healthTimeoutMs.
      sm = new ServerManager({
        serverEntry: TINY_SERVER,
        extraEnv: { CLUMO_FAKE_SLOW_START_MS: '10000' },
        healthTimeoutMs: 1500,
        healthPollIntervalMs: 100
      });
      await expect(sm.start()).rejects.toThrow(/timeout/i);
    }, 10000);
  });
});
