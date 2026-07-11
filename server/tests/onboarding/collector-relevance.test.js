// Tests for relevance-driven SOFT PRIORITISATION in source-collector.
// Off-focus case studies are KEPT (more is better); relevance only orders them so on-focus and
// seller-trusted stories lead. Nothing is dropped for being off-focus.

const { collectSources } = require('../../onboarding/source-collector');

function richPage(text, title) {
  return { mainText: text, summary: text.slice(0, 120), title, links: [], jsonld: [], meta: {}, signals: { mainTextChars: text.length } };
}

function fakeFetcher(pagesByMatch) {
  const telemetry = { pagesFetched: 0 };
  return {
    fetch: async (url) => {
      telemetry.pagesFetched += 1;
      for (const [needle, page] of pagesByMatch) {
        if (url.includes(needle)) return { url, ok: true, confidence: 0.7, ...page };
      }
      return { url, ok: true, confidence: 0.6, ...richPage('Generic content. '.repeat(30), 'Generic') };
    },
    close: async () => {},
    getTelemetry: () => telemetry
  };
}

function fakeDiscover(caseStudyUrls) {
  return async () => ({
    buckets: {
      case_study: caseStudyUrls.map((url) => ({ url, category: 'case_study', individual: true, priority: 3 })),
      blog: [], docs: [], product: []
    },
    telemetry: { strategies: {} }
  });
}

describe('source-collector soft prioritisation', () => {
  const extractor = {
    extractCaseStudyFromContent: async (content, url) => [{
      company: url.includes('sap') ? 'SAPCo' : 'AICo', headline: 'h', problem: 'p', solution: 's', result: 'r', link: url, triggers: []
    }],
    deduplicateCaseStudies: (a) => a
  };

  it('keeps off-focus stories but ranks on-focus ones first', async () => {
    const fetcher = fakeFetcher([
      ['/story/sap-one', richPage('Globex moved their SAP ERP workloads to the cloud. '.repeat(30), 'SAP one')],
      ['/story/ai-one', richPage('Contoso built generative AI copilots with Azure OpenAI. '.repeat(30), 'AI one')]
    ]);

    const sources = await collectSources('https://azure.microsoft.com/en-gb', {
      pageFetcher: fetcher,
      caseStudyExtractor: extractor,
      discover: fakeDiscover([
        'https://azure.microsoft.com/en/customers/story/sap-one',
        'https://azure.microsoft.com/en/customers/story/ai-one'
      ]),
      profile: { focusProducts: ['Azure OpenAI'], focusIndustries: [] },
      priorities: ['AI'],
      maxCaseStudies: 10
    });

    const companies = sources.extractedCaseStudies.map((c) => c.company);
    // Both are kept — nothing is dropped for being off-focus.
    expect(companies).toContain('AICo');
    expect(companies).toContain('SAPCo');
    // On-focus AICo is ranked above off-focus SAPCo.
    expect(companies.indexOf('AICo')).toBeLessThan(companies.indexOf('SAPCo'));
    // Off-focus story is surfaced in telemetry (kept, not removed).
    expect(sources.telemetry.caseStudyOffFocus).toBeGreaterThan(0);
  });

  it('keeps all stories when the seller gave no focus signals', async () => {
    const fetcher = fakeFetcher([
      ['/story/sap-one', richPage('Globex moved their SAP ERP workloads. '.repeat(30), 'SAP one')],
      ['/story/ai-one', richPage('Contoso built AI copilots. '.repeat(30), 'AI one')]
    ]);

    const sources = await collectSources('https://example.com', {
      pageFetcher: fetcher,
      caseStudyExtractor: extractor,
      discover: fakeDiscover([
        'https://example.com/customers/story/sap-one',
        'https://example.com/customers/story/ai-one'
      ]),
      maxCaseStudies: 10
    });

    expect(sources.extractedCaseStudies.length).toBe(2);
    expect(sources.telemetry.caseStudyOffFocus).toBe(0);
  });

  it('ranks a seller-pasted (trusted) story first, even when it is off-focus', async () => {
    const fetcher = fakeFetcher([
      ['/story/sap-paste', richPage('Globex ran a big SAP S/4HANA migration. '.repeat(30), 'SAP paste')],
      ['/story/ai-disc', richPage('Contoso built generative AI copilots with Azure OpenAI. '.repeat(30), 'AI disc')]
    ]);
    const discover = async () => ({
      buckets: {
        case_study: [
          { url: 'https://x.com/customers/story/sap-paste', category: 'case_study', individual: true, priority: 5, pasted: true, trusted: true },
          { url: 'https://x.com/customers/story/ai-disc', category: 'case_study', individual: true, priority: 3 }
        ],
        blog: [], docs: [], product: []
      },
      telemetry: { strategies: {} }
    });

    const sources = await collectSources('https://x.com', {
      pageFetcher: fetcher,
      caseStudyExtractor: extractor,
      discover,
      profile: { focusProducts: ['Azure OpenAI'], focusIndustries: [] },
      priorities: ['AI'],
      maxCaseStudies: 10
    });

    const companies = sources.extractedCaseStudies.map((c) => c.company);
    // Trusted (pasted) story is kept and ranked first despite being off-focus.
    expect(companies).toContain('SAPCo');
    expect(companies).toContain('AICo');
    expect(companies.indexOf('SAPCo')).toBeLessThan(companies.indexOf('AICo'));
  });
});
