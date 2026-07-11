// Tests for fetch/headless-fetcher.js — JSON story-URL extraction + listing interaction loop.
// The Playwright engine is injected as a fake (no real browser, no network, no module mocking).

const { createHeadlessFetcher, extractStoryUrlsFromJson } = require('../../fetch/headless-fetcher');

describe('extractStoryUrlsFromJson', () => {
  it('pulls story-like URLs out of nested JSON and resolves relative hrefs', () => {
    const out = new Set();
    const json = {
      results: [
        { url: '/en/customers/story/123-acme', title: 'Acme' },
        { url: 'https://x.com/case-studies/contoso', title: 'Contoso' },
        { nested: { href: '/customer-stories/fabrikam' } }
      ],
      pageInfo: { next: '/customers/search?page=2' }
    };
    extractStoryUrlsFromJson(json, 'https://x.com/customers/search', out, 0);
    const urls = [...out];
    expect(urls).toContain('https://x.com/en/customers/story/123-acme');
    expect(urls).toContain('https://x.com/case-studies/contoso');
    expect(urls).toContain('https://x.com/customer-stories/fabrikam');
  });

  it('ignores non-story URLs and non-URL strings', () => {
    const out = new Set();
    extractStoryUrlsFromJson({
      logo: 'https://x.com/static/logo.png',
      blurb: 'this is just prose, not a url',
      pricing: '/pricing'
    }, 'https://x.com', out, 0);
    expect(out.size).toBe(0);
  });

  it('is bounded against deep / huge structures', () => {
    const out = new Set();
    // Build a deeply nested object — depth guard should stop recursion without throwing.
    let deep = { url: '/customers/story/deep' };
    for (let i = 0; i < 50; i++) deep = { child: deep };
    expect(() => extractStoryUrlsFromJson(deep, 'https://x.com', out, 0)).not.toThrow();
  });
});

// Minimal fake Playwright page that records interaction and serves canned content / JSON responses.
function makeFakePage({ html, anchors = [], jsonResponses = [] }) {
  const responseHandlers = [];
  const page = {
    scrolls: 0,
    clicks: 0,
    timeouts: 0,
    on(evt, handler) { if (evt === 'response') responseHandlers.push(handler); },
    async goto() {
      // Emit the canned JSON network responses once navigation starts.
      for (const r of jsonResponses) {
        for (const h of responseHandlers) h(r);
      }
    },
    async waitForTimeout() { this.timeouts += 1; },
    async content() { return html; },
    async $$eval(sel, fn) {
      // The harvest maps anchors to their hrefs; serve the canned anchor set as {href} nodes.
      return fn(anchors.map((href) => ({ href })));
    },
    async evaluate(fn) {
      const src = fn.toString();
      if (src.includes('scrollTo')) { this.scrolls += 1; return undefined; }
      // The load-more click probe — pretend there's no button.
      this.clicks += 0;
      return false;
    }
  };
  return page;
}

function makeFakePlaywright(page) {
  const context = { newPage: async () => page, close: async () => {} };
  const browser = { newContext: async () => context, close: async () => {} };
  return { chromium: { launch: async () => browser } };
}

function jsonResponse(obj) {
  return {
    headers: () => ({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(obj)
  };
}

describe('headless-fetcher listing mode', () => {
  it('drives the listing loop and returns JSON-sniffed story links', async () => {
    const html = '<html><body><main><h1>Customers</h1><p>Our customer stories.</p></main>'
      + '<a href="https://x.com/customers/story/dom-one">DOM One</a></body></html>';
    const page = makeFakePage({
      html,
      anchors: ['https://x.com/customers/story/acc-one', 'https://x.com/about'],
      jsonResponses: [jsonResponse({ items: [{ url: '/customers/story/json-acme' }] })]
    });
    const hf = createHeadlessFetcher({
      playwright: makeFakePlaywright(page),
      settleMs: 0,
      listingActionSettleMs: 0
    });
    const r = await hf.fetch('https://x.com/customers/search', { listing: true });
    expect(r.ok).toBe(true);
    expect(r.renderedVia).toBe('headless');
    expect(r.jsonLinks).toContain('https://x.com/customers/story/json-acme');
    // DOM-extracted link AND anchors accumulated across listing rounds are both present.
    expect(r.links).toContain('https://x.com/customers/story/dom-one');
    expect(r.links).toContain('https://x.com/customers/story/acc-one');
    expect(page.scrolls).toBeGreaterThan(0); // listing loop actually ran
    await hf.close();
  });

  it('does not sniff JSON or drive the loop for a non-listing render', async () => {
    const page = makeFakePage({
      html: '<html><body><main>Some product page text here.</main></body></html>',
      anchors: ['https://x.com/customers/story/should-not-accumulate'],
      jsonResponses: [jsonResponse({ items: [{ url: '/customers/story/should-not-appear' }] })]
    });
    const hf = createHeadlessFetcher({ playwright: makeFakePlaywright(page), settleMs: 0 });
    const r = await hf.fetch('https://x.com/product', { listing: false });
    expect(r.ok).toBe(true);
    expect(r.jsonLinks).toEqual([]);
    expect(page.scrolls).toBe(0);
    await hf.close();
  });

  it('degrades gracefully when Playwright is unavailable', async () => {
    const hf = createHeadlessFetcher({ playwright: { chromium: null } });
    const r = await hf.fetch('https://x.com/customers', { listing: true });
    expect(r).toBeNull();
    expect(hf.isDisabled()).toBe(true);
    expect(hf.getWarnings().join(' ')).toMatch(/not available|not installed/i);
  });
});
