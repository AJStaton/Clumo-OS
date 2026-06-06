// Tests for server/analysis.js — formatSessionName + generateAnalysis (mocked provider).

const { formatSessionName, generateAnalysis } = require('../analysis.js');

describe('formatSessionName', () => {
  it('formats as "{3-word topic} dd/mm"', () => {
    const out = formatSessionName(
      { sessionMeta: { customer: 'Acme', topic: 'Platform demo discussion' } },
      new Date('2025-05-17T14:30:00')
    );
    expect(out).toBe('Platform demo discussion 17/05');
  });

  it('trims topic to at most 3 words', () => {
    const out = formatSessionName(
      { sessionMeta: { customer: 'Acme', topic: 'one two three four five' } },
      new Date('2025-06-06T10:00:00')
    );
    expect(out).toBe('one two three 06/06');
  });

  it('falls back to customer when topic is missing', () => {
    const out = formatSessionName(
      { sessionMeta: { customer: 'Acme Corp Limited Group' } },
      new Date('2025-05-01T10:00:00')
    );
    expect(out).toBe('Acme Corp Limited 01/05');
  });

  it('returns null when both topic and customer are missing', () => {
    expect(formatSessionName({ sessionMeta: {} }, new Date())).toBeNull();
  });

  it('returns null when only customer is "Unknown" and no topic', () => {
    expect(formatSessionName({ sessionMeta: { customer: 'Unknown' } }, new Date())).toBeNull();
  });

  it('returns null on malformed analysis (does not throw)', () => {
    expect(formatSessionName(null, new Date())).toBeNull();
    expect(formatSessionName(undefined, new Date())).toBeNull();
  });
});

describe('generateAnalysis', () => {
  const fixture = {
    fullTranscript: [{ text: 'Hello, I am Acme Corp.' }, { text: 'We need a platform.' }],
    suggestions: [
      { type: 'discovery', suggestion: { question: 'What is your budget?' } }
    ],
    meddpicc: {
      M: { label: 'Metrics', status: 'identified', evidence: ['$1M ARR target'] }
    }
  };

  it('returns null on empty transcript', async () => {
    const provider = { chatCompletion: vi.fn() };
    const out = await generateAnalysis('s1', { fullTranscript: [] }, provider);
    expect(out).toBeNull();
    expect(provider.chatCompletion).not.toHaveBeenCalled();
  });

  it('calls provider.chatCompletion and parses JSON', async () => {
    const json = '{"sessionMeta":{"customer":"Acme","topic":"Demo"},"callNotes":["a"]}';
    const provider = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [{ message: { content: json } }]
      })
    };
    const out = await generateAnalysis('s1', fixture, provider);
    expect(out.sessionMeta.customer).toBe('Acme');
    expect(provider.chatCompletion).toHaveBeenCalledOnce();
  });

  it('strips ```json code fences from response', async () => {
    const provider = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [{ message: { content: '```json\n{"sessionMeta":{"customer":"X","topic":"y"}}\n```' } }]
      })
    };
    const out = await generateAnalysis('s1', fixture, provider);
    expect(out.sessionMeta.customer).toBe('X');
  });

  it('extracts JSON via regex when surrounded by prose', async () => {
    const provider = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'Here you go: {"sessionMeta":{"customer":"Y","topic":"z"}} done.' } }]
      })
    };
    const out = await generateAnalysis('s1', fixture, provider);
    expect(out.sessionMeta.customer).toBe('Y');
  });

  it('throws when response has no parseable JSON', async () => {
    const provider = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'not json at all' } }]
      })
    };
    await expect(generateAnalysis('s1', fixture, provider)).rejects.toThrow();
  });
});
