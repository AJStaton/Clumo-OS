// Tests for fetch/page-fetcher.js — tiered escalation logic.
// Static + headless fetchers are injected as fakes (no network/browser, no module mocking).

const { createPageFetcher } = require('../../fetch/page-fetcher');

function shellPage(url) {
  return {
    url, ok: true, status: 200, renderedVia: 'static',
    mainText: '', summary: '', title: 'Loading', links: [], jsonld: [], meta: {},
    signals: { mainTextChars: 40, boilerplateRatio: 0.95, hasNextData: true, jsonldCount: 0, hasOgDescription: false }
  };
}
function richPage(url, via = 'static') {
  return {
    url, ok: true, status: 200, renderedVia: via,
    mainText: 'This customer case study shows a 50% ROI result and outcome. '.repeat(40),
    summary: '', title: 'Acme case study', links: ['https://x.com/a'], jsonld: [], meta: {},
    signals: { mainTextChars: 2400, boilerplateRatio: 0.2, hasNextData: false, jsonldCount: 1, hasOgDescription: true }
  };
}

// A fake headless fetcher with the same surface page-fetcher expects.
function fakeHeadless(impl) {
  let calls = 0;
  return {
    fetch: async (url) => { calls += 1; return impl(url); },
    close: async () => {},
    isDisabled: () => false,
    getWarnings: () => [],
    getRendersUsed: () => calls,
    get calls() { return calls; }
  };
}

describe('page-fetcher escalation', () => {
  it('returns static result without escalating when content is rich', async () => {
    const headless = fakeHeadless(async () => null);
    const pf = createPageFetcher({
      fetchStaticFn: async (u) => richPage(u),
      headlessFetcher: headless
    });
    const r = await pf.fetch('https://x.com/customers/acme', { expectedType: 'case_study' });
    expect(r.renderedVia).toBe('static');
    expect(headless.calls).toBe(0);
  });

  it('escalates to headless when static returns a low-confidence shell', async () => {
    const headless = fakeHeadless(async (u) => richPage(u, 'headless'));
    const pf = createPageFetcher({
      fetchStaticFn: async (u) => shellPage(u),
      headlessFetcher: headless
    });
    const r = await pf.fetch('https://x.com/customers/acme', { expectedType: 'case_study' });
    expect(headless.calls).toBe(1);
    expect(r.renderedVia).toBe('headless');
    expect(r.signals.mainTextChars).toBeGreaterThan(1000);
  });

  it('keeps static content if headless yields nothing better', async () => {
    const headless = fakeHeadless(async () => null);
    const pf = createPageFetcher({
      fetchStaticFn: async (u) => shellPage(u),
      headlessFetcher: headless
    });
    const r = await pf.fetch('https://x.com/customers/acme', { expectedType: 'case_study' });
    expect(headless.calls).toBe(1);
    expect(r.renderedVia).toBe('static');
    expect(r.confidence).toBeLessThan(0.35);
  });

  it('caches by normalized url and does not double-fetch', async () => {
    let staticCalls = 0;
    const pf = createPageFetcher({
      fetchStaticFn: async (u) => { staticCalls += 1; return richPage(u); },
      headlessFetcher: fakeHeadless(async () => null)
    });
    await pf.fetch('https://x.com/product', { expectedType: 'product_truth' });
    await pf.fetch('https://x.com/product/?utm_source=g#x', { expectedType: 'product_truth' });
    expect(staticCalls).toBe(1);
  });

  it('honors forceHeadless by skipping the static fetch', async () => {
    let staticCalls = 0;
    const headless = fakeHeadless(async (u) => richPage(u, 'headless'));
    const pf = createPageFetcher({
      fetchStaticFn: async (u) => { staticCalls += 1; return richPage(u); },
      headlessFetcher: headless
    });
    const r = await pf.fetch('https://x.com/customers', { expectedType: 'case_study', forceHeadless: true });
    expect(staticCalls).toBe(0);
    expect(headless.calls).toBe(1);
    expect(r.renderedVia).toBe('headless');
  });

  it('reports telemetry with per-source confidence', async () => {
    const pf = createPageFetcher({
      fetchStaticFn: async (u) => richPage(u),
      headlessFetcher: fakeHeadless(async () => null)
    });
    await pf.fetch('https://x.com/customers/acme', { expectedType: 'case_study' });
    const t = pf.getTelemetry();
    expect(t.pagesFetched).toBe(1);
    expect(t.sources[0]).toMatchObject({ renderedVia: 'static' });
    expect(t.sources[0].confidence).toBeGreaterThan(0);
  });

  it('forceHeadless re-renders a page previously cached as static', async () => {
    // A medium static page (not a shell, so it does NOT auto-escalate) — models a JS
    // listing like Beamery whose static HTML has some text but lacks the rendered tiles.
    const mediumPage = (url) => ({
      url, ok: true, status: 200, renderedVia: 'static',
      mainText: 'Customers using our platform. '.repeat(30), summary: '', title: 'Customers', links: [], jsonld: [], meta: {},
      signals: { mainTextChars: 900, boilerplateRatio: 0.3, hasNextData: false, jsonldCount: 0, hasOgDescription: false }
    });
    const headless = fakeHeadless(async (u) => richPage(u, 'headless'));
    const pf = createPageFetcher({
      fetchStaticFn: async (u) => mediumPage(u),
      headlessFetcher: headless
    });
    // First touch: a static fetch caches the listing during anchor discovery.
    const first = await pf.fetch('https://x.com/customers', { expectedType: null });
    expect(first.renderedVia).toBe('static');
    expect(headless.calls).toBe(0);
    // Listing expansion forces headless — must NOT return the cached static page.
    const r = await pf.fetch('https://x.com/customers', { expectedType: 'case_study', forceHeadless: true });
    expect(headless.calls).toBe(1);
    expect(r.renderedVia).toBe('headless');
  });

  it('forceHeadless falls back to cached static when render yields nothing', async () => {
    const headless = fakeHeadless(async () => null);   // headless unavailable
    const pf = createPageFetcher({
      fetchStaticFn: async (u) => richPage(u),          // good static content cached
      headlessFetcher: headless
    });
    await pf.fetch('https://x.com/customers', { expectedType: 'case_study' });
    const r = await pf.fetch('https://x.com/customers', { expectedType: 'case_study', forceHeadless: true });
    expect(r.ok).toBe(true);
    expect(r.renderedVia).toBe('static');
    expect(r.signals.mainTextChars).toBeGreaterThan(1000);
  });

  it('prefers a rendered listing that yields links even when its text is thinner', async () => {
    // A listing whose rendered tiles are links, but whose extracted main text is thin —
    // for a forced (listing) render we keep it because the links are the point of expanding.
    const thinLinksPage = (url) => ({
      url, ok: true, status: 200, renderedVia: 'headless',
      mainText: 'Customers', summary: '', title: 'Customers',
      links: ['https://x.com/customers/story/a', 'https://x.com/customers/story/b'],
      jsonLinks: ['https://x.com/customers/story/c'], jsonld: [], meta: {},
      signals: { mainTextChars: 60, boilerplateRatio: 0.3, hasNextData: false, jsonldCount: 0, hasOgDescription: false }
    });
    const mediumPage = (url) => ({
      url, ok: true, status: 200, renderedVia: 'static',
      mainText: 'Customers using our platform. '.repeat(30), summary: '', title: 'Customers', links: [], jsonld: [], meta: {},
      signals: { mainTextChars: 900, boilerplateRatio: 0.3, hasNextData: false, jsonldCount: 0, hasOgDescription: false }
    });
    const headless = fakeHeadless(async (u) => thinLinksPage(u));
    const pf = createPageFetcher({
      fetchStaticFn: async (u) => mediumPage(u),
      headlessFetcher: headless
    });
    await pf.fetch('https://x.com/customers', { expectedType: null });            // cache static
    const r = await pf.fetch('https://x.com/customers', { expectedType: 'case_study', forceHeadless: true });
    expect(r.renderedVia).toBe('headless');
    expect(r.links.length).toBe(2);
    expect(r.jsonLinks).toEqual(['https://x.com/customers/story/c']);
  });

  it('threads jsonLinks (defaulting to []) onto the final result', async () => {
    const pf = createPageFetcher({
      fetchStaticFn: async (u) => richPage(u),
      headlessFetcher: fakeHeadless(async () => null)
    });
    const r = await pf.fetch('https://x.com/product', { expectedType: 'product_truth' });
    expect(r.jsonLinks).toEqual([]);
  });
});
