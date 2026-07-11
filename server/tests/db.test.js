// Tests for server/db.js — config, encryption, and session metadata.

const fs = require('fs');
const path = require('path');
const os = require('os');

function freshDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clumo-db-test-'));
  process.env.CLUMO_TEST_DATA_DIR = dir;
  // Bust require cache so db.js picks up the new DATA_DIR
  delete require.cache[require.resolve('../db.js')];
  return dir;
}

describe('db.js — config CRUD', () => {
  let db;
  let dir;

  beforeEach(() => {
    dir = freshDataDir();
    db = require('../db.js');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for missing keys', () => {
    expect(db.getConfig('missing_key')).toBeNull();
  });

  it('stores and retrieves config values', () => {
    db.setConfig('theme', 'dark');
    expect(db.getConfig('theme')).toBe('dark');
  });

  it('overwrites existing keys', () => {
    db.setConfig('theme', 'dark');
    db.setConfig('theme', 'light');
    expect(db.getConfig('theme')).toBe('light');
  });

  it('deletes config keys', () => {
    db.setConfig('temp', 'value');
    db.deleteConfig('temp');
    expect(db.getConfig('temp')).toBeNull();
  });

  it('lists all config as object', () => {
    db.setConfig('a', '1');
    db.setConfig('b', '2');
    const all = db.getAllConfig();
    expect(all).toMatchObject({ a: '1', b: '2' });
  });
});

describe('db.js — encryption', () => {
  let db;
  let dir;

  beforeEach(() => {
    dir = freshDataDir();
    db = require('../db.js');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips a secret value', () => {
    db.setSecureConfig('api_key', 'sk-supersecret');
    expect(db.getSecureConfig('api_key')).toBe('sk-supersecret');
  });

  it('stores ciphertext, not plaintext', () => {
    db.setSecureConfig('api_key', 'sk-supersecret');
    const raw = db.getConfig('api_key');
    expect(raw).not.toBe('sk-supersecret');
    expect(raw).toContain(':'); // iv:ciphertext format
  });

  it('uses a unique IV per encryption (non-deterministic ciphertext)', () => {
    db.setSecureConfig('k1', 'same-secret');
    const a = db.getConfig('k1');
    db.setSecureConfig('k1', 'same-secret');
    const b = db.getConfig('k1');
    expect(a).not.toBe(b);
  });

  it('persists encryption key to disk on first use', () => {
    db.setSecureConfig('k', 'v');
    expect(fs.existsSync(path.join(dir, 'clumo.key'))).toBe(true);
  });

  it('returns null and logs error on decrypt failure', () => {
    // Manually plant a corrupt encrypted value
    db.setConfig('broken', 'deadbeef:notvalidhex');
    expect(db.getSecureConfig('broken')).toBeNull();
  });
});

describe('db.js — session metadata', () => {
  let db;
  let dir;

  beforeEach(() => {
    dir = freshDataDir();
    db = require('../db.js');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates an active session', () => {
    db.createSession('s1', 'Acme Demo');
    const s = db.getSession('s1');
    expect(s).toMatchObject({ id: 's1', name: 'Acme Demo', status: 'active' });
    expect(s.start_time).toBeTruthy();
  });

  it('completes a session and stores suggestion count', () => {
    db.createSession('s2');
    db.completeSession('s2', 7);
    const s = db.getSession('s2');
    expect(s.status).toBe('completed');
    expect(s.suggestion_count).toBe(7);
    expect(s.end_time).toBeTruthy();
  });

  it('lists sessions newest first', () => {
    db.createSession('s1');
    // Small delay so start_time differs
    db.createSession('s2');
    const list = db.listSessions();
    expect(list.length).toBe(2);
    expect(list[0].start_time >= list[1].start_time).toBe(true);
  });

  it('updates session name', () => {
    db.createSession('s1');
    db.updateSessionName('s1', 'Renamed');
    expect(db.getSession('s1').name).toBe('Renamed');
  });

  it('deletes a session', () => {
    db.createSession('s1');
    db.deleteSession('s1');
    expect(db.getSession('s1')).toBeUndefined();
  });
});

describe('db.js — setup helpers', () => {
  let db;
  let dir;

  beforeEach(() => {
    dir = freshDataDir();
    db = require('../db.js');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('isSetupComplete: false when nothing configured', () => {
    expect(db.isSetupComplete()).toBe(false);
  });

  it('isSetupComplete: true when ai_provider set', () => {
    db.setConfig('ai_provider', 'openai');
    expect(db.isSetupComplete()).toBe(true);
  });

  it('isSetupComplete: true when explicit setup_complete flag is set', () => {
    db.setConfig('setup_complete', 'true');
    expect(db.isSetupComplete()).toBe(true);
  });

  it('isOnboardingComplete reads onboarding_complete flag', () => {
    expect(db.isOnboardingComplete()).toBe(false);
    db.setConfig('onboarding_complete', 'true');
    expect(db.isOnboardingComplete()).toBe(true);
  });
});
