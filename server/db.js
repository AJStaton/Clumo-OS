// SQLite database for Clumo
// Stores config (API keys, preferences) and session metadata

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'clumo.db');
const KEY_PATH = path.join(DATA_DIR, 'clumo.key');

let db = null;

function getDb() {
  if (db) return db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const Database = require('better-sqlite3');
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT,
      start_time TEXT,
      end_time TEXT,
      suggestion_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active'
    );
  `);

  return db;
}

// --- Encryption helpers for API keys ---

function getEncryptionKey() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(KEY_PATH)) {
    return fs.readFileSync(KEY_PATH);
  }

  // Generate a new 32-byte key on first run
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_PATH, key);
  return key;
}

function encrypt(text) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  const key = getEncryptionKey();
  const [ivHex, encrypted] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// --- Config operations ---

function getConfig(key) {
  const row = getDb().prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setConfig(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value);
}

function deleteConfig(key) {
  getDb().prepare('DELETE FROM config WHERE key = ?').run(key);
}

function getAllConfig() {
  const rows = getDb().prepare('SELECT key, value FROM config').all();
  const config = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }
  return config;
}

// --- Encrypted config (for API keys) ---

function getSecureConfig(key) {
  const value = getConfig(key);
  if (!value) return null;
  try {
    return decrypt(value);
  } catch (e) {
    console.error(`[DB] Failed to decrypt config key "${key}":`, e.message);
    return null;
  }
}

function setSecureConfig(key, value) {
  setConfig(key, encrypt(value));
}

// --- Session metadata operations ---

function createSession(id, name) {
  getDb().prepare(
    'INSERT INTO sessions (id, name, start_time, status) VALUES (?, ?, ?, ?)'
  ).run(id, name || null, new Date().toISOString(), 'active');
}

function completeSession(id, suggestionCount) {
  getDb().prepare(
    'UPDATE sessions SET end_time = ?, suggestion_count = ?, status = ? WHERE id = ?'
  ).run(new Date().toISOString(), suggestionCount || 0, 'completed', id);
}

function getSession(id) {
  return getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}

function listSessions() {
  return getDb().prepare(
    'SELECT * FROM sessions ORDER BY start_time DESC'
  ).all();
}

function deleteSession(id) {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

// --- Setup status helpers ---

function isSetupComplete() {
  const providerMode = getConfig('provider_mode');
  if (providerMode === 'managed') return true;
  const provider = getConfig('ai_provider');
  return !!provider;
}

function isOnboardingComplete() {
  const status = getConfig('onboarding_complete');
  return status === 'true';
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getDb,
  getConfig,
  setConfig,
  deleteConfig,
  getAllConfig,
  getSecureConfig,
  setSecureConfig,
  createSession,
  completeSession,
  getSession,
  listSessions,
  deleteSession,
  isSetupComplete,
  isOnboardingComplete,
  close
};
