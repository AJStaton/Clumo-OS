// Live connectivity test for Managed Provider (Azure OpenAI)
// Tests chat, embeddings, and realtime WebSocket endpoints.
//
// Run with:
//   npx vitest run tests/integration/managed-provider.live.test.js
//
// Requires managed-credentials.local.js to be configured with valid credentials.
// This test hits REAL APIs — it is NOT recorded/replayed.

const path = require('path');
const fs = require('fs');

const credsPath = path.join(__dirname, '../../managed-credentials.local.js');
const hasCredentials = fs.existsSync(credsPath);

const describeIf = hasCredentials ? describe : describe.skip;

describeIf('ManagedProvider — live connectivity', () => {
  let ManagedProvider;
  let creds;

  beforeAll(() => {
    ManagedProvider = require('../../ai-provider').ManagedProvider;
    creds = require('../../managed-credentials.local.js');
  });

  it('chat completion responds with valid message', async () => {
    const provider = new ManagedProvider({
      endpoint: creds.endpoint,
      apiKey: creds.apiKey,
      chatModel: creds.chatModel,
      realtimeModel: creds.realtimeModel,
      embeddingModel: creds.embeddingModel
    });

    const result = await provider.chatCompletion(
      [{ role: 'user', content: 'Reply with the single word: pong' }],
      { max_tokens: 5, temperature: 0 }
    );

    expect(result).toHaveProperty('choices');
    expect(result.choices.length).toBeGreaterThan(0);
    expect(result.choices[0].message.content.toLowerCase()).toContain('pong');
  }, 15000);

  it('embeddings return a vector of correct dimensions', async () => {
    const provider = new ManagedProvider({
      endpoint: creds.endpoint,
      apiKey: creds.apiKey,
      chatModel: creds.chatModel,
      realtimeModel: creds.realtimeModel,
      embeddingModel: creds.embeddingModel
    });

    const embedding = await provider.generateEmbedding('test input');

    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBeGreaterThan(0);
    // text-embedding-3-small returns 1536 dimensions
    expect(embedding.length).toBe(1536);
    expect(typeof embedding[0]).toBe('number');
  }, 15000);

  it('embeddings work with batch input', async () => {
    const provider = new ManagedProvider({
      endpoint: creds.endpoint,
      apiKey: creds.apiKey,
      chatModel: creds.chatModel,
      realtimeModel: creds.realtimeModel,
      embeddingModel: creds.embeddingModel
    });

    const embeddings = await provider.generateEmbedding(['hello', 'world']);

    expect(Array.isArray(embeddings)).toBe(true);
    expect(embeddings.length).toBe(2);
    expect(embeddings[0].length).toBe(1536);
    expect(embeddings[1].length).toBe(1536);
  }, 15000);

  it('realtime WebSocket connects successfully', async () => {
    const provider = new ManagedProvider({
      endpoint: creds.endpoint,
      apiKey: creds.apiKey,
      chatModel: creds.chatModel,
      realtimeModel: creds.realtimeModel,
      embeddingModel: creds.embeddingModel
    });

    const ws = provider.createRealtimeWebSocket();

    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket connection timed out'));
      }, 10000);

      ws.on('open', () => {
        clearTimeout(timeout);
        // Send a session update to confirm two-way communication
        ws.send(JSON.stringify({
          type: 'session.update',
          session: { modalities: ['text'], instructions: 'Say hi' }
        }));
      });

      ws.on('message', (data) => {
        const msg = JSON.parse(data);
        if (msg.type === 'session.created' || msg.type === 'session.updated') {
          clearTimeout(timeout);
          ws.close();
          resolve(msg);
        }
      });

      ws.on('error', (e) => {
        clearTimeout(timeout);
        reject(e);
      });
    });

    expect(result).toHaveProperty('type');
    expect(['session.created', 'session.updated']).toContain(result.type);
  }, 15000);

  it('validateConfig returns valid: true', async () => {
    const provider = new ManagedProvider({
      endpoint: creds.endpoint,
      apiKey: creds.apiKey,
      chatModel: creds.chatModel,
      realtimeModel: creds.realtimeModel,
      embeddingModel: creds.embeddingModel
    });

    const result = await provider.validateConfig();
    expect(result).toEqual({ valid: true });
  }, 15000);
});
