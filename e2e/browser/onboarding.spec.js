// E2E: first-run onboarding flow (the personalised 5-step path).
//
// Verifies the whole first-run journey a new user takes, end to end, against the
// real React app — only the I/O edges are faked:
//   0. Welcome to Clumo            (Landing)
//   1. Connect your AI provider    (Setup step 1 — bring your own key)
//   2. Create your knowledge base  (OnboardingWizard: about-you → sources → generate)
//   3. Refine your playbook        (PlaybookEditor pre-filled + personalised summary)
//   4. Start meeting               (Save & start meeting → lands on the session page)
//
// Faked edges:
//   - HTTP: /api/* stubbed via page.route. /api/status flips to setupComplete once
//     the provider is saved, so the final navigation resolves into the app shell.
//   - EventSource: window.EventSource is mocked to emit a progress frame then a
//     complete frame immediately, so KB "generation" finishes deterministically
//     with no real pipeline, provider, or network.

const { test, expect } = require('@playwright/test');

// Mock the onboarding SSE stream so KB generation completes instantly.
const INIT_SCRIPT = `
  (() => {
    class MockEventSource {
      static CONNECTING = 0; static OPEN = 1; static CLOSED = 2;
      constructor(url) {
        this.url = url; this.readyState = 1; this.onerror = null;
        this._listeners = {};
        setTimeout(() => {
          this._emit('progress', { message: 'Reading your site…' });
          this._emit('complete', {
            counts: { caseStudies: 3, discoveryQuestions: 12, proofPoints: 5, productTruths: 4 },
            coverage: null
          });
        }, 10);
      }
      addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
      _emit(type, obj) {
        const evt = { data: JSON.stringify(obj) };
        (this._listeners[type] || []).forEach(fn => fn(evt));
      }
      close() { this.readyState = 2; }
    }
    window.EventSource = MockEventSource;
  })();
`;

const DRAFT_PLAYBOOK = {
  role: 'Solution Engineer',
  company: { name: 'Contoso', description: 'A data + AI platform.' },
  products: ['Fabric'],
  personas: ['CISO'],
  outcomes: ['Cut pipeline latency 60%'],
  differentiators: ['Native governance'],
  competitors: ['Snowflake'],
  proofPoints: ['40% cost cut at Acme'],
  competitorTraps: [{ competitor: 'Snowflake', question: '' }],
  source: 'draft'
};

test.describe('first-run onboarding flow', () => {
  test('walks welcome → provider → knowledge base → playbook → meeting', async ({ page }) => {
    // Provider is not yet configured; flips true the moment settings are saved.
    let setupDone = false;
    let putBody = null;

    await page.route('**/api/status', (r) => r.fulfill({ json: { setupComplete: setupDone } }));
    await page.route('**/api/settings', (r) => {
      if (r.request().method() === 'POST') { setupDone = true; return r.fulfill({ json: {} }); }
      return r.fulfill({ json: { configured: true } });
    });
    await page.route('**/api/settings/test', (r) => r.fulfill({ json: { valid: true } }));
    await page.route('**/api/onboarding/upload', (r) => r.fulfill({ json: { files: [] } }));
    await page.route('**/api/onboarding/start', (r) => r.fulfill({ json: { sseToken: 'test-token' } }));
    await page.route('**/api/playbook', (r) => {
      if (r.request().method() === 'PUT') {
        putBody = JSON.parse(r.request().postData() || '{}');
        return r.fulfill({ json: { ...putBody, source: 'edited' } });
      }
      return r.fulfill({ json: DRAFT_PLAYBOOK });
    });
    // Stubs the app shell needs once setup completes and we land on /session.
    await page.route('**/api/preferences', (r) =>
      r.fulfill({ json: { methodology: 'meddpicc', theme: 'light', coachingEnabled: true } }));
    await page.route('**/api/sessions', (r) => r.fulfill({ json: [] }));
    await page.route('**/api/onboarding/knowledge-base', (r) => r.fulfill({ json: { items: [] } }));

    await page.addInitScript(INIT_SCRIPT);

    // 0. Welcome to Clumo.
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Clumo' })).toBeVisible();
    await page.getByRole('button', { name: /get started/i }).click();

    // 1. Provider — bring your own key (OpenAI).
    await expect(page.getByRole('heading', { name: /connect your ai provider/i })).toBeVisible();
    await page.getByRole('button', { name: 'OpenAI', exact: true }).click();
    await page.getByPlaceholder(/sk-/i).fill('sk-test-key');
    await page.getByRole('button', { name: /test connection/i }).click();
    await page.getByRole('button', { name: /^Next$/ }).click();

    // 2. Knowledge base — about-you, skip the scan, add a source, generate.
    await expect(page.getByRole('heading', { name: /build your knowledge base/i })).toBeVisible();
    await expect(page.getByText(/tell Clumo who/i)).toBeVisible(); // personalisation framing
    await page.getByRole('button', { name: /^Next$/ }).click();
    await page.getByRole('button', { name: /skip scan and enter sources manually/i }).click();
    await page.getByPlaceholder('https://yourcompany.com/customers').fill('https://contoso.com/customers');
    await page.getByRole('button', { name: /generate knowledge base/i }).click();

    // KB generation completes (mock SSE), revealing the playbook hand-off.
    await expect(page.getByText(/knowledge base generated/i)).toBeVisible();
    await page.getByRole('button', { name: /refine your playbook/i }).click();

    // 3. Playbook — personalised summary + pre-filled fields from onboarding.
    await expect(page.getByRole('heading', { name: /refine your playbook/i })).toBeVisible();
    await expect(page.getByText(/You're a Solution Engineer at Contoso/i)).toBeVisible();
    await expect(page.getByPlaceholder('e.g. Solution Engineer')).toHaveValue('Solution Engineer');
    await expect(page.getByText('Step 3 of 3')).toBeVisible();

    // Fill a competitor trap so we can prove edits persist on the way out.
    await page.getByLabel('Trap question for Snowflake').fill('How do you govern models today?');

    // 4. Start meeting — saves the playbook, then lands on the live session page.
    await page.getByRole('button', { name: /save & start meeting/i }).click();
    await expect(page.getByRole('button', { name: /start listening/i }).first()).toBeVisible();

    expect(putBody).toBeTruthy();
    expect(putBody.competitorTraps).toEqual([
      { competitor: 'Snowflake', question: 'How do you govern models today?' }
    ]);
  });
});
