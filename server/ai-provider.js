// AI Provider abstraction for Clumo
// Supports Azure OpenAI and OpenAI with a unified interface

const WebSocket = require('ws');
const { getConfig, getSecureConfig, setConfig, setSecureConfig } = require('./db');

class AzureOpenAIProvider {
  constructor(config) {
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.apiVersion = config.apiVersion || '2024-10-01-preview';
    this.chatDeployment = config.chatDeployment;
    this.realtimeDeployment = config.realtimeDeployment;
    this.embeddingDeployment = config.embeddingDeployment;
    this.client = null;
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
    this.client = null;
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

// --- Factory: load provider from saved config ---

function loadProvider() {
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
      endpoint, apiKey, apiVersion, chatDeployment, realtimeDeployment, embeddingDeployment
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
      realtimeModel: realtimeModel || 'gpt-realtime-mini'
    });
  }

  return null;
}

// --- Save provider config ---

function saveProviderConfig(providerType, config) {
  setConfig('ai_provider', providerType);

  if (providerType === 'azure') {
    setConfig('azure_endpoint', config.endpoint);
    if (config.apiKey) {
      setSecureConfig('azure_api_key', config.apiKey);
    }
    setConfig('azure_api_version', config.apiVersion || '2024-10-01-preview');
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
  loadProvider,
  saveProviderConfig
};
