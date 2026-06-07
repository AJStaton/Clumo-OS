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
});
