// Regression + behavior tests for the multi-pass generation core in knowledge-generator.js.
// A fake OpenAI client (raw-client constructor path) returns canned JSON arrays — no network,
// no LLM. Guards the `identityOf is not defined` regression and the dedupe/re-id/exhaustion logic.

const KnowledgeGenerator = require('../knowledge-generator');

// Build a generator backed by a fake raw OpenAI client whose create() pops canned responses.
function genWithResponses(responses) {
  let i = 0;
  const calls = [];
  const client = {
    chat: {
      completions: {
        create: async (params) => {
          calls.push(params);
          const content = i < responses.length ? responses[i] : '[]';
          i += 1;
          return { choices: [{ message: { content } }] };
        }
      }
    }
  };
  const gen = new KnowledgeGenerator(client);
  return { gen, calls, get callCount() { return i; } };
}

const ANALYSIS = {
  companyName: 'Acme', productDescription: 'A platform', targetMarket: 'SMB',
  valuePropositions: ['fast'], painPointsSolved: ['slow'], differentiators: [], industry: 'tech'
};

describe('knowledge-generator multi-pass core', () => {
  it('generateDiscoveryQuestions returns items without the identityOf regression', async () => {
    const page = JSON.stringify([
      { id: 'dq1', question: 'What is your hiring volume?', context: 'c', triggers: ['hiring'] },
      { id: 'dq2', question: 'How do you measure retention?', context: 'c', triggers: ['retention'] }
    ]);
    // Same items repeated on later passes -> dedupe -> pass adds 0 -> exhaustion stop.
    const { gen } = genWithResponses([page, page, page]);
    const out = await gen.generateDiscoveryQuestions('lots of content', ANALYSIS, false, '', 100);
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBe(2);
    expect(out.map(q => q.question)).toContain('What is your hiring volume?');
  });

  it('dedupes by identity across passes and re-ids sequentially', async () => {
    const pass1 = JSON.stringify([
      { id: 'x', question: 'Q one?', context: 'c', triggers: [] },
      { id: 'y', question: 'Q two?', context: 'c', triggers: [] }
    ]);
    // Pass 2 repeats Q two and adds a new Q three.
    const pass2 = JSON.stringify([
      { id: 'z', question: 'Q two?', context: 'c', triggers: [] },
      { id: 'w', question: 'Q three?', context: 'c', triggers: [] }
    ]);
    const { gen } = genWithResponses([pass1, pass2, '[]']);
    // Use a long content so chunking produces multiple chunks (forces continuation passes).
    const content = 'a'.repeat(120000);
    const out = await gen.generateDiscoveryQuestions(content, ANALYSIS, false, '', 100);
    expect(out.map(q => q.question)).toEqual(['Q one?', 'Q two?', 'Q three?']);
    expect(out.map(q => q.id)).toEqual(['dq1', 'dq2', 'dq3']);
  });

  it('never pads beyond what the content supports (stops on exhaustion)', async () => {
    const only = JSON.stringify([{ id: 'p1', stat: '467% ROI', source: 's', triggers: [] }]);
    const { gen, callCount } = genWithResponses([only, only, only]);
    const out = await gen.generateProofPoints('short content', ANALYSIS, false, '', 50);
    expect(out.length).toBe(1);          // target was 50 but only 1 grounded -> no padding
    expect(out[0].id).toBe('pp1');
  });

  it('case studies and product truths also flow through identityOf without error', async () => {
    const cs = JSON.stringify([{ id: 'c1', company: 'Globex', headline: 'h', result: 'r', triggers: [] }]);
    const pt = JSON.stringify([{ id: 't1', fact: 'It scales to N', category: 'Platform', triggers: [] }]);
    const { gen } = genWithResponses([cs, '[]', pt, '[]']);
    const csOut = await gen.generateCaseStudies('content', ANALYSIS, false, null, '', 30);
    const ptOut = await gen.generateProductTruths('content', ANALYSIS, false, '', 100);
    expect(csOut[0].company).toBe('Globex');
    expect(ptOut[0].fact).toBe('It scales to N');
  });
});
