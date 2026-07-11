// Integration test: Azure OpenAI provider chat completion via Polly.js recording.
//
// To re-record:
//   POLLY_MODE=record AZURE_OPENAI_ENDPOINT=... AZURE_OPENAI_KEY=... AZURE_OPENAI_DEPLOYMENT=...
//     npx vitest run tests/integration/ai-provider.azure.test.js

const { startPolly } = require('../support/polly');
const { AzureOpenAIProvider } = require('../../ai-provider');

describe('AzureOpenAIProvider — integration (Polly recordings)', () => {
  let polly;

  beforeEach(() => {
    polly = startPolly('azure-chat-suggestion');
  });

  afterEach(async () => {
    if (polly) await polly.stop();
  });

  it('chatCompletion returns parsed Azure response shape', async () => {
    const provider = new AzureOpenAIProvider({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT || 'https://fake-azure-endpoint.openai.azure.com',
      apiKey: process.env.AZURE_OPENAI_KEY || 'fake-azure-key-for-replay',
      apiVersion: '2024-10-21',
      chatDeployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini',
      realtimeDeployment: 'gpt-realtime-mini'
    });

    const result = await provider.chatCompletion(
      [{ role: 'user', content: 'Reply with the single word: pong' }],
      { max_tokens: 5, temperature: 0 }
    );

    expect(result).toHaveProperty('choices');
    expect(result.choices[0]).toHaveProperty('message');
    expect(result.choices[0].message).toHaveProperty('content');
    expect(typeof result.choices[0].message.content).toBe('string');
    expect(result).toHaveProperty('usage');
    expect(result.usage).toHaveProperty('total_tokens');
  });
});
