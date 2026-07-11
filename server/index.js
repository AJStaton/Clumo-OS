// Clumo Server
// Express HTTP + WebSocket server for live call coaching

const http = require('http');
const express = require('express');
const path = require('path');

const apiRoutes = require('./routes/api');
const { setupWebSocket, getActiveSessions, getCompletedSessions } = require('./routes/ws');
const db = require('./db');
const { isAllowedHost } = require('./net-guard');

const IS_DEV = process.env.NODE_ENV !== 'production';

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

const PORT = process.env.PORT || 3000;

const app = express();

// Reject requests whose Host is not a loopback name. Defends against DNS-rebinding
// (a remote page rebinding its hostname to 127.0.0.1 to reach this local server).
app.use((req, res, next) => {
  if (!isAllowedHost(req.headers.host)) {
    return res.status(403).json({ error: 'Forbidden host' });
  }
  next();
});

// Security headers, incl. a Content-Security-Policy for the served UI. The strict
// prod policy would break Vite's HMR (inline/eval + ws to the dev server), so in dev
// we relax script/connect. Provider API calls happen server-side, so the browser only
// ever connects to same-origin + the local WebSocket.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const csp = IS_DEV
    ? [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' ws: wss:",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
      ].join('; ')
    : [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' ws://localhost:* ws://127.0.0.1:*",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
      ].join('; ');
  res.setHeader('Content-Security-Policy', csp);
  next();
});

app.use(express.json());

// Serve built web UI (production) or proxy to Vite dev server
app.use(express.static(path.join(__dirname, 'public')));

// Health check (used by Electron to know when server is ready)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API routes
app.use(apiRoutes);

// Inject session maps so API routes can access active/completed sessions
apiRoutes.injectSessionMaps(getActiveSessions, getCompletedSessions);

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  res.sendFile(indexPath);
});

// Create HTTP server and attach WebSocket
const httpServer = http.createServer(app);
const wss = setupWebSocket(httpServer);

httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`[Server] Clumo running on port ${PORT}`);
  console.log(`[Server] http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[Server] Shutting down...');
  db.close();
  httpServer.close();
  wss.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('[Server] Shutting down...');
  db.close();
  httpServer.close();
  wss.close(() => process.exit(0));
});

module.exports = { app, httpServer };
