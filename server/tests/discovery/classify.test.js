// Tests for discovery/classify.js — URL classification + ranking (pure).

const { classifyUrl, classifyAndRank, normalizeForDedupe } = require('../../discovery/classify');

describe('classify.classifyUrl', () => {
  it('classifies individual case-study pages', () => {
    expect(classifyUrl('https://x.com/customers/strabag').category).toBe('case_study');
    expect(classifyUrl('https://x.com/customer-story/dhl').category).toBe('case_study');
    expect(classifyUrl('https://x.com/case-studies/salesforce-success').category).toBe('case_study');
    expect(classifyUrl('https://x.com/customers/strabag').individual).toBe(true);
  });

  it('distinguishes listing pages from individual pages', () => {
    const listing = classifyUrl('https://x.com/customers');
    expect(listing.category).toBe('case_study');
    expect(listing.individual).toBe(false);
  });

  it('classifies blog, docs and product pages', () => {
    expect(classifyUrl('https://x.com/blog/467-roi').category).toBe('blog');
    expect(classifyUrl('https://x.com/resources/skills').category).toBe('blog');
    expect(classifyUrl('https://x.com/docs/api').category).toBe('docs');
    expect(classifyUrl('https://x.com/platform/').category).toBe('product');
    expect(classifyUrl('https://x.com/security').category).toBe('product');
  });

  it('allows doc subdomains relative to a base host', () => {
    const c = classifyUrl('https://docs.cloud.google.com/agent', { baseHost: 'cloud.google.com' });
    expect(c.category).toBe('docs');
  });

  it('skips assets, auth and legal pages', () => {
    expect(classifyUrl('https://x.com/logo.png')).toBeNull();
    expect(classifyUrl('https://x.com/login')).toBeNull();
    expect(classifyUrl('https://x.com/privacy')).toBeNull();
    expect(classifyUrl('mailto:a@b.com')).toBeNull();
  });

  it('returns null for unclassifiable pages', () => {
    expect(classifyUrl('https://x.com/random-page')).toBeNull();
  });
});

describe('classify.normalizeForDedupe', () => {
  it('strips tracking params, hash and trailing slash, lowercases', () => {
    expect(normalizeForDedupe('https://X.com/Customers/Acme/?utm_source=g#top'))
      .toBe('https://x.com/customers/acme');
  });
});

describe('classify.classifyAndRank', () => {
  it('buckets, dedupes and caps per-type budget; individual pages rank first', () => {
    const urls = [
      'https://x.com/customers',                 // listing (priority 2)
      'https://x.com/customers/acme',            // individual (priority 3)
      'https://x.com/customers/acme?utm=1',      // dup of acme
      'https://x.com/blog/a', 'https://x.com/blog/b',
      'https://x.com/platform/', 'https://x.com/login'
    ];
    const buckets = classifyAndRank(urls, { baseHost: 'x.com', perTypeBudget: 5 });
    expect(buckets.case_study.length).toBe(2); // acme + listing, dup removed
    expect(buckets.case_study[0].url).toMatch(/\/customers\/acme/); // individual ranked first
    expect(buckets.blog.length).toBe(2);
    expect(buckets.product.length).toBe(1);
  });

  it('respects the per-type budget cap', () => {
    const urls = Array.from({ length: 30 }, (_, i) => `https://x.com/blog/post-${i}`);
    const buckets = classifyAndRank(urls, { baseHost: 'x.com', perTypeBudget: 10 });
    expect(buckets.blog.length).toBe(10);
  });
});
