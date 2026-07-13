// Offline unit tests for the realtime coaching engine's persona routing.
// These exercise the deterministic surface — key-moment detection, the persona
// hint threaded into the nudge prompt, and persona tagging on the returned nudge
// — with an in-memory fake provider (no network, no cost). The regression under
// test: technical conversation must be able to reach the Solution Engineer lens,
// not always fall back to Account Executive.

const CoachingEngine = require('../coaching-engine');
const { detectMoment } = CoachingEngine;

// Fake chat provider: captures the last user prompt and returns a canned nudge.
// `personaEcho` lets a test force the model's chosen persona so we can assert the
// engine tags it through faithfully. `moveEcho` forces the move name.
function makeProvider(personaEcho = 'se', moveEcho = 'DeRisk') {
  const calls = { messages: [] };
  return {
    calls,
    async chatCompletion(messages) {
      calls.messages.push(messages);
      const nudge = {
        coach: true,
        confidence: 0.9,
        persona: personaEcho,
        move: moveEcho,
        signal: 'questioning the technology',
        headline: 'De-risk the integration concern',
        why: 'Technical doubt is blocking progress.',
        say: 'Here is how the API handles that.',
        urgency: 'now'
      };
      return { choices: [{ message: { content: JSON.stringify({ nudge }) } }] };
    }
  };
}

function makeProviderSequence(nudges) {
  const calls = { messages: [] };
  let idx = 0;
  return {
    calls,
    async chatCompletion(messages) {
      calls.messages.push(messages);
      const nudge = nudges[Math.min(idx, nudges.length - 1)];
      idx += 1;
      return { choices: [{ message: { content: JSON.stringify({ nudge }) } }] };
    }
  };
}

describe('detectMoment persona routing', () => {
  it('routes technical cues to the Solution Engineer lens', () => {
    const technical = [
      'how does the API integration work',
      'we care a lot about security and SOC 2 compliance',
      'what does the deployment architecture look like',
      'can it scale to our throughput and latency needs',
      'we need a data migration from our old schema',
      'does it support single sign-on'
    ];
    for (const line of technical) {
      const m = detectMoment(line);
      expect(m, `expected a moment for: "${line}"`).toBeTruthy();
      expect(m.personaHint, `expected se hint for: "${line}"`).toBe('se');
    }
  });

  it('still routes commercial cues to AE and objections to the Closer', () => {
    expect(detectMoment('what is your decision process for approval').personaHint).toBe('ae');
    expect(detectMoment('the budget is allocated for this').personaHint).toBe('ae');
    expect(detectMoment('honestly this feels too expensive').personaHint).toBe('closer');
  });

  it('returns null when no key moment is present', () => {
    expect(detectMoment('thanks so much for hopping on today')).toBeNull();
    expect(detectMoment('')).toBeNull();
  });
});

describe('nudge persona hinting', () => {
  it('threads the Solution Engineer hint into the prompt on a technical moment', async () => {
    const provider = makeProvider('se');
    const engine = new CoachingEngine(provider);
    const trigger = { reason: 'moment', cue: 'api', category: 'integration', personaHint: 'se' };

    const nudge = await engine.nudge({}, trigger);

    expect(nudge).toBeTruthy();
    expect(nudge.persona).toBe('se');
    expect(nudge.personaLabel).toBe('Solution Engineer');

    const userPrompt = provider.calls.messages[0].find(m => m.role === 'user').content;
    expect(userPrompt).toContain('Solution Engineer moment');
  });

  it('does not force a lens on a routine cadence check', async () => {
    const provider = makeProvider('ae');
    const engine = new CoachingEngine(provider);
    const trigger = { reason: 'cadence', cue: null, category: null, personaHint: null };

    const nudge = await engine.nudge({}, trigger);

    expect(nudge.persona).toBe('ae');
    const userPrompt = provider.calls.messages[0].find(m => m.role === 'user').content;
    expect(userPrompt).toContain('Routine strategic check');
    expect(userPrompt).not.toContain('moment — strongly consider');
  });

  it('tags whichever lens the coach actually chose', async () => {
    const provider = makeProvider('closer');
    const engine = new CoachingEngine(provider);
    const nudge = await engine.nudge({}, { reason: 'moment', cue: 'expensive', category: 'expensive', personaHint: 'closer' });
    expect(nudge.persona).toBe('closer');
    expect(nudge.personaLabel).toBe('Closer');
  });
});

describe('SE voice: full persona judgment + MEDDPICC multi-lens', () => {  it('injects each persona full judgment and the MEDDPICC lens mapping into the system prompt', async () => {
    const provider = makeProvider('se');
    const engine = new CoachingEngine(provider);
    await engine.nudge({}, { reason: 'moment', cue: 'api', category: 'integration', personaHint: 'se' });

    const system = provider.calls.messages[0].find(m => m.role === 'system').content;
    // Full SE systemPrompt is present (not just the one-line lens).
    expect(system).toContain('reference architecture');
    // MEDDPICC is framed as multi-lens, not AE-only.
    expect(system).toContain('MEDDPICC');
    // Each persona's move menu is listed.
    expect(system).toContain('moves:');
  });

  it('accepts the new SE technical moves and tags them through', async () => {
    for (const move of ['ProveIt', 'QuantifyTech']) {
      const provider = makeProvider('se', move);
      const engine = new CoachingEngine(provider);
      const nudge = await engine.nudge({}, { reason: 'moment', cue: 'api', category: 'integration', personaHint: 'se' });
      expect(nudge, `expected a nudge for move ${move}`).toBeTruthy();
      expect(nudge.type).toBe(move);
      expect(nudge.persona).toBe('se');
    }
  });
});

describe('SE voice: repetition guard rotates instead of fixating', () => {
  it('renders prior nudges as "move (persona): headline" so repeats are visible', async () => {
    const provider = makeProvider('ae', 'MultiThread');
    const engine = new CoachingEngine(provider);
    await engine.nudge({}, { reason: 'cadence', cue: null, category: null, personaHint: null });

    const recent = engine._recentHeadlines();
    expect(recent).toContain('MultiThread');
    expect(recent).toContain('(ae)');
  });

  it('lists under-served MEDDPICC criteria and flags the SE-ownable ones', () => {
    const engine = new CoachingEngine(makeProvider());
    const menu = engine._underservedCriteria({
      M: { label: 'Metrics', status: 'missing' },
      E: { label: 'Economic Buyer', status: 'confirmed' },
      D1: { label: 'Decision Criteria', status: 'partial' }
    });
    expect(menu).toContain('Metrics [M]');
    expect(menu).toContain('SE-ownable');
    expect(menu).toContain('Decision Criteria [D1]');
    // Confirmed criteria are dropped from the rotation menu.
    expect(menu).not.toContain('Economic Buyer');
  });

  it('injects the rotation menu into the user prompt when MEDDPICC is present', async () => {
    const provider = makeProvider('se');
    const engine = new CoachingEngine(provider);
    await engine.nudge(
      { meddpicc: { M: { label: 'Metrics', status: 'missing' } } },
      { reason: 'cadence', cue: null, category: null, personaHint: null }
    );
    const user = provider.calls.messages[0].find(m => m.role === 'user').content;
    expect(user).toContain('UNDER-SERVED CRITERIA');
    expect(user).toContain('Metrics [M]');
  });

  it('suppresses near-duplicate nudges in a short window', async () => {
    const provider = makeProviderSequence([
      {
        coach: true, confidence: 0.95, persona: 'se', move: 'Dig',
        signal: 'metrics not confirmed',
        headline: 'Clarify success metrics for collaboration',
        why: 'Understanding metrics is crucial for alignment.',
        say: 'What specific metrics will you use to measure success in our collaboration?',
        urgency: 'now'
      },
      {
        coach: true, confidence: 0.94, persona: 'se', move: 'Dig',
        signal: 'metrics not confirmed',
        headline: 'Explore success metrics for collaboration',
        why: 'Understanding metrics is crucial for alignment.',
        say: 'What specific metrics or KPIs would you like to track to measure our success together?',
        urgency: 'soon'
      }
    ]);
    const engine = new CoachingEngine(provider);
    const trigger = { reason: 'cadence', cue: null, category: null, personaHint: null };

    const first = await engine.nudge({}, trigger);
    const second = await engine.nudge({}, trigger);

    expect(first).toBeTruthy();
    expect(second).toBeNull();
  });

  it('allows a different move even within the dedup window', async () => {
    const provider = makeProviderSequence([
      {
        coach: true, confidence: 0.95, persona: 'se', move: 'Dig',
        signal: 'metrics not confirmed',
        headline: 'Clarify success metrics for collaboration',
        why: 'Understanding metrics is crucial for alignment.',
        say: 'What specific metrics will you use?',
        urgency: 'now'
      },
      {
        coach: true, confidence: 0.93, persona: 'ae', move: 'NextStep',
        signal: 'timeline unclear',
        headline: 'Lock in mutual next step',
        why: 'Concretize ownership and timeline before momentum fades.',
        say: 'Can we align on owners and timing for the next decision checkpoint?',
        urgency: 'soon'
      }
    ]);
    const engine = new CoachingEngine(provider);
    const trigger = { reason: 'cadence', cue: null, category: null, personaHint: null };

    const first = await engine.nudge({}, trigger);
    const second = await engine.nudge({}, trigger);

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(second.type).toBe('NextStep');
  });
});

describe('Playbook grounding', () => {
  const playbook = {
    role: 'Solution Engineer',
    company: { name: 'Contoso', description: 'A data + AI platform.' },
    products: ['Fabric'],
    personas: ['CISO'],
    outcomes: ['Cut pipeline latency 60%'],
    differentiators: ['Native governance'],
    competitors: ['Snowflake'],
    proofPoints: ['40% cost cut at Acme'],
    competitorTraps: [{ competitor: 'Snowflake', question: 'How do you govern models today?' }]
  };

  it('injects the playbook into the hot-lane nudge system prompt', async () => {
    const provider = makeProvider('se');
    const engine = new CoachingEngine(provider);
    await engine.nudge({ playbook }, { reason: 'moment', cue: 'api', category: 'integration', personaHint: 'se' });

    const system = provider.calls.messages[0].find(m => m.role === 'system').content;
    expect(system).toContain('PLAYBOOK');
    expect(system).toContain('Contoso');
    expect(system).toContain('Native governance');
    expect(system).toContain('40% cost cut at Acme');
    expect(system).toContain('How do you govern models today?');
  });

  it('adds nothing when no playbook is supplied', async () => {
    const provider = makeProvider('se');
    const engine = new CoachingEngine(provider);
    await engine.nudge({}, { reason: 'moment', cue: 'api', category: 'integration', personaHint: 'se' });
    const system = provider.calls.messages[0].find(m => m.role === 'system').content;
    expect(system).not.toContain('PLAYBOOK');
  });

  it('also grounds the slow-lane refresh prompt', async () => {
    const provider = makeProvider('ae');
    const engine = new CoachingEngine(provider);
    // refresh() returns questions; provider echo returns a nudge shape, so just
    // assert the prompt content that was sent.
    await engine.refresh({ playbook }).catch(() => {});
    const system = provider.calls.messages[0].find(m => m.role === 'user').content;
    expect(system).toContain('PLAYBOOK');
    expect(system).toContain('Contoso');
  });
});

describe('Coaching style (slow-lane only)', () => {
  const style = 'Be direct and concise. Never suggest discounting.';

  it('injects the coaching style into the slow-lane refresh prompt', async () => {
    const provider = makeProvider('ae');
    const engine = new CoachingEngine(provider);
    await engine.refresh({ coachingStyle: style }).catch(() => {});
    const user = provider.calls.messages[0].find(m => m.role === 'user').content;
    expect(user).toContain("REP'S COACHING PREFERENCES");
    expect(user).toContain('Never suggest discounting');
  });

  it('does NOT inject the coaching style into the hot-lane nudge prompt', async () => {
    const provider = makeProvider('se');
    const engine = new CoachingEngine(provider);
    await engine.nudge(
      { coachingStyle: style },
      { reason: 'moment', cue: 'api', category: 'integration', personaHint: 'se' }
    );
    const system = provider.calls.messages[0].find(m => m.role === 'system').content;
    const user = provider.calls.messages[0].find(m => m.role === 'user').content;
    expect(system).not.toContain("REP'S COACHING PREFERENCES");
    expect(user).not.toContain('Never suggest discounting');
  });

  it('adds nothing to refresh when no style is supplied', async () => {
    const provider = makeProvider('ae');
    const engine = new CoachingEngine(provider);
    await engine.refresh({}).catch(() => {});
    const user = provider.calls.messages[0].find(m => m.role === 'user').content;
    expect(user).not.toContain("REP'S COACHING PREFERENCES");
  });
});
