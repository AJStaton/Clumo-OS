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

// Generic (host-agnostic) path keywords that mark a URL as a customer story / case study. Used to
// pull story links out of JSON API responses on SPA listing pages. classifyUrl does the final
// say; this is just a permissive first filter so we don't import every URL a JSON blob contains.
const STORY_PATH_RE = /\/(customer-stories|customers?|case-studies|case-study|success-stories|stories|story|success|references?)\b/i;

// "Load more / Show more / Next" style controls, matched by visible text. Generic across sites.
const LOAD_MORE_RE = /\b(load|show|view|see)\s+more\b|\bmore\s+(stories|customers|results|case)\b|\bnext\b|\bshow\s+all\b/i;

// Recursively pull URL-ish strings out of a parsed JSON value. Resolves relative hrefs against the
// listing URL and keeps only ones whose path looks like an individual story/case study.
function extractStoryUrlsFromJson(value, baseUrl, out, depth = 0) {
  if (depth > 8 || out.size >= 400) return;
  if (typeof value === 'string') {
    const s = value.trim();
    if (s.length < 2 || s.length > 600) return;
    // Absolute URL, or a root-relative/href-like path.
    const looksUrl = /^https?:\/\//i.test(s) || /^\/[^\s]+/.test(s);
    if (!looksUrl) return;
    try {
      const u = new URL(s, baseUrl);
      if (STORY_PATH_RE.test(u.pathname)) out.add(u.href);
    } catch { /* not a resolvable URL */ }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) extractStoryUrlsFromJson(v, baseUrl, out, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) extractStoryUrlsFromJson(value[k], baseUrl, out, depth + 1);
  }
}

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
    waitUntil = 'networkidle',
    // Bounds for the listing interaction loop (scroll / load-more). Kept tight for runtime.
    listingMaxRounds = 12,
    listingStableRounds = 2,
    listingMaxMs = 18000,
    listingActionSettleMs = 800,
    // Optional injected Playwright module (tests pass a fake browser engine here). Defaults to the
    // real Playwright resolved lazily so production paths are unchanged.
    playwright = null
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

    const pw = playwright || loadPlaywright();
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

  // Drive a listing page to surface as many story tiles as possible: scroll to the bottom and
  // click generic "load more / next" controls until no new links appear for a few rounds, a hard
  // round/time budget is hit, or the page stops growing. Fully host-agnostic. Best-effort — any
  // step that throws is swallowed so a partial harvest still returns.
  async function driveListing(page) {
    const started = Date.now();
    let stable = 0;
    let lastCount = -1;
    // Accumulate every anchor href seen across rounds. Pagination that REPLACES the list (page 1
    // -> page 2) would otherwise lose earlier links, since we only extract the final DOM. Bounded
    // by the same round/time budget as the loop, so this can't grow unbounded.
    const accumulatedHrefs = new Set();
    const harvestHrefs = async () => {
      try {
        const hrefs = await page.$$eval('a[href]', (els) => els.map((e) => e.href));
        for (const h of hrefs) { if (h && accumulatedHrefs.size < 2000) accumulatedHrefs.add(h); }
        return hrefs.length;
      } catch { return 0; }
    };
    for (let round = 0; round < listingMaxRounds; round++) {
      if (Date.now() - started > listingMaxMs) break;
      const count = await harvestHrefs();
      if (count <= lastCount) {
        stable += 1;
        if (stable >= listingStableRounds) break;
      } else {
        stable = 0;
        lastCount = count;
      }
      // Scroll to the bottom to trigger infinite-scroll / lazy loading.
      try { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); } catch { /* ignore */ }
      // Click the first visible "load more / next" style control, if any.
      try {
        const clicked = await page.evaluate((reSrc) => {
          const re = new RegExp(reSrc, 'i');
          const nodes = Array.from(document.querySelectorAll('button, a, [role="button"]'));
          for (const el of nodes) {
            const txt = (el.innerText || el.textContent || '').trim();
            if (txt && txt.length < 40 && re.test(txt)) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) { el.click(); return true; }
            }
          }
          return false;
        }, LOAD_MORE_RE.source);
        if (clicked) { /* allow content to load below */ }
      } catch { /* ignore */ }
      try { await page.waitForTimeout(listingActionSettleMs); } catch { /* ignore */ }
    }
    return {
      incomplete: stable < listingStableRounds && (Date.now() - started) >= listingMaxMs,
      hrefs: [...accumulatedHrefs]
    };
  }

  // Render a URL and return a normalized page object (renderedVia: 'headless'),
  // or null if headless is unavailable / capped / errored for this URL.
  //   opts.listing  -> drive the scroll/load-more loop and sniff JSON responses for story URLs.
  async function fetch(url, opts = {}) {
    const { listing = false } = opts;
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
    const sniffed = new Set();
    const pending = [];
    try {
      context = await b.newContext({ userAgent: USER_AGENT });
      const page = await context.newPage();

      if (listing) {
        // Sniff JSON network responses for story/case-study URLs (host-agnostic SPA fallback).
        page.on('response', (response) => {
          try {
            const ct = (response.headers()['content-type'] || '').toLowerCase();
            if (!ct.includes('json')) return;
            const task = response.text().then((body) => {
              if (!body || body.length > 3_000_000) return;
              let parsed;
              try { parsed = JSON.parse(body); } catch { return; }
              extractStoryUrlsFromJson(parsed, url, sniffed);
            }).catch(() => {});
            pending.push(task);
          } catch { /* ignore */ }
        });
      }

      await page.goto(url, { waitUntil, timeout: navTimeout });
      if (settleMs > 0) await page.waitForTimeout(settleMs);

      let listingIncomplete = false;
      let accumulatedHrefs = [];
      if (listing) {
        const driven = await driveListing(page);
        listingIncomplete = driven.incomplete;
        accumulatedHrefs = driven.hrefs || [];
        try { await Promise.race([Promise.allSettled(pending), page.waitForTimeout(1500)]); } catch { /* ignore */ }
      }

      const html = await page.content();
      const extracted = extractFromHtml(html, url);
      // Merge anchors harvested across listing rounds (covers list-replacing pagination) with the
      // final-DOM links, deduped. Only relevant for listing renders.
      let links = extracted.links || [];
      if (listing && accumulatedHrefs.length) {
        links = [...new Set([...links, ...accumulatedHrefs])];
      }
      const jsonLinks = listing ? [...sniffed] : [];
      return { ...extracted, links, ok: true, status: 200, html, renderedVia: 'headless', jsonLinks, listingIncomplete };
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

module.exports = { createHeadlessFetcher, loadPlaywright, extractStoryUrlsFromJson };
