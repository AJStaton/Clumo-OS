// Headless fetcher: Playwright-rendered fetch for JS-heavy pages.
// Last-resort tier — only invoked by page-fetcher when static returns a shell.
//
// Design constraints (see AGENTS.md + plan):
// - Lazy: the browser only launches on first real need, so static-only runs pay nothing.
// - Single browser per run, reused across pages; closed explicitly at end of run.
// - Capability check: if Playwright or its Chromium is unavailable (e.g. a packaged build
//   shipped without the browser), we degrade gracefully — onboarding still completes on the
//   static path and the affected pages are flagged, never hard-failed.
// - One launch failure disables headless for the whole run (no retry loops).

const { extractFromHtml } = require('./extract');

const USER_AGENT = 'Mozilla/5.0 (compatible; Clumo/1.0; +https://clumo.co)';

// Resolve the Playwright module without throwing if it isn't installed.
function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    try {
      return require('playwright-core');
    } catch {
      return null;
    }
  }
}

function createHeadlessFetcher(options = {}) {
  const {
    maxRenders = 20,
    navTimeout = 30000,
    settleMs = 1200,
    waitUntil = 'networkidle'
  } = options;

  let browser = null;
  let disabled = false;      // set true once we know headless can't work this run
  let launchAttempted = false;
  let rendersUsed = 0;
  const warnings = [];

  async function ensureBrowser() {
    if (disabled) return null;
    if (browser) return browser;
    if (launchAttempted) return browser; // already tried and failed
    launchAttempted = true;

    const pw = loadPlaywright();
    if (!pw || !pw.chromium) {
      disabled = true;
      warnings.push('Headless browser engine not available (Playwright not installed).');
      console.warn('[HeadlessFetcher] Playwright unavailable — degrading to static-only.');
      return null;
    }
    try {
      browser = await pw.chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
      });
      console.log('[HeadlessFetcher] Chromium launched for headless rendering.');
      return browser;
    } catch (err) {
      disabled = true;
      warnings.push('Headless browser failed to launch; JS-rendered pages were skipped.');
      console.warn(`[HeadlessFetcher] Launch failed — degrading to static-only: ${err.message}`);
      return null;
    }
  }

  // Render a URL and return a normalized page object (renderedVia: 'headless'),
  // or null if headless is unavailable / capped / errored for this URL.
  async function fetch(url) {
    if (disabled) return null;
    if (rendersUsed >= maxRenders) {
      if (!warnings.some(w => w.includes('render limit'))) {
        warnings.push(`Headless render limit (${maxRenders}) reached; some pages used static content only.`);
      }
      return null;
    }
    const b = await ensureBrowser();
    if (!b) return null;

    rendersUsed += 1;
    let context = null;
    try {
      context = await b.newContext({ userAgent: USER_AGENT });
      const page = await context.newPage();
      await page.goto(url, { waitUntil, timeout: navTimeout });
      if (settleMs > 0) await page.waitForTimeout(settleMs);
      const html = await page.content();
      const extracted = extractFromHtml(html, url);
      return { ...extracted, ok: true, status: 200, html, renderedVia: 'headless' };
    } catch (err) {
      console.warn(`[HeadlessFetcher] Render failed for ${url}: ${err.message}`);
      return null;
    } finally {
      if (context) {
        try { await context.close(); } catch { /* ignore */ }
      }
    }
  }

  async function close() {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
      browser = null;
    }
  }

  return {
    fetch,
    close,
    isDisabled: () => disabled,
    getWarnings: () => [...warnings],
    getRendersUsed: () => rendersUsed
  };
}

module.exports = { createHeadlessFetcher, loadPlaywright };
