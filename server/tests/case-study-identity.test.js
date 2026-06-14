const { caseStudyKey, normalizeStoryUrl } = require('../case-study-identity');

describe('case-study identity', () => {
  describe('normalizeStoryUrl', () => {
    it('collapses locale variants of the same story', () => {
      const a = normalizeStoryUrl('https://www.microsoft.com/en-gb/customers/story/123-ey-azure');
      const b = normalizeStoryUrl('https://www.microsoft.com/en-us/customers/story/123-ey-azure');
      expect(a).toBe(b);
    });

    it('strips tracking query strings and trailing slashes', () => {
      const a = normalizeStoryUrl('https://acme.com/customers/story/x?utm_source=foo');
      const b = normalizeStoryUrl('https://acme.com/customers/story/x/');
      expect(a).toBe(b);
    });

    it('keeps distinct story paths distinct', () => {
      const a = normalizeStoryUrl('https://www.microsoft.com/en/customers/story/1-ey');
      const b = normalizeStoryUrl('https://www.microsoft.com/en/customers/story/2-ey');
      expect(a).not.toBe(b);
    });

    it('does not strip non-locale leading segments', () => {
      // "customers" is not a locale, so it must survive.
      expect(normalizeStoryUrl('https://acme.com/customers/story/x')).toBe('acme.com/customers/story/x');
    });
  });

  describe('caseStudyKey', () => {
    it('treats two distinct stories from the same company as different', () => {
      const a = { company: 'EY', headline: 'EY cuts workload 90%', link: 'https://m.com/en/customers/story/1-ey' };
      const b = { company: 'EY', headline: 'EY boosts fraud detection', link: 'https://m.com/en/customers/story/2-ey' };
      expect(caseStudyKey(a)).not.toBe(caseStudyKey(b));
    });

    it('treats the same story across locales as identical', () => {
      const a = { company: 'EY', link: 'https://m.com/en-gb/customers/story/1-ey' };
      const b = { company: 'EY', link: 'https://m.com/en-us/customers/story/1-ey' };
      expect(caseStudyKey(a)).toBe(caseStudyKey(b));
    });

    it('falls back to company + headline when there is no link', () => {
      const a = { company: 'EY', headline: 'Story one' };
      const b = { company: 'EY', headline: 'Story two' };
      const c = { company: 'EY', headline: 'Story one' };
      expect(caseStudyKey(a)).not.toBe(caseStudyKey(b));
      expect(caseStudyKey(a)).toBe(caseStudyKey(c));
    });
  });
});

describe('HybridWebsiteScraper.deduplicateCaseStudies', () => {
  const HybridWebsiteScraper = require('../hybrid-website-scraper');
  const scraper = new HybridWebsiteScraper(null);

  it('keeps multiple distinct stories from the same company', () => {
    const input = [
      { company: 'EY', headline: 'A', problem: 'p', solution: 's', result: 'r', link: 'https://m.com/en/customers/story/1-ey' },
      { company: 'EY', headline: 'B', problem: 'p', solution: 's', result: 'r', link: 'https://m.com/en/customers/story/2-ey' },
      // True duplicate of the first (locale variant) -> collapses.
      { company: 'EY', headline: 'A', link: 'https://m.com/en-gb/customers/story/1-ey' }
    ];
    const out = scraper.deduplicateCaseStudies(input);
    expect(out.length).toBe(2);
  });

  it('keeps the more complete entry when duplicates collapse', () => {
    const input = [
      { company: 'EY', headline: 'A', link: 'https://m.com/en/customers/story/1-ey' },
      { company: 'EY', headline: 'A', problem: 'p', solution: 's', result: 'r', link: 'https://m.com/en-gb/customers/story/1-ey' }
    ];
    const out = scraper.deduplicateCaseStudies(input);
    expect(out.length).toBe(1);
    expect(out[0].result).toBe('r');
  });
});

describe('KnowledgeGenerator.deduplicate (case studies)', () => {
  const KnowledgeGenerator = require('../knowledge-generator');
  const gen = new KnowledgeGenerator(null);

  it('preserves distinct stories from the same company at merge time', () => {
    const kb = {
      discoveryQuestions: [],
      proofPoints: [],
      productTruths: [],
      caseStudies: [
        { id: 'cs1', company: 'EY', headline: 'A', link: 'https://m.com/en/customers/story/1-ey' },
        { id: 'cs2', company: 'EY', headline: 'B', link: 'https://m.com/en/customers/story/2-ey' },
        // Same story as cs1 across a different locale -> should collapse.
        { id: 'cs9', company: 'EY', headline: 'A', link: 'https://m.com/en-gb/customers/story/1-ey' }
      ]
    };
    const out = gen.deduplicate(kb);
    expect(out.caseStudies.length).toBe(2);
    // IDs are re-numbered sequentially after dedupe.
    expect(out.caseStudies.map((c) => c.id)).toEqual(['cs1', 'cs2']);
  });
});

