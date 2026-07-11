// Deterministic in-memory AI provider for tests.
// Activated by setting CLUMO_FAKE_PROVIDER=1 in the server environment.
// Implements the same interface as AzureOpenAIProvider / OpenAIProvider —
// anything tests need to exercise the real production
// code path through `loadProvider()` without spending a cent.
//
// Used by:
//   - Playwright Electron specs (electron/main.js sets the env var when --test)
//   - Any future E2E that needs the server to "work" end-to-end

const WebSocket = require('ws');

const CANNED_CHAT_RESPONSE = {
  id: 'chatcmpl-fake',
  object: 'chat.completion',
  created: 0,
  model: 'fake-model',
  choices: [{
    index: 0,
    finish_reason: 'stop',
    message: { role: 'assistant', content: 'This is a canned response from the fake provider.' }
  }],
  usage: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 }
};

const CANNED_EMBEDDING = new Array(1536).fill(0).map((_, i) => Math.sin(i) * 0.01);

class FakeRealtimeWebSocket {
  // Minimal stand-in: emits the events the WS handler expects, never
  // touches the network. Tests can subclass to assert send() calls.
  constructor() {
    this.readyState = 0;
    setImmediate(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }
  send() { /* swallow */ }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  on(event, cb) {
    if (event === 'open') this.onopen = cb;
    if (event === 'close') this.onclose = cb;
    if (event === 'message') this.onmessage = cb;
    if (event === 'error') this.onerror = cb;
  }
  removeAllListeners() { /* no-op */ }
}

const fakeProvider = {
  // Mirror the interface of the real providers.
  isFake: true,

  async chatCompletion(messages, _options = {}) {
    // Optionally echo the last user message into the canned response so
    // tests can assert that input got through.
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const echo = lastUser ? `Echo: ${lastUser.content?.slice(0, 80)}` : 'no input';
    return {
      ...CANNED_CHAT_RESPONSE,
      choices: [{
        ...CANNED_CHAT_RESPONSE.choices[0],
        message: { role: 'assistant', content: echo }
      }]
    };
  },

  createRealtimeWebSocket() {
    return new FakeRealtimeWebSocket();
  },

  async generateEmbedding(text) {
    if (Array.isArray(text)) return text.map(() => CANNED_EMBEDDING.slice());
    return CANNED_EMBEDDING.slice();
  },

  async validateConfig() {
    return { valid: true };
  }
};

module.exports = fakeProvider;
module.exports.FakeRealtimeWebSocket = FakeRealtimeWebSocket;
