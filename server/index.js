// Clumo Server
// Express HTTP + WebSocket server for live call coaching

const http = require('http');
const express = require('express');
const path = require('path');

const apiRoutes = require('./routes/api');
const { setupWebSocket, getActiveSessions, getCompletedSessions } = require('./routes/ws');
const db = require('./db');
const managedCreds = require('./managed-credentials');
const { seedManagedCredentials } = require('./ai-provider');

// Sync managed credentials on every startup so centrally-managed model
// deployments can be updated/retired over time. Endpoint + key are written on
// first run; model deployment names are refreshed whenever they change.
if (managedCreds.isConfigured()) {
  const { seeded, updated } = seedManagedCredentials(managedCreds.endpoint, managedCreds.apiKey, {
    chatModel: managedCreds.chatModel,
    realtimeModel: managedCreds.realtimeModel,
    embeddingModel: managedCreds.embeddingModel,
    transcriptionModel: managedCreds.transcriptionModel
  });
  if (seeded) {
    console.log('[Server] Managed AI credentials seeded from build config');
  } else if (updated.length) {
    console.log(`[Server] Managed config refreshed from build config: ${updated.join(', ')}`);
  }
}

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

const PORT = process.env.PORT || 3000;

const app = express();
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

httpServer.listen(PORT, () => {
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
