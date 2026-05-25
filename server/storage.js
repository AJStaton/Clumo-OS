// Local file storage for Clumo
// Stores knowledge bases and full session data on the local filesystem

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.CLUMO_TEST_DATA_DIR || path.join(__dirname, 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const KB_PATH = path.join(DATA_DIR, 'knowledge-base.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Write a JSON file atomically: write to a sibling temp file, fsync, then rename.
// Prevents truncated/corrupted files if the process crashes mid-write.
function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify(data, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);
}

// --- Knowledge Base ---

function saveKB(data) {
  atomicWriteJson(KB_PATH, data);
}

function loadKB() {
  try {
    if (fs.existsSync(KB_PATH)) {
      return JSON.parse(fs.readFileSync(KB_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('[Storage] Error reading knowledge base:', e.message);
  }
  return null;
}

function hasKB() {
  return fs.existsSync(KB_PATH);
}

function deleteKB() {
  try {
    if (fs.existsSync(KB_PATH)) {
      fs.unlinkSync(KB_PATH);
    }
  } catch (e) {
    console.error('[Storage] Error deleting knowledge base:', e.message);
  }
}

// --- Sessions ---

function getSessionPath(sessionId) {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

function saveSession(sessionId, data) {
  atomicWriteJson(getSessionPath(sessionId), data);
}

function loadSession(sessionId) {
  const filePath = getSessionPath(sessionId);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.error(`[Storage] Error reading session ${sessionId}:`, e.message);
  }
  return null;
}

function deleteSessionData(sessionId) {
  const filePath = getSessionPath(sessionId);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.error(`[Storage] Error deleting session ${sessionId}:`, e.message);
  }
}

function listSessionFiles() {
  ensureDir(SESSIONS_DIR);
  try {
    return fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  } catch (e) {
    console.error('[Storage] Error listing sessions:', e.message);
    return [];
  }
}

module.exports = {
  saveKB,
  loadKB,
  hasKB,
  deleteKB,
  saveSession,
  loadSession,
  deleteSessionData,
  listSessionFiles
};
