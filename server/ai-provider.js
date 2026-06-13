// AI Provider abstraction for Clumo
// Supports Azure OpenAI and OpenAI with a unified interface

const WebSocket = require('ws');
const { getConfig, getSecureConfig, setConfig, setSecureConfig } = require('./db');

// Single source of truth for the live-transcription model. We standardised on
// gpt-4o-mini-transcribe (streaming partial deltas) and removed whisper-1
// entirely — see the Realtime Suggestions overhaul. Any provider can override
// per-config, but this is the default everywhere including managed mode.
const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';

class AzureOpenAIProvider {
  constructor(config) {
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.apiVersion = config.apiVersion || '2024-10-21';
    this.chatDeployment = config.chatDeployment;
    this.realtimeDeployment = config.realtimeDeployment;
    this.embeddingDeployment = config.embeddingDeployment;
    this.transcriptionModel = config.transcriptionModel || DEFAULT_TRANSCRIPTION_MODEL;
    this.client = null;
  }

  getTranscriptionModel() {
    return this.transcriptionModel;
  }

  getClient() {
    if (this.client) return this.client;
    const { AzureOpenAI } = require('openai');
    this.client = new AzureOpenAI({
      apiKey: this.apiKey,
      endpoint: this.endpoint,
      apiVersion: this.apiVersion,
      deployment: this.chatDeployment
    });
    return this.client;
  }

  async chatCompletion(messages, options = {}) {
    const client = this.getClient();
    return client.chat.completions.create({
      model: this.chatDeployment,
      messages,
      ...options
    });
  }

  createRealtimeWebSocket() {
    const host = this.endpoint.replace('https://', '').replace('http://', '').replace(/\/$/, '');
    const url = `wss://${host}/openai/realtime?api-version=${this.apiVersion}&deployment=${this.realtimeDeployment}&intent=transcription`;

    return new WebSocket(url, {
      headers: {
        'api-key': this.apiKey
      }
    });
  }

  async generateEmbedding(text) {
    const client = this.getClient();
    const input = Array.isArray(text) ? text : [text];
    const response = await client.embeddings.create({
      model: this.embeddingDeployment,
      input
    });
    return Array.isArray(text)
      ? response.data.map(d => d.embedding)
      : response.data[0].embedding;
  }

  async validateConfig() {
    try {
      const client = this.getClient();
      await client.chat.completions.create({
        model: this.chatDeployment,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1
      });
      return { valid: true };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }
}

class OpenAIProvider {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.chatModel = config.chatModel || 'gpt-4o-mini';
    this.realtimeModel = config.realtimeModel || 'gpt-realtime-mini';
    this.transcriptionModel = config.transcriptionModel || DEFAULT_TRANSCRIPTION_MODEL;
    this.client = null;
  }

  getTranscriptionModel() {
    return this.transcriptionModel;
  }

  getClient() {
    if (this.client) return this.client;
    const OpenAI = require('openai');
    this.client = new OpenAI({ apiKey: this.apiKey });
    return this.client;
  }

  async chatCompletion(messages, options = {}) {
    const client = this.getClient();
    return client.chat.completions.create({
      model: this.chatModel,
      messages,
      ...options
    });
  }

  createRealtimeWebSocket() {
    const url = `wss://api.openai.com/v1/realtime?model=${this.realtimeModel}&intent=transcription`;

    return new WebSocket(url, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });
  }

  async generateEmbedding(text) {
    const client = this.getClient();
    const input = Array.isArray(text) ? text : [text];
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input
    });
    return Array.isArray(text)
      ? response.data.map(d => d.embedding)
      : response.data[0].embedding;
  }

  async validateConfig() {
    try {
      const client = this.getClient();
      await client.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1
      });
      return { valid: true };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }
}

class ManagedProvider {
  constructor(config) {
    // Azure OpenAI endpoint
    this.baseUrl = (config.endpoint || '').replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.apiVersion = config.apiVersion || '2024-10-21';
    this.chatModel = config.chatModel || 'gpt-4o-mini';
    this.realtimeModel = config.realtimeModel || 'gpt-realtime-mini';
    this.embeddingModel = config.embeddingModel || 'text-embedding-ada-002';
    this.transcriptionModel = config.transcriptionModel || DEFAULT_TRANSCRIPTION_MODEL;
    this.client = null;
  }

  getTranscriptionModel() {
    return this.transcriptionModel;
  }

  getClient() {
    if (this.client) return this.client;
    const { AzureOpenAI } = require('openai');
    this.client = new AzureOpenAI({
      endpoint: this.baseUrl,
      apiKey: this.apiKey,
      apiVersion: this.apiVersion,
      deployment: this.chatModel
    });
    return this.client;
  }

  async chatCompletion(messages, options = {}) {
    const client = this.getClient();
    return client.chat.completions.create({
      model: this.chatModel,
      messages,
      ...options
    });
  }

  createRealtimeWebSocket() {
    const host = this.baseUrl.replace('https://', '').replace('http://', '');
    // Realtime API requires a preview api-version
    const realtimeApiVersion = '2024-10-01-preview';
    const url = `wss://${host}/openai/realtime?api-version=${realtimeApiVersion}&deployment=${this.realtimeModel}&intent=transcription`;
    return new WebSocket(url, {
      headers: { 'api-key': this.apiKey }
    });
  }

  async generateEmbedding(text) {
    // Use a separate client for embeddings with the correct deployment
    if (!this._embeddingClient) {
      const { AzureOpenAI } = require('openai');
      this._embeddingClient = new AzureOpenAI({
        endpoint: this.baseUrl,
        apiKey: this.apiKey,
        apiVersion: this.apiVersion,
        deployment: this.embeddingModel
      });
    }
    const input = Array.isArray(text) ? text : [text];
    const response = await this._embeddingClient.embeddings.create({
      model: this.embeddingModel,
      input
    });
    return Array.isArray(text)
      ? response.data.map(d => d.embedding)
      : response.data[0].embedding;
  }

  async validateConfig() {
    try {
      const client = this.getClient();
      await client.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1
      });
      return { valid: true };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }
}

// --- Factory: load provider from saved config ---

function loadProvider() {
  // Test hook: when CLUMO_FAKE_PROVIDER=1 is set, return a deterministic
  // in-memory provider so E2E and Electron GUI tests can run without any
  // real API key, network call, or cost. Production code paths are
  // identical — this hook lives only at the factory boundary.
  if (process.env.CLUMO_FAKE_PROVIDER === '1') {
    return require('./tests/fixtures/fake-provider');
  }

  const providerMode = getConfig('provider_mode');

  // In managed mode, use ManagedProvider for all AI operations
  if (providerMode === 'managed') {
    const managedEndpoint = getSecureConfig('managed_endpoint');
    const managedKey = getSecureConfig('managed_api_key');
    if (managedEndpoint && managedKey) {
      return new ManagedProvider({
        endpoint: managedEndpoint,
        apiKey: managedKey,
        chatModel: getConfig('managed_chat_model') || 'gpt-4o-mini',
        realtimeModel: getConfig('managed_realtime_model') || 'gpt-realtime-mini',
        embeddingModel: getConfig('managed_embedding_model') || 'text-embedding-ada-002',
        transcriptionModel: getConfig('transcription_model') || getConfig('managed_transcription_model') || DEFAULT_TRANSCRIPTION_MODEL
      });
    }
    // Fall through to BYOK check
  }

  const providerType = getConfig('ai_provider');
  if (!providerType) return null;

  if (providerType === 'azure') {
    const endpoint = getConfig('azure_endpoint');
    const apiKey = getSecureConfig('azure_api_key');
    const apiVersion = getConfig('azure_api_version');
    const chatDeployment = getConfig('azure_chat_deployment');
    const realtimeDeployment = getConfig('azure_realtime_deployment');
    const embeddingDeployment = getConfig('azure_embedding_deployment');

    if (!endpoint || !apiKey || !chatDeployment || !realtimeDeployment) return null;

    return new AzureOpenAIProvider({
      endpoint, apiKey, apiVersion, chatDeployment, realtimeDeployment, embeddingDeployment,
      transcriptionModel: getConfig('transcription_model') || DEFAULT_TRANSCRIPTION_MODEL
    });
  }

  if (providerType === 'openai') {
    const apiKey = getSecureConfig('openai_api_key');
    const chatModel = getConfig('openai_chat_model');
    const realtimeModel = getConfig('openai_realtime_model');

    if (!apiKey) return null;

    return new OpenAIProvider({
      apiKey,
      chatModel: chatModel || 'gpt-4o-mini',
      realtimeModel: realtimeModel || 'gpt-realtime-mini',
      transcriptionModel: getConfig('transcription_model') || DEFAULT_TRANSCRIPTION_MODEL
    });
  }

  return null;
}

// --- Load embedding provider based on provider_mode ---

function loadEmbeddingProvider() {
  const mode = getConfig('provider_mode');
  if (mode === 'managed') {
    const managedEndpoint = getSecureConfig('managed_endpoint');
    const managedKey = getSecureConfig('managed_api_key');
    if (managedEndpoint && managedKey) {
      return new ManagedProvider({
        endpoint: managedEndpoint,
        apiKey: managedKey,
        chatModel: getConfig('managed_chat_model') || 'gpt-4o-mini',
        realtimeModel: getConfig('managed_realtime_model') || 'gpt-realtime-mini',
        embeddingModel: getConfig('managed_embedding_model') || 'text-embedding-ada-002',
        transcriptionModel: getConfig('transcription_model') || getConfig('managed_transcription_model') || DEFAULT_TRANSCRIPTION_MODEL
      });
    }
    console.warn('[AI Provider] Managed mode selected but credentials not found');
    return null;
  }
  // BYOK mode: use existing provider
  return loadProvider();
}

// --- Seed managed credentials into DB (called during setup or first run) ---

function seedManagedCredentials(endpoint, apiKey, models = {}) {
  setSecureConfig('managed_endpoint', endpoint);
  setSecureConfig('managed_api_key', apiKey);
  if (models.chatModel) setConfig('managed_chat_model', models.chatModel);
  if (models.realtimeModel) setConfig('managed_realtime_model', models.realtimeModel);
  if (models.embeddingModel) setConfig('managed_embedding_model', models.embeddingModel);
  if (models.transcriptionModel) setConfig('managed_transcription_model', models.transcriptionModel);
}

// --- Save provider config ---

function saveProviderConfig(providerType, config) {
  setConfig('ai_provider', providerType);

  if (providerType === 'azure') {
    setConfig('azure_endpoint', config.endpoint);
    if (config.apiKey) {
      setSecureConfig('azure_api_key', config.apiKey);
    }
    setConfig('azure_api_version', config.apiVersion || '2024-10-21');
    setConfig('azure_chat_deployment', config.chatDeployment);
    setConfig('azure_realtime_deployment', config.realtimeDeployment);
    setConfig('azure_embedding_deployment', config.embeddingDeployment);
  } else if (providerType === 'openai') {
    if (config.apiKey) {
      setSecureConfig('openai_api_key', config.apiKey);
    }
    setConfig('openai_chat_model', config.chatModel || 'gpt-4o-mini');
    setConfig('openai_realtime_model', config.realtimeModel || 'gpt-realtime-mini');
  }
}

module.exports = {
  AzureOpenAIProvider,
  OpenAIProvider,
  ManagedProvider,
  loadProvider,
  loadEmbeddingProvider,
  saveProviderConfig,
  seedManagedCredentials,
  DEFAULT_TRANSCRIPTION_MODEL
};
