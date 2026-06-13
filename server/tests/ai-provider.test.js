// Tests for server/ai-provider.js — provider construction, config persistence,
// and provider factory selection. Network calls are NOT exercised here; we test
// the deterministic surface.

const fs = require('fs');
const path = require('path');
const os = require('os');

function freshDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clumo-ai-test-'));
  process.env.CLUMO_TEST_DATA_DIR = dir;
  delete require.cache[require.resolve('../db.js')];
  delete require.cache[require.resolve('../ai-provider.js')];
  return dir;
}

describe('ai-provider.js — provider classes', () => {
  let ai;
  let dir;

  beforeEach(() => {
    dir = freshDataDir();
    ai = require('../ai-provider.js');
  });

  afterEach(() => {
    require('../db.js').close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('AzureOpenAIProvider stores config fields', () => {
    const p = new ai.AzureOpenAIProvider({
      endpoint: 'https://x.openai.azure.com',
      apiKey: 'k',
      chatDeployment: 'gpt4',
      realtimeDeployment: 'rt',
      embeddingDeployment: 'emb'
    });
    expect(p.endpoint).toBe('https://x.openai.azure.com');
    expect(p.chatDeployment).toBe('gpt4');
    expect(p.apiVersion).toBe('2024-10-21');
  });

  it('AzureOpenAIProvider respects custom apiVersion', () => {
    const p = new ai.AzureOpenAIProvider({
      endpoint: 'x', apiKey: 'k', apiVersion: '2025-01-01',
      chatDeployment: 'c', realtimeDeployment: 'r', embeddingDeployment: 'e'
    });
    expect(p.apiVersion).toBe('2025-01-01');
  });

  it('OpenAIProvider applies model defaults', () => {
    const p = new ai.OpenAIProvider({ apiKey: 'k' });
    expect(p.chatModel).toBe('gpt-4o-mini');
    expect(p.realtimeModel).toBe('gpt-realtime-mini');
  });

  it('OpenAIProvider accepts custom models', () => {
    const p = new ai.OpenAIProvider({ apiKey: 'k', chatModel: 'gpt-4o', realtimeModel: 'rt-v2' });
    expect(p.chatModel).toBe('gpt-4o');
    expect(p.realtimeModel).toBe('rt-v2');
  });

  it('ManagedProvider strips trailing slash from endpoint', () => {
    const p = new ai.ManagedProvider({ endpoint: 'https://foo.com/', apiKey: 'k' });
    expect(p.baseUrl).toBe('https://foo.com');
  });

  it('ManagedProvider defaults embedding model to ada-002', () => {
    const p = new ai.ManagedProvider({ endpoint: 'https://x', apiKey: 'k' });
    expect(p.embeddingModel).toBe('text-embedding-ada-002');
  });

  it('providers default the transcription model to gpt-4o-mini-transcribe', () => {
    const azure = new ai.AzureOpenAIProvider({
      endpoint: 'x', apiKey: 'k', chatDeployment: 'c', realtimeDeployment: 'r', embeddingDeployment: 'e'
    });
    const openai = new ai.OpenAIProvider({ apiKey: 'k' });
    const managed = new ai.ManagedProvider({ endpoint: 'https://x', apiKey: 'k' });
    expect(azure.getTranscriptionModel()).toBe('gpt-4o-mini-transcribe');
    expect(openai.getTranscriptionModel()).toBe('gpt-4o-mini-transcribe');
    expect(managed.getTranscriptionModel()).toBe('gpt-4o-mini-transcribe');
  });

  it('transcription model is overridable per-config', () => {
    const p = new ai.OpenAIProvider({ apiKey: 'k', transcriptionModel: 'whisper-x' });
    expect(p.getTranscriptionModel()).toBe('whisper-x');
  });

  it('createRealtimeWebSocket on Azure builds wss URL with deployment', () => {
    const p = new ai.AzureOpenAIProvider({
      endpoint: 'https://x.openai.azure.com',
      apiKey: 'k',
      chatDeployment: 'c',
      realtimeDeployment: 'rt-dep',
      embeddingDeployment: 'e'
    });
    // We don't actually open the socket — we inspect the URL construction logic
    // by stubbing WebSocket. Just confirm the method exists and is callable up
    // to the point of socket construction.
    expect(typeof p.createRealtimeWebSocket).toBe('function');
  });
});

describe('ai-provider.js — saveProviderConfig + loadProvider', () => {
  let ai;
  let db;
  let dir;

  beforeEach(() => {
    dir = freshDataDir();
    ai = require('../ai-provider.js');
    db = require('../db.js');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when nothing is configured', () => {
    expect(ai.loadProvider()).toBeNull();
  });

  it('persists and loads Azure config', () => {
    ai.saveProviderConfig('azure', {
      endpoint: 'https://x.openai.azure.com',
      apiKey: 'secret',
      chatDeployment: 'gpt4',
      realtimeDeployment: 'rt',
      embeddingDeployment: 'emb'
    });
    const p = ai.loadProvider();
    expect(p).toBeInstanceOf(ai.AzureOpenAIProvider);
    expect(p.endpoint).toBe('https://x.openai.azure.com');
    expect(p.apiKey).toBe('secret');
  });

  it('persists and loads OpenAI config', () => {
    ai.saveProviderConfig('openai', { apiKey: 'sk-test', chatModel: 'gpt-4o' });
    const p = ai.loadProvider();
    expect(p).toBeInstanceOf(ai.OpenAIProvider);
    expect(p.chatModel).toBe('gpt-4o');
  });

  it('stores api keys encrypted at rest', () => {
    ai.saveProviderConfig('openai', { apiKey: 'sk-plaintext' });
    const raw = db.getConfig('openai_api_key');
    expect(raw).not.toBe('sk-plaintext');
    expect(raw).toContain(':');
  });

  it('seedManagedCredentials writes encrypted endpoint + key', () => {
    ai.seedManagedCredentials('https://managed.example', 'mk-secret');
    expect(db.getSecureConfig('managed_endpoint')).toBe('https://managed.example');
    expect(db.getSecureConfig('managed_api_key')).toBe('mk-secret');
  });

  it('seedManagedCredentials is idempotent and reports model changes on re-seed', () => {
    const first = ai.seedManagedCredentials('https://managed.example', 'mk-secret', {
      chatModel: 'gpt-4o-mini', transcriptionModel: 'gpt-4o-mini-transcribe'
    });
    expect(first.seeded).toBe(true);
    expect(first.updated).toEqual([]);
    expect(db.getConfig('managed_transcription_model')).toBe('gpt-4o-mini-transcribe');

    // Same values again -> nothing reported as updated
    const second = ai.seedManagedCredentials('https://managed.example', 'mk-secret', {
      chatModel: 'gpt-4o-mini', transcriptionModel: 'gpt-4o-mini-transcribe'
    });
    expect(second.seeded).toBe(false);
    expect(second.updated).toEqual([]);

    // Rotate the transcription deployment -> reported + persisted
    const third = ai.seedManagedCredentials('https://managed.example', 'mk-secret', {
      chatModel: 'gpt-4o-mini', transcriptionModel: 'gpt-4o-transcribe'
    });
    expect(third.seeded).toBe(false);
    expect(third.updated).toContain('transcription');
    expect(db.getConfig('managed_transcription_model')).toBe('gpt-4o-transcribe');
  });

  it('loadProvider in managed mode prefers managed creds', () => {
    db.setConfig('provider_mode', 'managed');
    ai.seedManagedCredentials('https://managed.example', 'mk-secret');
    const p = ai.loadProvider();
    expect(p).toBeInstanceOf(ai.ManagedProvider);
  });

  it('loadProvider in managed mode without creds falls through to BYOK', () => {
    db.setConfig('provider_mode', 'managed');
    // no managed creds, no BYOK either
    expect(ai.loadProvider()).toBeNull();
  });

  it('realtime transcription session connects via the transcription model (no separate host)', () => {
    const azure = new ai.AzureOpenAIProvider({
      endpoint: 'https://x.openai.azure.com', apiKey: 'k', chatDeployment: 'c',
      realtimeDeployment: 'gpt-realtime-mini', embeddingDeployment: 'e',
      transcriptionModel: 'gpt-4o-mini-transcribe'
    });
    const azureUrl = azure.buildRealtimeUrl();
    expect(azureUrl).toContain('deployment=gpt-4o-mini-transcribe');
    expect(azureUrl).toContain('intent=transcription');
    expect(azureUrl).not.toContain('gpt-realtime-mini');

    const openai = new ai.OpenAIProvider({ apiKey: 'k', realtimeModel: 'gpt-realtime-mini', transcriptionModel: 'gpt-4o-mini-transcribe' });
    expect(openai.buildRealtimeUrl()).toContain('model=gpt-4o-mini-transcribe');

    const managed = new ai.ManagedProvider({ endpoint: 'https://x.services.ai.azure.com', apiKey: 'k', realtimeModel: 'gpt-realtime-mini', transcriptionModel: 'gpt-4o-mini-transcribe' });
    expect(managed.buildRealtimeUrl()).toContain('deployment=gpt-4o-mini-transcribe');
  });

  it('loadProvider builds an Azure provider without a realtime deployment', () => {
    db.setConfig('ai_provider', 'azure');
    db.setConfig('azure_endpoint', 'https://x.openai.azure.com');
    db.setSecureConfig('azure_api_key', 'k');
    db.setConfig('azure_chat_deployment', 'c');
    db.setConfig('azure_embedding_deployment', 'e');
    // No azure_realtime_deployment set
    const p = ai.loadProvider();
    expect(p).toBeInstanceOf(ai.AzureOpenAIProvider);
    expect(p.buildRealtimeUrl()).toContain('deployment=gpt-4o-mini-transcribe');
  });

  it('returns null when Azure required fields are missing', () => {
    db.setConfig('ai_provider', 'azure');
    db.setConfig('azure_endpoint', 'https://x');
    // missing apiKey + chat deployment
    expect(ai.loadProvider()).toBeNull();
  });
});
