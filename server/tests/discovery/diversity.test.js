// Tests for discovery diversity + classify hygiene (the SAP-flood fix).

const { diversifyCaseStudies } = require('../../discovery/url-discovery');
const { classifyUrl, classifyAndRank, isNarrowCaseStudyListing, localeOf } = require('../../discovery/classify');

describe('classify hygiene', () => {
  it('flags narrow vertical case-study listings', () => {
    expect(isNarrowCaseStudyListing('/solutions/sap/customers')).toBe(true);
    expect(isNarrowCaseStudyListing('/industries/banking/case-studies')).toBe(true);
    expect(isNarrowCaseStudyListing('/customers')).toBe(false);
    expect(isNarrowCaseStudyListing('/resources/customer-stories')).toBe(false);
  });

  it('classifies a narrow listing as a low-priority case_study', () => {
    const c = classifyUrl('https://azure.microsoft.com/en-us/solutions/sap/customers');
    expect(c.category).toBe('case_study');
    expect(c.narrow).toBe(true);
    expect(c.priority).toBe(1);
  });

  it('detects locale prefixes', () => {
    expect(localeOf('/en-gb/resources/customer-stories')).toBe('en-gb');
    expect(localeOf('/resources/customer-stories')).toBeNull();
  });

  it('classifies a customer-stories search/browse page as a filtered listing, not a story', () => {
    const c = classifyUrl('https://www.microsoft.com/en-gb/customers/search?filters=product:azure,industry:technology');
    expect(c.category).toBe('case_study');
    expect(c.individual).toBe(false);
    expect(c.search).toBe(true);
  });

  it('keeps individual story slugs individual even when they start with a browse keyword', () => {
    for (const u of [
      'https://x.com/customers/allbirds',
      'https://x.com/customers/searchspring',
      'https://x.com/customers/index-exchange',
      'https://x.com/customers/story/26648-sight-machine-foundry'
    ]) {
      const c = classifyUrl(u, { baseHost: 'x.com' });
      expect(c.category).toBe('case_study');
      expect(c.individual).toBe(true);
      expect(c.search).toBeFalsy();
    }
  });

  it('does not treat utility/nav segments under a customers section as individual stories', () => {
    for (const u of [
      'https://www.microsoft.com/customers/locale',
      'https://x.com/customers/region',
      'https://x.com/customers/login',
      'https://x.com/case-studies/overview'
    ]) {
      const c = classifyUrl(u, { baseHost: 'x.com' });
      // Either dropped or classified as a non-individual listing/other — never an individual story.
      if (c && c.category === 'case_study') {
        expect(c.individual).toBe(false);
      } else {
        expect(c === null || c.category !== 'case_study').toBe(true);
      }
    }
  });

  it('treats a filtered customer-listing query string as an intentional browse', () => {
    const c = classifyUrl('https://beamery.com/customers?industry=technology', { baseHost: 'beamery.com' });
    expect(c.category).toBe('case_study');
    expect(c.individual).toBe(false);
    expect(c.search).toBe(true);
  });

  it('does not reclassify an individual story that merely carries a query param', () => {
    const c = classifyUrl('https://x.com/customers/acme?ref=newsletter&industry=finance', { baseHost: 'x.com' });
    expect(c.category).toBe('case_study');
    expect(c.individual).toBe(true);
    expect(c.search).toBeFalsy();
  });

  it('collapses locale-variant duplicates, preferring the user locale', () => {
    const urls = [
      'https://azure.microsoft.com/en-us/resources/customer-stories',
      'https://azure.microsoft.com/cs-cz/resources/customer-stories',
      'https://azure.microsoft.com/en-gb/resources/customer-stories'
    ];
    const buckets = classifyAndRank(urls, { baseHost: 'azure.microsoft.com', userLocale: 'en-gb' });
    expect(buckets.case_study.length).toBe(1);
    expect(buckets.case_study[0].url).toContain('/en-gb/');
  });
});

describe('diversifyCaseStudies', () => {
  it('caps a single narrow listing so it cannot flood the bucket', () => {
    const sapLinks = Array.from({ length: 40 }, (_, i) => ({ url: `https://x.com/customers/story/sap-${i}` }));
    const masterLinks = Array.from({ length: 40 }, (_, i) => ({ url: `https://x.com/customers/story/general-${i}` }));
    const out = diversifyCaseStudies({
      direct: [],
      listings: [
        { url: 'https://x.com/resources/customer-stories', narrow: false, links: masterLinks },
        { url: 'https://x.com/solutions/sap/customers', narrow: true, links: sapLinks }
      ],
      budget: 50
    });
    const sapCount = out.filter((c) => c.url.includes('sap-')).length;
    const generalCount = out.filter((c) => c.url.includes('general-')).length;
    expect(sapCount).toBeLessThanOrEqual(5);          // narrow cap
    expect(generalCount).toBeGreaterThan(sapCount);   // master library wins
  });

  it('keeps direct individual hits first', () => {
    const out = diversifyCaseStudies({
      direct: [{ url: 'https://x.com/customers/story/priority-one' }],
      listings: [{ url: 'https://x.com/customers', narrow: false, links: [{ url: 'https://x.com/customers/story/other' }] }],
      budget: 10
    });
    expect(out[0].url).toContain('priority-one');
  });

  it('uses the whole budget when there is only one listing', () => {
    const links = Array.from({ length: 30 }, (_, i) => ({ url: `https://x.com/customers/story/s-${i}` }));
    const out = diversifyCaseStudies({ direct: [], listings: [{ url: 'https://x.com/customers', narrow: false, links }], budget: 20 });
    expect(out.length).toBeGreaterThanOrEqual(20);
  });

  it('selects pasted listing-harvested links before the adapter firehose', () => {
    const pastedLinks = Array.from({ length: 5 }, (_, i) => ({ url: `https://x.com/customers/story/focus-${i}`, fromPasted: true, trusted: true }));
    const adapterDirect = Array.from({ length: 50 }, (_, i) => ({ url: `https://x.com/customers/story/sap-${i}`, adapter: true, individual: true }));
    const out = diversifyCaseStudies({
      pastedListings: [{ url: 'https://x.com/customers/search', narrow: false, trusted: true, links: pastedLinks }],
      adapterDirect,
      budget: 5
    });
    expect(out.length).toBe(5);
    expect(out.every((c) => c.url.includes('focus-'))).toBe(true);
  });

  it('backfills from adapter/discovered stories when pasted expansion yields nothing', () => {
    const adapterDirect = [
      { url: 'https://x.com/customers/story/a', adapter: true },
      { url: 'https://x.com/customers/story/b', adapter: true }
    ];
    const out = diversifyCaseStudies({
      pastedListings: [{ url: 'https://x.com/customers/search', narrow: false, trusted: true, links: [] }],
      adapterDirect,
      budget: 10
    });
    const urls = out.map((c) => c.url);
    expect(urls).toContain('https://x.com/customers/story/a');
    expect(urls).toContain('https://x.com/customers/story/b');
    // The empty pasted listing URL itself is also retained as a last-resort fallback.
    expect(urls).toContain('https://x.com/customers/search');
  });

  it('does not cap pasted (intentionally narrow) listings the way it caps discovered narrow ones', () => {
    const links = Array.from({ length: 20 }, (_, i) => ({ url: `https://x.com/customers/story/p-${i}`, trusted: true }));
    const out = diversifyCaseStudies({
      pastedListings: [{ url: 'https://x.com/solutions/sap/customers', narrow: true, trusted: true, links }],
      budget: 20
    });
    expect(out.length).toBeGreaterThan(5); // a discovered narrow listing would be capped at 5
  });
});
