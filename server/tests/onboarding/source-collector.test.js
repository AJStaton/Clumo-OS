// Tests for onboarding/source-collector.js — type-routed bundling + coverage.
// Uses an injected fake page-fetcher and fake case-study extractor (no network/LLM).

const { collectSources, bundleText } = require('../../onboarding/source-collector');

// Build a fake page-fetcher whose fetch() returns canned pages by URL substring.
function fakeFetcher(pagesByMatch) {
  const telemetry = { pagesFetched: 0, sources: [] };
  return {
    fetch: async (url) => {
      telemetry.pagesFetched += 1;
      for (const [needle, page] of pagesByMatch) {
        if (url.includes(needle)) return { url, ok: true, confidence: 0.7, ...page };
      }
      return { url, ok: true, confidence: 0.6, mainText: 'Generic page content. '.repeat(20), summary: '', title: 'Page', links: [], jsonld: [], meta: {}, signals: { mainTextChars: 400 } };
    },
    close: async () => {},
    getTelemetry: () => telemetry
  };
}

function richPage(text, title) {
  return { mainText: text, summary: '', title, links: [], jsonld: [], meta: {}, signals: { mainTextChars: text.length } };
}

// Fake discovery: route pasted URLs into buckets without touching the network.
function fakeDiscover(buckets) {
  return async (_baseUrl, _pf, opts) => {
    const ps = (opts && opts.pastedSources) || {};
    const out = {
      case_study: (ps.caseStudies || []).map((url) => ({ url, category: 'case_study', individual: true, priority: 5 })).concat(buckets.case_study || []),
      blog: (ps.blog || []).map((url) => ({ url, category: 'blog', priority: 5 })).concat(buckets.blog || []),
      docs: (ps.docs || []).map((url) => ({ url, category: 'docs', priority: 5 })).concat(buckets.docs || []),
      product: buckets.product || []
    };
    return { buckets: out, telemetry: { strategies: {} } };
  };
}

describe('source-collector', () => {
  it('routes pages into per-type bundles and extracts case studies', async () => {
    const fetcher = fakeFetcher([
      ['/customers/acme', richPage('Acme cut costs 50% using the Platform. '.repeat(20), 'Acme story')],
      ['/blog', richPage('Research shows 467% ROI across deployments. '.repeat(20), 'ROI blog')],
      ['/docs', richPage('The platform is SOC 2 compliant with 99.9% uptime SLA. '.repeat(20), 'Security docs')],
      ['/platform', richPage('Our platform automates workflows end to end. '.repeat(20), 'Platform')]
    ]);

    const extractor = {
      extractCaseStudyFromContent: async (content, url) => [{
        company: 'Acme', headline: 'Acme cuts costs 50%', problem: 'High costs',
        solution: 'Platform', result: '50% reduction', link: url, triggers: ['costs']
      }],
      deduplicateCaseStudies: (arr) => arr
    };

    const sources = await collectSources('https://example.com', {
      pastedSources: {
        caseStudies: ['https://example.com/customers/acme'],
        blog: ['https://example.com/blog/roi-post'],
        docs: ['https://example.com/docs/security']
      },
      pageFetcher: fetcher,
      caseStudyExtractor: extractor,
      discover: fakeDiscover({ product: [{ url: 'https://example.com/platform', category: 'product', priority: 3 }] }),
      maxCaseStudies: 10
    });

    expect(sources.extractedCaseStudies.length).toBe(1);
    expect(sources.extractedCaseStudies[0].company).toBe('Acme');
    expect(sources.bundles.proof).toContain('ROI');
    expect(sources.bundles.productTruth).toContain('SOC 2');
    expect(sources.coverage.case_study.status).toBe('ok');
  });

  it('marks case_study coverage as missing and warns when none found', async () => {
    const fetcher = fakeFetcher([]);
    const extractor = { extractCaseStudyFromContent: async () => [], deduplicateCaseStudies: (a) => a };

    const sources = await collectSources('https://example.com', {
      pastedSources: {},
      pageFetcher: fetcher,
      caseStudyExtractor: extractor,
      discover: fakeDiscover({})
    });

    expect(sources.extractedCaseStudies.length).toBe(0);
    expect(sources.coverage.case_study.status).toBe('missing');
    expect(sources.coverage.case_study.warning).toMatch(/paste/i);
  });

  it('bundleText caps output length', () => {
    const pages = [{ ok: true, mainText: 'x'.repeat(100000), title: 'big', url: 'u' }];
    const out = bundleText(pages, 5000);
    expect(out.length).toBeLessThanOrEqual(5000);
  });
});
