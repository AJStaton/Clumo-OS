// Managed AI credentials — embedded at build time
// These are seeded into the encrypted local store on first run when "Managed Models" is selected.
//
// To configure for production builds:
// Set CLUMO_MANAGED_ENDPOINT and CLUMO_MANAGED_API_KEY environment variables before building.
// The Electron build process will inline them here.
//
// For development: copy managed-credentials.local.js from managed-credentials.js
// and fill in your values. The .local.js file is gitignored.

const fs = require('fs');
const path = require('path');

// Try loading local override first (for dev), then fall back to env vars
let MANAGED_ENDPOINT = process.env.CLUMO_MANAGED_ENDPOINT || '';
let MANAGED_API_KEY = process.env.CLUMO_MANAGED_API_KEY || '';
let MANAGED_CHAT_MODEL = process.env.CLUMO_MANAGED_CHAT_MODEL || 'gpt-4o-mini';
let MANAGED_REALTIME_MODEL = process.env.CLUMO_MANAGED_REALTIME_MODEL || 'gpt-realtime-mini';
let MANAGED_EMBEDDING_MODEL = process.env.CLUMO_MANAGED_EMBEDDING_MODEL || 'text-embedding-ada-002';
let MANAGED_TRANSCRIPTION_MODEL = process.env.CLUMO_MANAGED_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe';

const localCredsPath = path.join(__dirname, 'managed-credentials.local.js');
if (fs.existsSync(localCredsPath)) {
  try {
    const local = require(localCredsPath);
    MANAGED_ENDPOINT = local.endpoint || MANAGED_ENDPOINT;
    MANAGED_API_KEY = local.apiKey || MANAGED_API_KEY;
    MANAGED_CHAT_MODEL = local.chatModel || MANAGED_CHAT_MODEL;
    MANAGED_REALTIME_MODEL = local.realtimeModel || MANAGED_REALTIME_MODEL;
    MANAGED_EMBEDDING_MODEL = local.embeddingModel || MANAGED_EMBEDDING_MODEL;
    MANAGED_TRANSCRIPTION_MODEL = local.transcriptionModel || MANAGED_TRANSCRIPTION_MODEL;
  } catch (e) {
    console.warn('[Managed] Failed to load local credentials file:', e.message);
  }
}

module.exports = {
  endpoint: MANAGED_ENDPOINT,
  apiKey: MANAGED_API_KEY,
  chatModel: MANAGED_CHAT_MODEL,
  realtimeModel: MANAGED_REALTIME_MODEL,
  embeddingModel: MANAGED_EMBEDDING_MODEL,
  transcriptionModel: MANAGED_TRANSCRIPTION_MODEL,
  isConfigured: () => !!(MANAGED_ENDPOINT && MANAGED_API_KEY)
};
