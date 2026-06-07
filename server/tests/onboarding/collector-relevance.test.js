// Tests for relevance-driven demotion in source-collector.

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

describe('source-collector relevance demotion', () => {
  const extractor = {
    extractCaseStudyFromContent: async (content, url) => [{
      company: url.includes('sap') ? 'SAPCo' : 'AICo', headline: 'h', problem: 'p', solution: 's', result: 'r', link: url, triggers: []
    }],
    deduplicateCaseStudies: (a) => a
  };

  it('demotes off-focus case studies to weak candidates when the seller gave focus', async () => {
    const fetcher = fakeFetcher([
      ['/story/sap-one', richPage('Globex moved their SAP ERP workloads to the cloud. '.repeat(30), 'SAP one')],
      ['/story/sap-two', richPage('Initech ran SAP S/4HANA migration successfully. '.repeat(30), 'SAP two')],
      ['/story/ai-one', richPage('Contoso built generative AI copilots with Azure OpenAI. '.repeat(30), 'AI one')]
    ]);

    const sources = await collectSources('https://azure.microsoft.com/en-gb', {
      pageFetcher: fetcher,
      caseStudyExtractor: extractor,
      discover: fakeDiscover([
        'https://azure.microsoft.com/en/customers/story/sap-one',
        'https://azure.microsoft.com/en/customers/story/sap-two',
        'https://azure.microsoft.com/en/customers/story/ai-one'
      ]),
      profile: { focusProducts: ['Azure OpenAI'], focusIndustries: [] },
      priorities: ['AI'],
      maxCaseStudies: 10
    });

    const companies = sources.extractedCaseStudies.map((c) => c.company);
    expect(companies).toContain('AICo');
    expect(companies).not.toContain('SAPCo');
    expect(sources.weakCaseStudyCandidates.length).toBeGreaterThan(0);
    expect(sources.telemetry.caseStudyDemoted).toBeGreaterThan(0);
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
    expect(sources.telemetry.caseStudyDemoted).toBe(0);
  });
});
