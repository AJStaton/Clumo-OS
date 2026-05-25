// Tests for server/storage.js — knowledge base + session JSON persistence.

const fs = require('fs');
const path = require('path');
const os = require('os');

function freshDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clumo-storage-test-'));
  process.env.CLUMO_TEST_DATA_DIR = dir;
  delete require.cache[require.resolve('../storage.js')];
  return dir;
}

describe('storage.js — knowledge base', () => {
  let storage;
  let dir;

  beforeEach(() => {
    dir = freshDataDir();
    storage = require('../storage.js');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('hasKB returns false before save', () => {
    expect(storage.hasKB()).toBe(false);
    expect(storage.loadKB()).toBeNull();
  });

  it('round-trips KB data', () => {
    const kb = { items: [{ id: '1', text: 'truth' }], version: 1 };
    storage.saveKB(kb);
    expect(storage.hasKB()).toBe(true);
    expect(storage.loadKB()).toEqual(kb);
  });

  it('deleteKB removes the file', () => {
    storage.saveKB({ items: [] });
    storage.deleteKB();
    expect(storage.hasKB()).toBe(false);
  });

  it('loadKB returns null on parse error (corrupted file)', () => {
    fs.writeFileSync(path.join(dir, 'knowledge-base.json'), 'not-json');
    expect(storage.loadKB()).toBeNull();
  });
});

describe('storage.js — sessions', () => {
  let storage;
  let dir;

  beforeEach(() => {
    dir = freshDataDir();
    storage = require('../storage.js');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips session data', () => {
    const data = { sessionId: 's1', fullTranscript: [{ text: 'hi' }], analysis: null };
    storage.saveSession('s1', data);
    expect(storage.loadSession('s1')).toEqual(data);
  });

  it('loadSession returns null for missing id', () => {
    expect(storage.loadSession('nope')).toBeNull();
  });

  it('deleteSessionData removes the file', () => {
    storage.saveSession('s1', { sessionId: 's1' });
    storage.deleteSessionData('s1');
    expect(storage.loadSession('s1')).toBeNull();
  });

  it('listSessionFiles returns ids without extension', () => {
    storage.saveSession('alpha', { sessionId: 'alpha' });
    storage.saveSession('beta', { sessionId: 'beta' });
    const ids = storage.listSessionFiles().sort();
    expect(ids).toEqual(['alpha', 'beta']);
  });

  it('listSessionFiles returns empty array when directory missing', () => {
    expect(storage.listSessionFiles()).toEqual([]);
  });
});
