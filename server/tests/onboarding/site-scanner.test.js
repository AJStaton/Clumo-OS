// Tests for onboarding/site-scanner.js — product/solution + hub detection.

const { scanSite, prettyLabel, areaFromPath } = require('../../onboarding/site-scanner');

describe('site-scanner helpers', () => {
  it('prettifies slugs with known acronyms', () => {
    expect(prettyLabel('ai-foundry')).toBe('AI Foundry');
    expect(prettyLabel('sap')).toBe('SAP');
    expect(prettyLabel('data-analytics')).toBe('Data Analytics');
  });

  it('extracts product vs solution areas from paths', () => {
    expect(areaFromPath('/products/ai-foundry')).toMatchObject({ kind: 'product', label: 'AI Foundry' });
    expect(areaFromPath('/solutions/sap')).toMatchObject({ kind: 'solution', label: 'SAP' });
    expect(areaFromPath('/industries/banking')).toMatchObject({ kind: 'solution', label: 'Banking' });
    expect(areaFromPath('/pricing')).toBeNull();
    expect(areaFromPath('/solutions/overview')).toBeNull();
  });
});

describe('scanSite', () => {
  function fakeFetcher(homeLinks) {
    return {
      fetch: async (url) => ({ url, ok: true, confidence: 0.7, links: homeLinks, mainText: 'home', title: 'Home' }),
      close: async () => {},
      getTelemetry: () => ({})
    };
  }

  it('detects products, solutions, and a master case-study hub from homepage anchors', async () => {
    const links = [
      'https://acme.com/products/ai-foundry',
      'https://acme.com/products/fabric',
      'https://acme.com/solutions/banking',
      'https://acme.com/resources/customer-stories',
      'https://acme.com/solutions/sap/customers',  // narrow — should NOT be the hub
      'https://acme.com/docs',
      'https://acme.com/blog'
    ];
    const scan = await scanSite('https://acme.com', { pageFetcher: fakeFetcher(links), fetchText: async () => '' });

    const productLabels = scan.products.map((p) => p.label);
    const solutionLabels = scan.solutions.map((s) => s.label);
    expect(productLabels).toContain('AI Foundry');
    expect(productLabels).toContain('Fabric');
    expect(solutionLabels).toContain('Banking');
    expect(scan.hubs.caseStudies).toContain('/resources/customer-stories');
    expect(scan.hubs.docs).toContain('/docs');
    expect(scan.hubs.blog).toContain('/blog');
  });
});
