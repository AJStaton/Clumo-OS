// Tiny stub server used by electron/tests/server-manager.test.js.
// Listens on the PORT env var (set by ServerManager) and exposes the
// minimum surface ServerManager polls: GET /health → { status: 'ok' }.
// Honors CLUMO_FAKE_PROVIDER and CLUMO_FAKE_SLOW_START env vars to
// exercise the health-poll loop.

const http = require('http');

const port = Number(process.env.PORT);
const fakeSlow = process.env.CLUMO_FAKE_SLOW_START_MS ? Number(process.env.CLUMO_FAKE_SLOW_START_MS) : 0;
const startupDelay = isNaN(fakeSlow) ? 0 : fakeSlow;
const echoEnv = {
  fakeProvider: process.env.CLUMO_FAKE_PROVIDER || null,
  testMarker: process.env.CLUMO_TEST_MARKER || null
};

function listen() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', env: echoEnv }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`tiny-server listening on ${port}`);
  });

  // Honor SIGTERM cleanly so ServerManager.stop() works.
  process.on('SIGTERM', () => {
    server.close(() => process.exit(0));
  });
}

if (startupDelay > 0) {
  setTimeout(listen, startupDelay);
} else {
  listen();
}
