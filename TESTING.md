# Clumo-OS Testing Guide

A cheat sheet for writing, running, and maintaining tests in this repo.

> **Stack:** Vitest (unit/integration) + Playwright (E2E + Electron). No Jest, no Mocha, no Karma.

---

## 1. Quick start

```bash
# From repo root
npm install                  # installs root + server + web + electron deps
npm test                     # runs all unit/integration tests (server + web)
npm run test:unit            # alias for the above
npm run test:e2e             # runs Playwright browser specs
npm run test:e2e:electron    # runs Playwright Electron specs
npm run test:coverage        # generates V8 coverage reports
```

Per-workspace:

```bash
cd server && npm test        # server-only Vitest
cd web && npm test           # web-only Vitest
cd web && npm run test:ui    # interactive Vitest UI
```

---

## 2. Folder layout

```
clumo-electron/
├── server/
│   ├── tests/
│   │   ├── setup.js              ← test bootstrap (temp data dir)
│   │   ├── *.test.js             ← per-module unit tests
│   │   └── routes/
│   │       └── api.test.js       ← supertest HTTP integration tests
│   └── vitest.config.js
├── web/
│   ├── tests/
│   │   ├── setup.js              ← jest-dom + window/global stubs
│   │   ├── components/*.test.jsx ← component tests (Testing Library)
│   │   ├── lib/*.test.js         ← pure-JS tests (ws-client, etc.)
│   │   └── pages/*.test.jsx      ← page-level tests
│   └── vitest.config.js
├── electron/
│   ├── tests/
│   │   ├── fixtures/tiny-server.js   ← stub HTTP server for ServerManager unit tests
│   │   ├── server-manager.test.js    ← Vitest unit tests (Node side)
│   │   └── vitest.config.js
├── e2e/
│   ├── browser/                      ← Playwright browser specs (UI in chromium)
│   └── electron/                     ← Playwright Electron specs (full app + IPC)
│       ├── boot.spec.js              ← app launches, window opens, no console errors
│       ├── preload-bridge.spec.js    ← window.clumo surface + contextIsolation
│       └── server-lifecycle.spec.js  ← embedded server reachable, dies on close
└── playwright.config.js
```

Naming convention: `*.test.js` for plain JS, `*.test.jsx` for React, `*.spec.js` for Playwright.

---

## 3. Writing server tests

Server tests run in Node.js with Vitest globals. `describe`, `it`, `expect`, `vi`, `beforeEach`, `afterEach`, `afterAll` are **available without import** (`globals: true` in `server/vitest.config.js`).

> ⚠️ Don't `require('vitest')` — Vitest is ESM-only and CommonJS `require` will throw. Use the globals.

**Pattern: isolated SQLite + storage per test file**

Every server module that touches disk honors `process.env.CLUMO_TEST_DATA_DIR`. Always set this to a fresh temp dir per file:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpDir;
let db;
let storage;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clumo-test-'));
  process.env.CLUMO_TEST_DATA_DIR = tmpDir;
  // Force module re-evaluation so DATA_DIR is recomputed
  delete require.cache[require.resolve('../db.js')];
  delete require.cache[require.resolve('../storage.js')];
  db = require('../db.js');
  storage = require('../storage.js');
});

afterEach(() => {
  if (db?.close) db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```

**Pattern: HTTP integration with supertest**

```js
const request = require('supertest');
const express = require('express');

let app;
beforeEach(() => {
  // …reset modules as above…
  app = express();
  app.use(express.json());
  app.use('/api', require('../routes/api'));
});

it('GET /api/status returns 200', async () => {
  const res = await request(app).get('/api/status');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('isConfigured');
});
```

**Pattern: mocking the AI provider**

```js
vi.mock('../ai-provider.js', () => ({
  loadProvider: () => ({
    transcribe: vi.fn().mockResolvedValue('hello world'),
    chat: vi.fn().mockResolvedValue({ content: 'reply' })
  })
}));
```

Never put a real API key in a test — even in a `.env.test`. Mock the provider.

---

## 4. Writing web component tests

Web tests run in `happy-dom` with `@testing-library/react`. `jest-dom` matchers are loaded in `web/tests/setup.js`.

**Boilerplate:**

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MyComponent from '../../src/components/MyComponent.jsx';

describe('MyComponent', () => {
  it('renders the label', () => {
    render(<MyComponent label="hi" />);
    expect(screen.getByText('hi')).toBeInTheDocument();
  });
});
```

**Querying — preferred order** (per Testing Library guidance):
1. `getByRole` (accessibility-first)
2. `getByLabelText` (form fields)
3. `getByPlaceholderText`
4. `getByText`
5. `getByDisplayValue`
6. `getByAltText`
7. `getByTitle`
8. `getByTestId` (last resort, add `data-testid` only when nothing else works)

**Faking time** (for components with `setInterval` like `SuggestionCard`):

```js
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('decrements timer', () => {
  render(<SuggestionCard suggestion={…} />);
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText('14s')).toBeInTheDocument();
});
```

**Stubbing globals (`window.clumo`, `fetch`, etc.):** done in `web/tests/setup.js`. Override per-test with `vi.stubGlobal`.

---

## 5. Writing E2E tests (Playwright)

```js
// e2e/browser/setup.spec.js
import { test, expect } from '@playwright/test';

test('first-run setup', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Welcome to Clumo/i })).toBeVisible();
  await page.getByRole('button', { name: /Get started/i }).click();
  // …mock the API or use a seeded test server…
});
```

Browser specs (`e2e/browser/`) run against the Node server (`webServer` config auto-starts it on port 3000).

---

## 5a. Writing Electron tests (Playwright + Vitest)

The Electron shell has **two test layers**:

### Layer 1 — Vitest unit tests (Node-only, no GUI)

Lives in `electron/tests/`. Exercises Node-side helpers like `ServerManager` without launching the full Electron runtime. Uses `electron/tests/fixtures/tiny-server.js` as a stand-in for the real embedded server so tests don't need SQLite or the OpenAI client.

```bash
npm run test:electron        # ~3s, 6 tests
```

When testing `ServerManager`, inject `serverEntry`, `extraEnv`, `healthTimeoutMs`, and `healthPollIntervalMs` via the constructor so the test owns the lifecycle:

```js
const sm = new ServerManager({
  serverEntry: path.join(__dirname, 'fixtures', 'tiny-server.js'),
  extraEnv: { CLUMO_FAKE_PROVIDER: '1' },
  healthTimeoutMs: 5000,
  healthPollIntervalMs: 100
});
```

### Layer 2 — Playwright Electron specs (full app + IPC)

Lives in `e2e/electron/`. Launches the actual packaged Electron main process with `--test` flag, which:

- Enables Chromium's fake media stream (synthetic 440 Hz tone for `getUserMedia`, no permission prompts)
- Sets `CLUMO_FAKE_PROVIDER=1` so the embedded server returns canned AI responses (no real OpenAI calls, no API keys needed)
- Resolves the server entry from the in-repo dev layout (not `process.resourcesPath`)

```js
const { test, expect, _electron: electron } = require('@playwright/test');

const app = await electron.launch({ args: ['electron/main.js', '--test'] });
const win = await app.firstWindow();

// Verify preload bridge surface
const port = await win.evaluate(() => window.clumo.getServerPort());

// Verify contextIsolation: Node globals must NOT leak
const leak = await win.evaluate(() => typeof window.require);
expect(leak).toBe('undefined');

await app.close();
```

```bash
npm run test:e2e:electron    # ~8s, 6 tests (boot + preload + lifecycle)
```

**Cross-platform note:** `test:e2e:electron` uses `cross-env CLUMO_E2E_NO_SERVER=1` so the global Playwright `webServer` (which boots the standalone HTTP server on port 3000) doesn't conflict with the Electron-embedded server which picks its own dynamic port.

**Production-code hooks (intentional and minimal):**

| Hook | Location | Purpose |
|---|---|---|
| `--test` flag / `CLUMO_TEST_MODE=1` | `electron/main.js` | Activates fake-media flags + fake provider |
| `CLUMO_FAKE_PROVIDER=1` | `server/ai-provider.js` | Short-circuits `loadProvider()` to `server/tests/fixtures/fake-provider.js` |

Both are no-ops in production. The fake provider implements the same interface as `AzureOpenAIProvider` / `OpenAIProvider` (chatCompletion, createRealtimeWebSocket, generateEmbedding, validateConfig) and echoes user input deterministically.

---

## 5b. Provider integration tests (Polly.js HTTP recordings)

The `chatCompletion` / `transcribe` / `embedding` paths through `ai-provider.js` are exercised against **frozen recordings of real OpenAI / Azure responses** rather than hand-written mocks. A recording is one HTTP request/response pair, captured once against the real API and replayed deterministically forever.

```bash
npm run test:integration            # replay committed fixtures (default, $0)
npm run test:integration:record     # hit real APIs, overwrite fixtures (~$0.01/run)
```

Required env vars for `record` mode: `OPENAI_API_KEY` and/or `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_KEY` + `AZURE_OPENAI_DEPLOYMENT`.

**These tests are excluded from the default `npm test` run** because a fresh clone may not yet have committed fixtures. They only run via `test:integration`. See `server/tests/integration/fixtures/README.md` for the full record/replay workflow, redaction rules, and re-record cadence.

**Why this is more powerful than mocks:** mocks verify your code *calls* a function. Recordings verify your code correctly **parses, error-handles, and reacts to actual provider responses** — including headers, edge fields, refusals, and quirks you'd never invent.

**Critical guardrails baked in (`server/tests/support/polly.js`):**
- `Authorization`, `api-key`, `x-api-key`, `openai-organization` headers are replaced with `[REDACTED]` before any file is written.
- Date / request-ID headers are normalized so re-recordings produce stable diffs.
- Recording bodies are JSON-scanned for any field matching `/api[_-]?key|secret|token/i` and redacted defensively.

**Adding a new recording:**
1. Add a test in `server/tests/integration/` using `startPolly('your-slug')`.
2. Run `npm run test:integration:record` with real keys.
3. Open `server/tests/integration/fixtures/your-slug_*.har` and **verify no secrets leaked**.
4. Commit the fixture.

---

## 5c. Realtime WebSocket integration test (live API)

`server/tests/integration/ai-provider.azure-realtime.test.js` connects to the **live** Azure OpenAI Realtime API over WebSocket, streams a small committed WAV (`server/tests/integration/fixtures/realtime-sample.wav`, 16 kHz mono PCM16), and asserts a transcript comes back. This is the only test that exercises `AzureOpenAIProvider.createRealtimeWebSocket()` end-to-end.

```bash
# Skips when env vars are missing (exit 0):
npm run test:realtime --workspace=server

# Hits the live API (~$0.001/run):
AZURE_OPENAI_ENDPOINT=https://your.openai.azure.com \
AZURE_OPENAI_KEY=...                                  \
AZURE_OPENAI_REALTIME_DEPLOYMENT=gpt-4o-realtime-preview \
  npm run test:realtime --workspace=server
```

Why it's separate from `test:integration`: Polly's HTTP adapter cannot record WebSocket frames, so this layer cannot use fixtures — every run with credentials is a real network call. It uses its own `server/vitest.realtime.config.js` and is explicitly excluded from the Polly config so a `test:integration` run never accidentally hits the live Realtime endpoint.

Run cadence:
- Before every release (referenced from `e2e/manual/RELEASE-SMOKE-TEST.md`).
- Whenever `server/ai-provider.js` realtime code or `server/routes/ws.js` event handling changes.

---

## 5d. Pre-release manual smoke test

`e2e/manual/RELEASE-SMOKE-TEST.md` is a ~10-minute human-driven checklist run against a freshly built installer before every release. It's the only layer that exercises the real desktopCapturer audio path, the real installer, real Teams audio, and the export-to-disk path end-to-end.

The release manager fills out the sign-off block (tester, date, commit SHA, OS, PASS/FAIL) before shipping. A failed step blocks the release and gets a finding ID in `QA-REPORT.md`.

---

## 6. Coverage

Coverage uses V8 (no Babel). Run:

```bash
npm run test:coverage
```

HTML reports land in `server/coverage/` and `web/coverage/`. Open `index.html`.

Targets:
- Server modules: ≥80% lines (storage/db/ai-provider/routes are tier-1; aim for 90%+)
- Web components: ≥70% lines (interaction-heavy components ≥85%)
- Pure utilities (`ws-client`, `analysis` helpers): 100% achievable

---

## 7. Debugging flaky tests

| Symptom | Tool |
|---|---|
| Component test fails sporadically | `npx vitest --ui` (web/) or `vi.useFakeTimers()` |
| Playwright test fails in CI only | `npx playwright show-trace trace.zip` |
| "Module not found" after refactor | `delete require.cache[…]` in `beforeEach` |
| SQLite "database is locked" | Ensure `db.close()` in `afterEach` |
| OneDrive locks test files on Windows | Use `os.tmpdir()` — never write under the OneDrive checkout root |

---

## 8. Best practices

- **Isolation:** every test creates its own temp dir / fresh DB. No shared state.
- **Determinism:** no real network calls, no real keys, no real time (`useFakeTimers` where relevant).
- **Single-assertion intent:** prefer multiple small `expect`s over a single mega-assert with `toMatchObject`.
- **Repro names:** test titles should read like sentences — "decrements counter when started" beats "test1".
- **Regression tests for bugs:** every issue fixed during the QA cycle should have a regression test referencing the finding ID (e.g. `// regression: F-13`).
- **No snapshot tests for HTML.** They rot too fast. Snapshot pure-data JSON (e.g. MEDDPICC score shapes) only.
- **Mock at the edge.** Mock `fetch`/HTTP and filesystem at module boundaries, not deep internals.

---

## 9. CI integration (future)

The test scripts are CI-friendly by default:

```yaml
# .github/workflows/test.yml (sketch)
- run: npm ci
- run: npm test                    # unit
- run: npx playwright install --with-deps chromium
- run: npm run test:e2e
- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: playwright-traces
    path: test-results/
```

---

## 10. Adding a new test file

1. Decide the layer: server module → `server/tests/`; web component → `web/tests/components/`; full-app flow → `e2e/`.
2. Copy the closest sibling test as a template.
3. Run only that file while iterating: `npx vitest run path/to/file.test.js`.
4. Verify it still passes when the rest of the suite runs: `npm test`.
5. Commit with `test(<area>): <what is now covered>`.

---

**Last updated:** 2025 QA cycle. Owners: this repo's contributors.
