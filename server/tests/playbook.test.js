// Tests for server/playbook.js — assemble / normalize / render / isEmpty.
// Vitest globals are enabled repo-wide; do NOT import from 'vitest'.

const {
  emptyPlaybook,
  assemblePlaybook,
  normalizePlaybook,
  isEmptyPlaybook,
  renderPlaybook
} = require('../playbook');

const PROFILE = {
  role: 'Solution Engineer',
  focusProducts: ['Azure OpenAI', 'Fabric'],
  personas: ['CISO', 'VP Engineering'],
  competitors: ['Snowflake', 'Databricks']
};

const COMPANY = {
  companyName: 'Contoso',
  productDescription: 'A unified data + AI platform.',
  painPointsSolved: ['slow data pipelines'],
  valuePropositions: ['sub-50ms queries'],
  differentiators: ['native governance'],
  keyStats: ['40% cost cut at Acme'],
  customerStories: ['Acme migrated in 6 weeks'],
  competitors: []
};

describe('assemblePlaybook', () => {
  it('builds a draft from the seller profile and company analysis', () => {
    const pb = assemblePlaybook(PROFILE, COMPANY);
    expect(pb.role).toBe('Solution Engineer');
    expect(pb.company).toEqual({ name: 'Contoso', description: 'A unified data + AI platform.' });
    expect(pb.products).toEqual(['Azure OpenAI', 'Fabric']);
    expect(pb.personas).toEqual(['CISO', 'VP Engineering']);
    expect(pb.competitors).toEqual(['Snowflake', 'Databricks']);
    expect(pb.source).toBe('draft');
  });

  it('merges pains + value props into outcomes, and stats + stories into proof', () => {
    const pb = assemblePlaybook(PROFILE, COMPANY);
    expect(pb.outcomes).toEqual(['slow data pipelines', 'sub-50ms queries']);
    expect(pb.proofPoints).toEqual(['40% cost cut at Acme', 'Acme migrated in 6 weeks']);
  });

  it('seeds one empty trap per competitor for the rep to fill', () => {
    const pb = assemblePlaybook(PROFILE, COMPANY);
    expect(pb.competitorTraps).toEqual([
      { competitor: 'Snowflake', question: '' },
      { competitor: 'Databricks', question: '' }
    ]);
  });

  it('does not throw on empty/missing inputs', () => {
    expect(() => assemblePlaybook()).not.toThrow();
    const pb = assemblePlaybook({}, {});
    expect(isEmptyPlaybook(pb)).toBe(true);
  });
});

describe('normalizePlaybook', () => {
  it('trims, de-dupes, drops empties and stamps updatedAt + source', () => {
    const pb = normalizePlaybook({
      role: '  Solution Engineer  ',
      company: { name: ' Contoso ', description: '' },
      products: ['Fabric', 'fabric', '', '  Azure  '],
      personas: [],
      outcomes: ['Cut latency 60%'],
      differentiators: [],
      competitors: ['Snowflake'],
      proofPoints: [],
      competitorTraps: [
        { competitor: 'Snowflake', question: 'How do you govern models?' },
        { competitor: '', question: 'dropped' },
        { competitor: 'Snowflake', question: 'duplicate dropped' }
      ]
    });
    expect(pb.role).toBe('Solution Engineer');
    expect(pb.company.name).toBe('Contoso');
    expect(pb.products).toEqual(['Fabric', 'Azure']); // case-insensitive de-dupe + trim
    expect(pb.competitorTraps).toEqual([{ competitor: 'Snowflake', question: 'How do you govern models?' }]);
    expect(pb.source).toBe('edited');
    expect(typeof pb.updatedAt).toBe('string');
  });

  it('never trusts client shape (junk in -> safe empty out)', () => {
    const pb = normalizePlaybook({ role: 42, products: 'not-an-array', company: null, competitorTraps: 'nope' });
    expect(pb.role).toBe('');
    expect(pb.products).toEqual([]);
    expect(pb.company).toEqual({ name: '', description: '' });
    expect(pb.competitorTraps).toEqual([]);
  });

  it('honours an explicit draft source', () => {
    expect(normalizePlaybook({ role: 'x' }, { source: 'draft' }).source).toBe('draft');
  });
});

describe('isEmptyPlaybook', () => {
  it('is true for empty/undefined and false once any field is set', () => {
    expect(isEmptyPlaybook(emptyPlaybook())).toBe(true);
    expect(isEmptyPlaybook(undefined)).toBe(true);
    expect(isEmptyPlaybook({ ...emptyPlaybook(), role: 'SE' })).toBe(false);
    expect(isEmptyPlaybook({ ...emptyPlaybook(), competitorTraps: [{ competitor: 'X', question: '' }] })).toBe(false);
  });
});

describe('renderPlaybook', () => {
  it('returns an empty string for an empty playbook', () => {
    expect(renderPlaybook(emptyPlaybook())).toBe('');
    expect(renderPlaybook(null)).toBe('');
  });

  it('renders only populated sections with a PLAYBOOK header', () => {
    const pb = normalizePlaybook(assemblePlaybook(PROFILE, COMPANY));
    const out = renderPlaybook(pb);
    expect(out).toContain('PLAYBOOK');
    expect(out).toContain("Rep's role: Solution Engineer");
    expect(out).toContain('Company: Contoso — A unified data + AI platform.');
    expect(out).toContain('Products they sell: Azure OpenAI, Fabric');
    expect(out).toContain('native governance');
    // No trap questions filled yet -> falls back to a plain competitor list, no bullet traps.
    expect(out).toContain('Competitors to differentiate against: Snowflake, Databricks');
    expect(out).not.toContain('  * Snowflake —');
  });

  it('renders competitor traps once a question is filled in', () => {
    const pb = normalizePlaybook({
      ...assemblePlaybook(PROFILE, COMPANY),
      competitorTraps: [{ competitor: 'Snowflake', question: 'How do you govern models today?' }]
    });
    const out = renderPlaybook(pb);
    expect(out).toContain('* Snowflake — How do you govern models today?');
  });
});
