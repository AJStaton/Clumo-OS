// Shared Polly.js helper for HTTP recordings of provider integration tests.
//
// Modes (set via POLLY_MODE env var):
//   - "replay" (default, CI): fail if no recording matches the request.
//   - "record"               : hit real APIs and overwrite the recording on disk.
//   - "passthrough"          : bypass entirely (debugging only).
//
// Redaction strips authorization headers, API keys, and other secret-bearing
// fields before any recording is written to disk. The fs persister produces
// plain JSON files (one per recording) that are diffable in PRs.

const path = require('path');
const fs = require('fs');
const { Polly } = require('@pollyjs/core');
const NodeHttpAdapter = require('@pollyjs/adapter-node-http');
const FSPersister = require('@pollyjs/persister-fs');

Polly.register(NodeHttpAdapter);
Polly.register(FSPersister);

const FIXTURES_DIR = path.join(__dirname, '..', 'integration', 'fixtures');

const MODE = (process.env.POLLY_MODE || 'replay').toLowerCase();

const VALID_MODES = ['replay', 'record', 'passthrough'];
if (!VALID_MODES.includes(MODE)) {
  throw new Error(`[Polly] POLLY_MODE must be one of ${VALID_MODES.join(', ')} (got: ${MODE})`);
}

// Headers whose values we replace with [REDACTED] in any saved recording.
// Add to this list if you start sending new secret-bearing headers.
const REDACT_REQUEST_HEADERS = [
  'authorization',
  'api-key',
  'x-api-key',
  'openai-organization'
];

// Response headers normalized so re-recordings produce stable diffs.
const NORMALIZE_RESPONSE_HEADERS = {
  'x-request-id': 'req_NORMALIZED',
  'openai-request-id': 'req_NORMALIZED',
  'date': 'Mon, 01 Jan 2025 00:00:00 GMT',
  'azureml-model-session': 'session_NORMALIZED'
};

function redactRequest(req) {
  for (const header of REDACT_REQUEST_HEADERS) {
    if (req.headers && req.headers[header]) {
      req.headers[header] = '[REDACTED]';
    }
  }
  if (req.body && typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      if (parsed && typeof parsed === 'object') {
        for (const k of Object.keys(parsed)) {
          if (/api[_-]?key|secret|token/i.test(k)) {
            parsed[k] = '[REDACTED]';
          }
        }
        req.body = JSON.stringify(parsed);
      }
    } catch { /* not JSON, leave alone */ }
  }
}

function normalizeResponse(res) {
  if (!res.headers) return;
  for (const [h, v] of Object.entries(NORMALIZE_RESPONSE_HEADERS)) {
    if (res.headers[h] !== undefined) {
      res.headers[h] = v;
    }
  }
}

/**
 * Start a Polly recording session bound to the current test.
 *
 * Usage inside a test file:
 *   let polly;
 *   beforeEach(() => { polly = startPolly('openai-chat-suggestion'); });
 *   afterEach(async () => { await polly.stop(); });
 *
 * @param {string} recordingName - Unique slug; becomes the fixture filename.
 * @returns {Polly}
 */
function startPolly(recordingName) {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  const polly = new Polly(recordingName, {
    adapters: ['node-http'],
    persister: 'fs',
    persisterOptions: {
      fs: { recordingsDir: FIXTURES_DIR }
    },
    mode: MODE,
    recordIfMissing: false,
    recordFailedRequests: true,
    matchRequestsBy: {
      method: true,
      url: true,
      headers: false,
      body: true,
      order: false
    },
    logLevel: 'silent'
  });

  polly.server.any().on('beforePersist', (_req, recording) => {
    if (recording?.request) redactRequest(recording.request);
    if (recording?.response) normalizeResponse(recording.response);
  });

  return polly;
}

module.exports = { startPolly, FIXTURES_DIR, MODE };
