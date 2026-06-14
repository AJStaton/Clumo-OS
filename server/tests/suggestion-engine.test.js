// Offline unit tests for the realtime suggestion engine pipeline.
// These exercise the deterministic surface — fused candidate selection, dynamic
// threshold, pivotal-utterance embedding, fast path, decision LLM, cooldowns and
// speculative warm reuse — with in-memory fakes (no network, no cost).

const SuggestionEngine = require('../suggestion-engine');

// A controlled KB with simple 3-dim embeddings so we can reason about cosine
// similarity exactly. Distinct clusters: pipeline=[1,0,0], budget=[0,1,0],
// security=[0,0,1].
function makeKb() {
  return {
    discoveryQuestions: [
      { id: 'dq1', question: 'What does your data pipeline look like today?', context: 'pipelines', embedding: [1, 0, 0], triggers: ['pipeline', 'data pipeline'] },
      { id: 'dq2', question: 'Who owns the budget?', context: 'budget', embedding: [0, 1, 0], triggers: ['budget', 'cost'] }
    ],
    caseStudies: [
      { id: 'cs1', company: 'Astronomer', headline: 'Scaled data pipelines', result: '5x faster', link: 'https://x', embedding: [0.9, 0.1, 0], triggers: ['pipeline', 'scale'] }
    ],
    proofPoints: [
      { id: 'pp1', stat: '99.9% uptime', source: 'SLA', link: 'https://y', embedding: [0, 0, 1], triggers: ['uptime', 'sla', 'reliability'] }
    ],
    productTruths: [
      { id: 'pt1', fact: 'SOC2 Type II certified', category: 'security', link: 'https://pt', embedding: [0, 0.6, 0.8], triggers: ['soc2', 'certified'] }
    ]
  };
}

function makeEmbeddingProvider() {
  const calls = { texts: [] };
  function map(text) {
    const t = text.toLowerCase();
    if (t.includes('pipeline')) return [1, 0, 0];
    if (t.includes('budget')) return [0, 1, 0];
    if (t.includes('security') || t.includes('compli')) return [0, 0, 1];
    return [0.3, 0.3, 0.3];
  }
  return {
    calls,
    async generateEmbedding(text) {
      calls.texts.push(text);
      return map(text);
    }
  };
}

function makeChatClient(nextResponse = JSON.stringify({ suggest: true, confidence: 0.9, id: 'cs1', trigger: 'data pipeline is slow' })) {
  const calls = { create: 0, lastMessages: null };
  let response = nextResponse;
  return {
    calls,
    setNext(json) { response = json; },
    chat: {
      completions: {
        create: async (args) => {
          calls.create++;
          calls.lastMessages = args.messages;
          return { choices: [{ message: { content: response } }] };
        }
      }
    }
  };
}

function makeEngine(chatClient, embedProvider) {
  // Passing a raw client (no chatCompletion) makes the engine treat it as the
  // openai client directly; embeddings come from the separate provider.
  const engine = new SuggestionEngine(chatClient, 'test-session', embedProvider);
  engine.knowledgeBase = makeKb();
  return engine;
}

describe('suggestion-engine — candidate selection', () => {
  it('fuses candidates across types and applies a dynamic relative threshold', async () => {
    const engine = makeEngine(makeChatClient(), makeEmbeddingProvider());
    const { scored } = await engine._semanticCandidates('our data pipeline is slow');
    const selected = engine._selectCandidates(scored);
    const ids = selected.map(c => c.id);
    // dq1 (1.0) and cs1 (~0.99) cluster at the top and are kept; budget/security
    // items fall below the absolute floor and are dropped.
    expect(ids).toContain('dq1');
    expect(ids).toContain('cs1');
    expect(ids).not.toContain('dq2');
    expect(ids).not.toContain('pp1');
    // Candidates are a single fused list, not per-type buckets.
    const kinds = new Set(selected.map(c => c.kind));
    expect(kinds.has('discovery')).toBe(true);
    expect(kinds.has('case_study')).toBe(true);
  });

  it('skips items that are on the re-surface cooldown', async () => {
    const engine = makeEngine(makeChatClient(), makeEmbeddingProvider());
    engine.suggestedAt.set('dq1', Date.now()); // just suggested
    const { scored } = await engine._semanticCandidates('our data pipeline is slow');
    const ids = engine._selectCandidates(scored).map(c => c.id);
    expect(ids).not.toContain('dq1');
  });
});

describe('suggestion-engine — pivotal embedding', () => {
  it('embeds only the pivotal (last) sentence, not the whole buffer', async () => {
    const embed = makeEmbeddingProvider();
    const engine = makeEngine(makeChatClient(), embed);
    await engine.getBestSuggestion('Thanks for the intro earlier. Our data pipeline is way too slow today.');
    expect(embed.calls.texts.length).toBeGreaterThan(0);
    const embedded = embed.calls.texts[0];
    expect(embedded).toContain('pipeline');
    expect(embedded).not.toContain('Thanks for the intro');
  });
});

describe('suggestion-engine — fast path', () => {
  it('surfaces a dominant local match without calling the decision LLM', async () => {
    const chat = makeChatClient();
    const engine = makeEngine(chat, makeEmbeddingProvider());
    const suggestion = await engine.getBestSuggestion('Tell me about your security compliance posture.');
    expect(suggestion).toBeTruthy();
    expect(suggestion.type).toBe('proof_point'); // pp1 dominates the security cluster
    expect(chat.calls.create).toBe(0);            // LLM skipped
  });
});

describe('suggestion-engine — decision LLM path', () => {
  it('returns the candidate the LLM chooses by id (trigger grounded to transcript)', async () => {
    // The LLM's paraphrased trigger ("pipeline is slow") is NOT a verbatim
    // substring of the transcript, so grounding falls back to the real utterance.
    const chat = makeChatClient(JSON.stringify({ suggest: true, confidence: 0.9, id: 'cs1', trigger: 'pipeline is slow' }));
    const engine = makeEngine(chat, makeEmbeddingProvider());
    const suggestion = await engine.getBestSuggestion('Our data pipeline is way too slow today.');
    expect(chat.calls.create).toBe(1);
    expect(suggestion).toBeTruthy();
    expect(suggestion.type).toBe('case_study');
    expect(suggestion.company).toBe('Astronomer');
    expect(suggestion.trigger).toBe('Our data pipeline is way too slow today.');
  });

  it('keeps the LLM trigger when it is a verbatim substring of the transcript', async () => {
    const chat = makeChatClient(JSON.stringify({ suggest: true, confidence: 0.9, id: 'cs1', trigger: 'data pipeline is way too slow' }));
    const engine = makeEngine(chat, makeEmbeddingProvider());
    const suggestion = await engine.getBestSuggestion('Our data pipeline is way too slow today.');
    expect(suggestion).toBeTruthy();
    expect(suggestion.trigger).toBe('data pipeline is way too slow');
  });

  it('suppresses low-confidence decisions', async () => {
    const chat = makeChatClient(JSON.stringify({ suggest: true, confidence: 0.4, id: 'cs1' }));
    const engine = makeEngine(chat, makeEmbeddingProvider());
    const suggestion = await engine.getBestSuggestion('Our data pipeline is way too slow today.');
    expect(suggestion).toBeNull();
  });

  it('sends layered decision context (pivotal + candidates) to the LLM', async () => {
    const chat = makeChatClient(JSON.stringify({ suggest: false, confidence: 0 }));
    const engine = makeEngine(chat, makeEmbeddingProvider());
    await engine.getBestSuggestion('Our data pipeline is way too slow today.');
    const userMsg = chat.calls.lastMessages.find(m => m.role === 'user').content;
    expect(userMsg).toContain('WHAT JUST HAPPENED');
    expect(userMsg).toContain('id: cs1');
  });
});

describe('suggestion-engine — frequency & cooldown', () => {
  it('enforces a short cooldown between suggestions', async () => {
    const engine = makeEngine(makeChatClient(), makeEmbeddingProvider());
    const first = await engine.getBestSuggestion('Tell me about your security compliance posture.');
    expect(first).toBeTruthy();
    // Immediately after, the global cooldown blocks a second suggestion.
    expect(engine.canSuggest()).toBe(false);
    const second = await engine.getBestSuggestion('Our data pipeline is way too slow today.');
    expect(second).toBeNull();
  });

  it('re-surface cooldown expires (items are not permanently banned)', () => {
    const engine = makeEngine(makeChatClient(), makeEmbeddingProvider());
    engine.suggestedAt.set('cs1', Date.now());
    expect(engine.isOnCooldown('cs1')).toBe(true);
    engine.suggestedAt.set('cs1', Date.now() - (5 * 60 * 1000)); // 5 min ago
    expect(engine.isOnCooldown('cs1')).toBe(false);
  });

  it('dismissing a suggestion puts it on cooldown', () => {
    const engine = makeEngine(makeChatClient(), makeEmbeddingProvider());
    engine.markSuggestionDismissed('dq1');
    expect(engine.isOnCooldown('dq1')).toBe(true);
  });
});

describe('suggestion-engine — speculative warm reuse', () => {
  it('reuses the warm embedding computed during speech (no duplicate embed)', async () => {
    const embed = makeEmbeddingProvider();
    const chat = makeChatClient(JSON.stringify({ suggest: false, confidence: 0 }));
    const engine = makeEngine(chat, embed);
    await engine.warmUtterance('Our data pipeline is way too slow today.');
    const afterWarm = embed.calls.texts.length;
    await engine.getBestSuggestion('Our data pipeline is way too slow today.');
    // The final evaluation should not re-embed the same pivotal text.
    expect(embed.calls.texts.length).toBe(afterWarm);
  });
});

describe('suggestion-engine — guards', () => {
  it('ignores utterances below the minimum word count', async () => {
    const engine = makeEngine(makeChatClient(), makeEmbeddingProvider());
    const suggestion = await engine.getBestSuggestion('too short');
    expect(suggestion).toBeNull();
  });
});

describe('suggestion-engine — trigger timestamp & links', () => {
  it('stamps the suggestion with opts.triggeredAt (when the customer spoke)', async () => {
    const engine = makeEngine(makeChatClient(), makeEmbeddingProvider());
    const when = Date.parse('2025-01-01T10:00:00.000Z');
    const suggestion = await engine.getBestSuggestion(
      'Tell me about your security compliance posture.',
      { triggeredAt: when }
    );
    expect(suggestion).toBeTruthy();
    expect(suggestion.triggeredAt).toBe(new Date(when).toISOString());
  });

  it('falls back to current time when no triggeredAt is provided', async () => {
    const engine = makeEngine(makeChatClient(), makeEmbeddingProvider());
    const suggestion = await engine.getBestSuggestion('Tell me about your security compliance posture.');
    expect(suggestion).toBeTruthy();
    expect(Number.isNaN(Date.parse(suggestion.triggeredAt))).toBe(false);
  });

  it('materializes a product_truth with its source link', () => {
    const engine = makeEngine(makeChatClient(), makeEmbeddingProvider());
    const suggestion = engine._materialize('product_truth', 'pt1', 'security');
    expect(suggestion.type).toBe('product_truth');
    expect(suggestion.link).toBe('https://pt');
  });

  it('materializes a proof_point with its source link', () => {
    const engine = makeEngine(makeChatClient(), makeEmbeddingProvider());
    const suggestion = engine._materialize('proof_point', 'pp1', 'uptime');
    expect(suggestion.type).toBe('proof_point');
    expect(suggestion.link).toBe('https://y');
  });
});

// ---------------------------------------------------------------------------
// Variety overhaul: per-type quotas, hybrid trigger scoring, anti-monotony,
// decision-LLM steering. These guarantee the LLM sees a fair multi-type
// shortlist instead of a discovery-question monoculture.
// ---------------------------------------------------------------------------

function makeEngineWithKb(kb, chatClient, embedProvider) {
  const engine = new SuggestionEngine(
    chatClient || makeChatClient(),
    'test-session',
    embedProvider || makeEmbeddingProvider()
  );
  engine.knowledgeBase = kb;
  return engine;
}

describe('suggestion-engine — per-type quotas', () => {
  it('caps a dominant type and guarantees a multi-type shortlist', async () => {
    // Six discovery questions all embed identically to the query, plus one of
    // each evidence type. Without quotas the shortlist would be all discovery.
    const kb = {
      discoveryQuestions: Array.from({ length: 6 }, (_, i) => ({
        id: `dq${i}`, question: `q${i}`, context: 'c', embedding: [1, 0, 0]
      })),
      caseStudies: [{ id: 'cs1', company: 'C', headline: 'h', result: 'r', embedding: [0.95, 0.05, 0] }],
      proofPoints: [{ id: 'pp1', stat: 's', source: 'src', embedding: [0.95, 0, 0.05] }],
      productTruths: [{ id: 'pt1', fact: 'f', category: 'cat', embedding: [0.9, 0.1, 0.1] }]
    };
    const engine = makeEngineWithKb(kb);
    const { scored } = await engine._semanticCandidates('our data pipeline');
    const selected = engine._selectCandidates(scored);
    const kinds = selected.map(c => c.kind);
    // Discovery is capped at its quota (4), not all 6.
    expect(kinds.filter(k => k === 'discovery').length).toBe(4);
    // Every evidence type that cleared the floor earns a seat.
    expect(kinds).toContain('case_study');
    expect(kinds).toContain('proof_point');
    expect(kinds).toContain('product_truth');
  });
});

describe('suggestion-engine — hybrid trigger scoring', () => {
  it('ranks a trigger-hit item above an equal-cosine item with no hit', async () => {
    const kb = {
      discoveryQuestions: [],
      caseStudies: [
        { id: 'hit', company: 'A', headline: 'h', result: 'r', embedding: [1, 0, 0], triggers: ['gartner'] },
        { id: 'miss', company: 'B', headline: 'h', result: 'r', embedding: [1, 0, 0], triggers: ['unrelated'] }
      ],
      proofPoints: [],
      productTruths: []
    };
    const engine = makeEngineWithKb(kb);
    // Both have identical cosine to the query; only 'hit' matches a trigger word.
    const { scored } = await engine._semanticCandidates('what about gartner rankings for data pipeline');
    const hit = scored.find(c => c.id === 'hit');
    const miss = scored.find(c => c.id === 'miss');
    expect(hit.score).toBeGreaterThan(miss.score);
    expect(hit.hits).toBeGreaterThan(0);
    expect(miss.hits).toBe(0);
  });
});

describe('suggestion-engine — anti-monotony rotation', () => {
  it('de-emphasises the most recently surfaced type', () => {
    const engine = makeEngine(makeChatClient(), makeEmbeddingProvider());
    engine.recentTypes = ['discovery'];
    const scored = [
      { kind: 'discovery', id: 'dqX', score: 0.90, item: {} },
      { kind: 'case_study', id: 'csX', score: 0.88, item: {} }
    ];
    const selected = engine._selectCandidates(scored);
    // The just-shown discovery (0.90 − 0.03 = 0.87) now ranks below the case
    // study (0.88), so the case study leads the shortlist.
    expect(selected[0].kind).toBe('case_study');
  });
});

describe('suggestion-engine — decision-LLM steering', () => {
  it('buildDecisionPrompt surfaces recently-shown types to discourage repeats', () => {
    const engine = makeEngine(makeChatClient(), makeEmbeddingProvider());
    engine.recentTypes = ['discovery', 'discovery'];
    const prompt = engine.buildDecisionPrompt('our data pipeline is slow', [
      { kind: 'case_study', id: 'cs1', item: engine.knowledgeBase.caseStudies[0] }
    ]);
    expect(prompt).toContain('RECENTLY SHOWN');
    expect(prompt.toLowerCase()).toContain('discovery question');
  });

  it('tracks recent suggestion types as suggestions are committed', () => {
    const engine = makeEngine(makeChatClient(), makeEmbeddingProvider());
    engine._commitSuggestion({ type: 'discovery' }, 'dq1');
    engine._commitSuggestion({ type: 'case_study' }, 'cs1');
    expect(engine.recentTypes).toEqual(['discovery', 'case_study']);
  });
});

