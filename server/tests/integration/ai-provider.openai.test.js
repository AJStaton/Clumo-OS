// Integration test: OpenAI provider chat completion via Polly.js recording.
//
// Replay mode (default): replays fixtures/openai-chat-suggestion_*.har.
// To re-record:
//   POLLY_MODE=record OPENAI_API_KEY=sk-... npx vitest run tests/integration/ai-provider.openai.test.js
// The saved fixture has the api key redacted by the support helper.

const { startPolly } = require('../support/polly');
const { OpenAIProvider } = require('../../ai-provider');

describe('OpenAIProvider — integration (Polly recordings)', () => {
  let polly;

  beforeEach(() => {
    polly = startPolly('openai-chat-suggestion');
  });

  afterEach(async () => {
    if (polly) await polly.stop();
  });

  it('chatCompletion returns parsed OpenAI response shape', async () => {
    const provider = new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY || 'sk-test-FAKE-KEY-FOR-REPLAY',
      chatModel: 'gpt-4o-mini'
    });

    const result = await provider.chatCompletion(
      [{ role: 'user', content: 'Reply with the single word: pong' }],
      { max_tokens: 5, temperature: 0 }
    );

    // Shape assertions — these are what real production code relies on.
    expect(result).toHaveProperty('choices');
    expect(Array.isArray(result.choices)).toBe(true);
    expect(result.choices.length).toBeGreaterThan(0);
    expect(result.choices[0]).toHaveProperty('message');
    expect(result.choices[0].message).toHaveProperty('content');
    expect(typeof result.choices[0].message.content).toBe('string');
    expect(result).toHaveProperty('usage');
    expect(result.usage).toHaveProperty('total_tokens');
  });
});
