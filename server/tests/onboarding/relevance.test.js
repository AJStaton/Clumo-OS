// Tests for onboarding/relevance.js — case-study relevance scoring.

const { buildRelevanceContext, scoreCaseStudyRelevance, hasContext } = require('../../onboarding/relevance');

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
