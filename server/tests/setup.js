// Vitest setup for Clumo server tests.
// - Routes the database and storage to a unique temp directory per test run
// - Quiets noisy console.error from intentional negative tests

const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'clumo-test-'));
process.env.CLUMO_TEST_DATA_DIR = TMP_DATA;

afterAll(() => {
  try { fs.rmSync(TMP_DATA, { recursive: true, force: true }); } catch {}
});
