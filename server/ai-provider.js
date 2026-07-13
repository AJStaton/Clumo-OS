// AI Provider abstraction for Clumo
// Supports Azure OpenAI and OpenAI with a unified interface

const WebSocket = require('ws');
const { getConfig, getSecureConfig, setConfig, setSecureConfig } = require('./db');

// Single source of truth for the live-transcription model. We standardised on
// gpt-4o-mini-transcribe (streaming partial deltas) and removed whisper-1
// entirely — see the Realtime Suggestions overhaul. Any provider can override
// per-config, but this is the default everywhere.
const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';
const AZURE_CHAT_EMBEDDINGS_API_VERSIONS = [
  { version: '2024-10-21', lifecycle: 'ga', status: 'active', default: true },
  { version: '2025-04-01-preview', lifecycle: 'preview', status: 'active' }
];
const AZURE_REALTIME_PREVIEW_API_VERSIONS = [
  { version: '2025-04-01-preview', lifecycle: 'preview', status: 'active', default: true }
];
const API_VERSION_FORMAT = /^\d{4}-\d{2}-\d{2}(?:-preview)?$/;
const DEFAULT_AZURE_API_VERSION =
  AZURE_CHAT_EMBEDDINGS_API_VERSIONS.find(v => v.default)?.version || '2024-10-21';
const DEFAULT_AZURE_REALTIME_API_VERSION =
  AZURE_REALTIME_PREVIEW_API_VERSIONS.find(v => v.default)?.version || '2025-04-01-preview';

function getAzureModelApiVersionSupport() {
  return {
    chatEmbeddings: AZURE_CHAT_EMBEDDINGS_API_VERSIONS.map(v => ({ ...v })),
    realtime: {
      preview: AZURE_REALTIME_PREVIEW_API_VERSIONS.map(v => ({ ...v })),
      ga: {
        route: '/openai/v1/realtime',
        status: 'active',
        notes: 'GA realtime route uses a fixed v1 path (no api-version query parameter).'
      }
    },
    defaults: {
      chatEmbeddings: DEFAULT_AZURE_API_VERSION,
      realtimePreview: DEFAULT_AZURE_REALTIME_API_VERSION
    }
  };
}

function normalizeAzureEndpoint(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return raw.replace(/\/+$/, '');
    return `${url.protocol}//${url.host}`;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

function buildAzureConfigError(error, endpoint) {
  const message = String(error && error.message ? error.message : error || '');
  const status = error && (error.status || error.statusCode);
  const isNotFound = status === 404 || /\b404\b/i.test(message) || /resource not found/i.test(message);

  if (!isNotFound) return message || 'Azure OpenAI configuration is invalid';

  return [
    'Azure returned 404 (resource not found).',
    'Use only the base endpoint host (for example https://<resource>.services.ai.azure.com or https://<resource>.openai.azure.com) with no /openai, /openai/v1, or other path.',
    'Also confirm the chat/transcription/embedding deployment names exactly match Azure Foundry.',
    endpoint ? `Current endpoint: ${endpoint}` : null
  ].filter(Boolean).join(' ');
}

function resolveAzureRealtimeApiVersion(value) {
  const raw = String(value || '').trim();
  if (!raw) return DEFAULT_AZURE_REALTIME_API_VERSION;
  if (raw.includes('preview')) return raw;
  return DEFAULT_AZURE_REALTIME_API_VERSION;
}

function normalizeAzureApiVersion(value) {
  const raw = String(value || '').trim();
  if (!raw) return DEFAULT_AZURE_API_VERSION;
  if (!API_VERSION_FORMAT.test(raw)) {
    throw new Error('Invalid Azure API version format. Use YYYY-MM-DD or YYYY-MM-DD-preview.');
  }
  const known = AZURE_CHAT_EMBEDDINGS_API_VERSIONS.find(v => v.version === raw);
  if (known && known.status === 'retired') {
    throw new Error(`Azure API version "${raw}" is retired and no longer supported.`);
  }
  // Unknown-but-valid versions are allowed so newly released GA/preview versions
  // work without code changes.
  return raw;
}

class AzureOpenAIProvider {
  constructor(config) {
    this.endpoint = normalizeAzureEndpoint(config.endpoint);
    this.apiKey = config.apiKey;
    this.apiVersion = normalizeAzureApiVersion(config.apiVersion);
    // Realtime transcription still uses preview websocket semantics
    // (/openai/realtime + api-version + deployment query params).
    this.realtimeApiVersion = resolveAzureRealtimeApiVersion(config.realtimeApiVersion || this.apiVersion);
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

  buildRealtimeUrl(mode = 'preview') {
    const host = this.endpoint.replace('https://', '').replace('http://', '').replace(/\/$/, '');
    // This socket is always an intent=transcription session, so connect it using
    // the transcription deployment itself. A separate realtime "host" model
    // (e.g. gpt-realtime-mini) is not required; realtimeDeployment is kept only
    // as a backward-compatible fallback.
    const deployment = this.transcriptionModel || this.realtimeDeployment;
    if (mode === 'ga') {
      return `wss://${host}/openai/v1/realtime?intent=transcription`;
    }
    return `wss://${host}/openai/realtime?api-version=${this.realtimeApiVersion}&deployment=${deployment}&intent=transcription`;
  }

  getRealtimeConnectionModes() {
    // Prefer preview first because the current wire protocol uses
    // transcription_session.update and deployment query semantics.
    // Some tenants/resources expose GA-only routes, so ws.js falls back to GA.
    return ['preview', 'ga'];
  }

  createRealtimeWebSocket(mode = 'preview') {
    return new WebSocket(this.buildRealtimeUrl(mode), {
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
      return { valid: false, error: buildAzureConfigError(e, this.endpoint) };
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

  buildRealtimeUrl() {
    // intent=transcription session: connect using the transcription model itself.
    const model = this.transcriptionModel || this.realtimeModel;
    return `wss://api.openai.com/v1/realtime?model=${model}&intent=transcription`;
  }

  getRealtimeConnectionModes() {
    return ['default'];
  }

  createRealtimeWebSocket() {
    return new WebSocket(this.buildRealtimeUrl(), {
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

// --- Factory: load provider from saved config ---

function loadProvider() {
  // Test hook: when CLUMO_FAKE_PROVIDER=1 is set, return a deterministic
  // in-memory provider so E2E and Electron GUI tests can run without any
  // real API key, network call, or cost. Production code paths are
  // identical — this hook lives only at the factory boundary.
  if (process.env.CLUMO_FAKE_PROVIDER === '1') {
    return require('./tests/fixtures/fake-provider');
  }

  const providerType = getConfig('ai_provider');
  if (!providerType) return null;

  if (providerType === 'azure') {
    const endpoint = getConfig('azure_endpoint');
    const apiKey = getSecureConfig('azure_api_key');
    const apiVersion = getConfig('azure_api_version');
    const realtimeApiVersion = getConfig('azure_realtime_api_version');
    const chatDeployment = getConfig('azure_chat_deployment');
    const realtimeDeployment = getConfig('azure_realtime_deployment');
    const embeddingDeployment = getConfig('azure_embedding_deployment');

    // realtimeDeployment is optional now: the realtime transcription session
    // connects via the transcription model, so a separate realtime deployment
    // is not required.
    if (!endpoint || !apiKey || !chatDeployment) return null;

    return new AzureOpenAIProvider({
      endpoint, apiKey, apiVersion, chatDeployment, realtimeDeployment, embeddingDeployment,
      realtimeApiVersion,
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

// --- Load embedding provider (BYOK) ---

function loadEmbeddingProvider() {
  return loadProvider();
}

// --- Save provider config ---

function saveProviderConfig(providerType, config) {
  setConfig('ai_provider', providerType);

  if (providerType === 'azure') {
    const endpoint = normalizeAzureEndpoint(config.endpoint);
    setConfig('azure_endpoint', endpoint);
    if (config.apiKey) {
      setSecureConfig('azure_api_key', config.apiKey);
    }
    setConfig('azure_api_version', normalizeAzureApiVersion(config.apiVersion));
    if (config.realtimeApiVersion) {
      setConfig('azure_realtime_api_version', config.realtimeApiVersion);
    }
    setConfig('azure_chat_deployment', config.chatDeployment);
    // Realtime deployment is optional: the transcription session connects via
    // the transcription deployment. Kept for backward compatibility if provided.
    if (config.realtimeDeployment) {
      setConfig('azure_realtime_deployment', config.realtimeDeployment);
    }
    if (config.transcriptionDeployment) {
      setConfig('transcription_model', config.transcriptionDeployment);
    }
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
  loadProvider,
  loadEmbeddingProvider,
  saveProviderConfig,
  getAzureModelApiVersionSupport,
  normalizeAzureApiVersion,
  DEFAULT_AZURE_API_VERSION,
  DEFAULT_TRANSCRIPTION_MODEL,
  normalizeAzureEndpoint
};
