// Tests for onboarding/relevance.js — case-study relevance scoring.

const { buildRelevanceContext, scoreCaseStudyRelevance, scoreCaseStudyDetailed, hasContext } = require('../../onboarding/relevance');

describe('relevance scoring', () => {
  it('returns null score when there is no seller context', () => {
    const ctx = buildRelevanceContext({});
    expect(hasContext(ctx)).toBe(false);
    const score = scoreCaseStudyRelevance({ text: 'anything', url: 'https://x/y', title: 't' }, ctx);
    expect(score).toBeNull();
  });

  it('scores an on-topic story higher than an off-topic one', () => {
    const ctx = buildRelevanceContext({ focusProducts: ['Azure OpenAI'], priorities: ['AI'] });
    const onTopic = scoreCaseStudyRelevance({
      text: 'Contoso built a chatbot on Azure OpenAI to automate support with generative AI.',
      title: 'Contoso + Azure OpenAI',
      url: 'https://azure.microsoft.com/en/customers/story/contoso-azure-openai'
    }, ctx);
    const offTopic = scoreCaseStudyRelevance({
      text: 'Globex migrated their SAP ERP workloads to the cloud for better uptime.',
      title: 'Globex SAP migration',
      url: 'https://azure.microsoft.com/en/customers/story/globex-sap'
    }, ctx);
    expect(onTopic).toBeGreaterThan(offTopic);
  });

  it('gives a url/slug match an extra boost', () => {
    const ctx = buildRelevanceContext({ focusProducts: ['Fabric'] });
    const inUrl = scoreCaseStudyRelevance({
      text: 'A data analytics transformation story.',
      title: 'Data story',
      url: 'https://x.com/customers/story/acme-fabric'
    }, ctx);
    const notInUrl = scoreCaseStudyRelevance({
      text: 'A data analytics transformation story.',
      title: 'Data story',
      url: 'https://x.com/customers/story/acme-generic'
    }, ctx);
    expect(inUrl).toBeGreaterThan(notInUrl);
  });
});

describe('scoreCaseStudyDetailed (focus gate)', () => {
  it('counts matchedFocus only for focus terms, not personas or company keywords', () => {
    const ctx = buildRelevanceContext({ focusProducts: ['Fabric'], personas: ['CFO'], companyKeywords: ['azure'] });
    const onFocus = scoreCaseStudyDetailed({ text: 'A Microsoft Fabric data analytics story', title: 't', url: 'https://x/y' }, ctx);
    expect(onFocus.matchedFocus).toBeGreaterThan(0);
    const personaOnly = scoreCaseStudyDetailed({ text: 'The CFO loved their azure cloud rollout', title: 't', url: 'https://x/y' }, ctx);
    expect(personaOnly.matchedFocus).toBe(0);
  });

  it('counts a URL slug hit toward matchedFocus even when the body is thin', () => {
    const ctx = buildRelevanceContext({ focusProducts: ['Fabric'] });
    const d = scoreCaseStudyDetailed({ text: 'thin', title: '', url: 'https://x.com/customers/story/acme-fabric' }, ctx);
    expect(d.matchedFocus).toBeGreaterThan(0);
  });

  it('matches singular/plural focus variants', () => {
    const ctx = buildRelevanceContext({ focusProducts: ['App Services'] });
    const d = scoreCaseStudyDetailed({ text: 'Built on Azure App Service for scale', title: '', url: 'https://x/y' }, ctx);
    expect(d.matchedFocus).toBeGreaterThan(0);
  });

  it('returns matchedFocus 0 and null score when there is no context', () => {
    const d = scoreCaseStudyDetailed({ text: 'anything', title: 't', url: 'https://x/y' }, buildRelevanceContext({}));
    expect(d.score).toBeNull();
    expect(d.matchedFocus).toBe(0);
  });
});
