// E2E: experimental live-coaching UI (stacking nudges + repositioned right rail).
//
// The coaching view only renders during an active "listening" session, so this
// spec drives a full, deterministic call without a real AI provider, real audio,
// or real machine state:
//   - HTTP: /api/* is stubbed via page.route so the app boots straight into the
//     configured, coaching-enabled shell regardless of the server's data dir.
//   - Media: getDisplayMedia/getUserMedia return a real synthetic audio stream
//     (oscillator -> MediaStreamDestination) so CallSessionContext's AudioContext
//     wiring succeeds in headless Chromium.
//   - WebSocket: window.WebSocket is replaced with a mock that opens immediately
//     and lets the test push server frames via window.__clumoEmit(...).
//
// This exercises the real React app end-to-end (routing, contexts, components,
// Tailwind layout) — only the untestable I/O edges are faked.

const { test, expect } = require('@playwright/test');

// Fake media + mock WebSocket, installed before any app script runs.
const INIT_SCRIPT = `
  (() => {
    // --- Fake screen/mic capture: a genuine MediaStream with one audio track ---
    async function fakeStream() {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ac.createOscillator();
      const dest = ac.createMediaStreamDestination();
      osc.connect(dest);
      osc.start();
      return dest.stream;
    }
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getDisplayMedia = fakeStream;
      navigator.mediaDevices.getUserMedia = fakeStream;
    }

    // --- Mock WebSocket the app connects to at /ws ---
    const instances = [];
    class MockWebSocket {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      constructor(url) {
        this.url = url;
        this.readyState = MockWebSocket.CONNECTING;
        this.onopen = this.onmessage = this.onclose = this.onerror = null;
        instances.push(this);
        setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          if (this.onopen) this.onopen({});
        }, 0);
      }
      send() {}
      close() {
        this.readyState = MockWebSocket.CLOSED;
        if (this.onclose) this.onclose({});
      }
    }
    window.WebSocket = MockWebSocket;

    // Push a server frame to the most-recent socket.
    window.__clumoEmit = (obj) => {
      const ws = instances[instances.length - 1];
      if (ws && ws.onmessage) ws.onmessage({ data: JSON.stringify(obj) });
    };
  })();
`;

function coachingFrame(overrides = {}) {
  return {
    type: 'coaching',
    coaching: {
      persona: 'ae',
      type: 'MultiThread',
      urgency: 'now',
      signal: 'questioning value of the technology',
      headline: 'Identify the economic buyer now',
      why: 'Understanding the economic buyer is crucial for advancing the deal.',
      say: 'Can we discuss who the economic buyer is for this project?',
      ...overrides
    }
  };
}

test.describe('experimental live-coaching UI', () => {
  test.beforeEach(async ({ page }) => {
    // Deterministic app state: setup complete, provider configured, coaching on.
    await page.route('**/api/status', (r) =>
      r.fulfill({ json: { setupComplete: true } }));
    await page.route('**/api/preferences', (r) =>
      r.fulfill({ json: { methodology: 'meddpicc', theme: 'light', coachingEnabled: true } }));
    await page.route('**/api/settings', (r) =>
      r.fulfill({ json: { configured: true } }));
    await page.route('**/api/sessions', (r) => r.fulfill({ json: [] }));
    await page.route('**/api/onboarding/knowledge-base', (r) =>
      r.fulfill({ json: { items: [] } }));

    await page.addInitScript(INIT_SCRIPT);
  });

  async function startCall(page) {
    await page.goto('/session');
    await page.getByRole('button', { name: /start listening/i }).first().click();
    // Coaching column header confirms we're in the live coaching layout.
    await expect(page.getByRole('heading', { name: 'Coaching' })).toBeVisible();
    await expect(page.getByText('Experimental')).toBeVisible();
  }

  test('starts a call and shows the empty coaching prompt', async ({ page }) => {
    await startCall(page);
    await expect(page.getByText(/only at the moments that matter/i)).toBeVisible();
  });

  test('renders a coaching nudge pushed from the server', async ({ page }) => {
    await startCall(page);
    await page.evaluate((f) => window.__clumoEmit(f), coachingFrame());

    await expect(page.getByText('Identify the economic buyer now')).toBeVisible();
    await expect(page.getByText('Customer signal:')).toBeVisible();
    await expect(page.getByText(/questioning value of the technology/i)).toBeVisible();
    await expect(page.getByText('Try saying')).toBeVisible();
    await expect(page.getByText(/who the economic buyer is/i)).toBeVisible();
  });

  test('stacks successive nudges instead of replacing them', async ({ page }) => {
    await startCall(page);

    await page.evaluate((f) => window.__clumoEmit(f), coachingFrame({ headline: 'Older move' }));
    await expect(page.getByText('Older move')).toBeVisible();

    await page.evaluate((f) => window.__clumoEmit(f), coachingFrame({ headline: 'Newest move' }));

    // Both remain on screen — the older card is not discarded.
    await expect(page.getByText('Newest move')).toBeVisible();
    await expect(page.getByText('Older move')).toBeVisible();
  });

  test('shows the newest nudge first and marks only it as "Now"', async ({ page }) => {
    await startCall(page);

    await page.evaluate((f) => window.__clumoEmit(f), coachingFrame({ headline: 'Older move' }));
    await page.evaluate((f) => window.__clumoEmit(f), coachingFrame({ headline: 'Newest move' }));

    const newest = await page.getByText('Newest move').boundingBox();
    const older = await page.getByText('Older move').boundingBox();
    expect(newest.y).toBeLessThan(older.y);

    // The urgent "Now" badge is only on the latest card.
    await expect(page.getByText('Now', { exact: true })).toHaveCount(1);
  });

  test('renders the Solution Engineer lens on a technical nudge', async ({ page }) => {
    await startCall(page);
    await page.evaluate((f) => window.__clumoEmit(f), coachingFrame({
      persona: 'se',
      type: 'DeRisk',
      signal: 'questioning integration and security',
      headline: 'De-risk the integration concern',
      say: 'Our API supports SSO and SOC 2 out of the box.'
    }));

    await expect(page.getByText('Solution Engineer')).toBeVisible();
    await expect(page.getByText('De-risk the integration concern')).toBeVisible();
  });

  test('renders the new SE technical moves (Prove it / Quantify value)', async ({ page }) => {
    await startCall(page);
    await page.evaluate((f) => window.__clumoEmit(f), coachingFrame({
      persona: 'se',
      type: 'ProveIt',
      signal: 'skeptical the platform can handle their throughput',
      headline: 'Offer a proof of concept on their data',
      say: 'Let us run a POC against a sample of your production load.'
    }));
    await page.evaluate((f) => window.__clumoEmit(f), coachingFrame({
      persona: 'se',
      type: 'QuantifyTech',
      signal: 'questioning value of the technology',
      headline: 'Put numbers on the latency win',
      say: 'That cuts p99 latency from 400ms to under 50ms.'
    }));

    await expect(page.getByText('Prove it')).toBeVisible();
    await expect(page.getByText('Quantify value')).toBeVisible();
    await expect(page.getByText('Offer a proof of concept on their data')).toBeVisible();
  });

  test('labels You and Customer lines in the transcript', async ({ page }) => {
    await startCall(page);

    await page.evaluate(() => window.__clumoEmit({
      type: 'transcript',
      text: 'How does your API handle authentication?',
      speaker: 'customer'
    }));
    await page.evaluate(() => window.__clumoEmit({
      type: 'transcript',
      text: 'Great question — we support SSO via SAML.',
      speaker: 'you'
    }));

    await expect(page.getByText(/how does your api handle authentication/i)).toBeVisible();
    await expect(page.getByText(/we support sso via saml/i)).toBeVisible();
    // Both speaker badges are present in the transcript.
    await expect(page.getByText('Customer', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('You', { exact: true }).first()).toBeVisible();
  });

  test('positions MEDDPICC above the transcript in the right rail', async ({ page }) => {
    await startCall(page);

    await page.evaluate(() => window.__clumoEmit({
      type: 'meddpicc_update',
      meddpicc: {
        M: { status: 'partial', label: 'Metrics' },
        E: { status: 'confirmed', label: 'Economic Buyer' },
        I: { status: 'confirmed', label: 'Identify Pain' }
      }
    }));
    await page.evaluate(() => window.__clumoEmit({
      type: 'transcript',
      text: 'So how are you measuring success on this project today?'
    }));

    const meddpicc = await page.getByRole('heading', { name: 'MEDDPICC' }).boundingBox();
    const transcript = await page.getByRole('heading', { name: 'Transcript' }).boundingBox();

    // MEDDPICC sits at the top; the transcript is tucked into the bottom-right.
    expect(meddpicc.y).toBeLessThan(transcript.y);
    await expect(page.getByText(/how are you measuring success/i)).toBeVisible();
  });
});
