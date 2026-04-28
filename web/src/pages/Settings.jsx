import { useState, useEffect } from 'react';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [providerMode, setProviderMode] = useState('byok');
  const [provider, setProvider] = useState('');
  const [config, setConfig] = useState({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        setSettings(data);
        setProviderMode(data.providerMode || 'byok');
        if (data.configured && data.providerMode !== 'managed') {
          setProvider(data.provider);
          if (data.provider === 'azure') {
            setConfig({
              endpoint: data.endpoint || '',
              chatDeployment: data.chatDeployment || '',
              realtimeDeployment: data.realtimeDeployment || '',
              embeddingDeployment: data.embeddingDeployment || '',
              apiKey: '' // Don't pre-fill
            });
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    setTesting(true);
    setTestResult(null);
    setSaved(false);

    if (providerMode === 'managed') {
      const saveRes = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerMode: 'managed' })
      });
      if (saveRes.ok) {
        setTestResult({ valid: true });
        setSaved(true);
      } else {
        const err = await saveRes.json();
        setTestResult({ valid: false, error: err.error });
      }
      setTesting(false);
      return;
    }

    // Only include apiKey if user entered a new one
    const payload = { provider, ...config };
    if (!payload.apiKey) {
      delete payload.apiKey;
    }

    const saveRes = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!saveRes.ok) {
      const err = await saveRes.json();
      setTestResult({ valid: false, error: err.error });
      setTesting(false);
      return;
    }

    const testRes = await fetch('/api/settings/test', { method: 'POST' });
    const text = await testRes.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      result = { valid: false, error: text || 'Connection test failed — no response from server' };
    }
    setTestResult(result);
    if (result.valid) setSaved(true);
    setTesting(false);
  }

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-xl font-bold mb-6">Settings</h1>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">AI Provider</h2>

        {/* Managed vs BYOK toggle */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => { setProviderMode('managed'); setProvider(''); setConfig({}); setTestResult(null); setSaved(false); }}
            className={`flex-1 p-3 rounded-lg border-2 text-sm font-medium text-left ${
              providerMode === 'managed' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div>Managed Models</div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">No API keys needed</div>
          </button>
          <button
            onClick={() => { setProviderMode('byok'); setTestResult(null); setSaved(false); }}
            className={`flex-1 p-3 rounded-lg border-2 text-sm font-medium text-left ${
              providerMode === 'byok' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div>Bring Your Own Key</div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">Use your own API keys</div>
          </button>
        </div>

        {providerMode === 'managed' && (
          <div className="bg-gray-50 rounded-md p-3 border border-gray-200 mb-4">
            <p className="text-sm text-gray-600">
              Clumo will handle all AI processing. Your data is sent over encrypted connections and is not stored on any server.
            </p>
          </div>
        )}

        {/* BYOK provider selection */}
        {providerMode === 'byok' && (
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => { setProvider('azure'); setConfig({}); setTestResult(null); }}
              className={`flex-1 p-3 rounded-lg border-2 text-sm font-medium ${
                provider === 'azure' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              Azure OpenAI
            </button>
            <button
              onClick={() => { setProvider('openai'); setConfig({}); setTestResult(null); }}
              className={`flex-1 p-3 rounded-lg border-2 text-sm font-medium ${
                provider === 'openai' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              OpenAI
            </button>
          </div>
        )}

        {provider === 'azure' && (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Endpoint"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              value={config.endpoint || ''}
              onChange={e => setConfig({ ...config, endpoint: e.target.value })}
            />
            <input
              type="password"
              placeholder={settings?.hasApiKey ? 'API Key (leave blank to keep current)' : 'API Key'}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              value={config.apiKey || ''}
              onChange={e => setConfig({ ...config, apiKey: e.target.value })}
            />
            <input
              type="text"
              placeholder="Chat deployment name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              value={config.chatDeployment || ''}
              onChange={e => setConfig({ ...config, chatDeployment: e.target.value })}
            />
            <input
              type="text"
              placeholder="Realtime deployment name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              value={config.realtimeDeployment || ''}
              onChange={e => setConfig({ ...config, realtimeDeployment: e.target.value })}
            />
            <input
              type="text"
              placeholder="Embedding deployment name (e.g. text-embedding-3-small)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              value={config.embeddingDeployment || ''}
              onChange={e => setConfig({ ...config, embeddingDeployment: e.target.value })}
            />
          </div>
        )}

        {provider === 'openai' && (
          <div className="space-y-3">
            <input
              type="password"
              placeholder={settings?.hasApiKey ? 'API Key (leave blank to keep current)' : 'API Key (sk-...)'}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              value={config.apiKey || ''}
              onChange={e => setConfig({ ...config, apiKey: e.target.value })}
            />
          </div>
        )}

        {testResult && (
          <div className={`mt-4 p-3 rounded-md text-sm ${
            testResult.valid
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {testResult.valid ? 'Connection successful. Settings saved.' : `Failed: ${testResult.error}`}
          </div>
        )}

        {(providerMode === 'managed' || provider) && (
          <button
            onClick={handleSave}
            disabled={testing}
            className="mt-6 w-full px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {testing ? 'Saving...' : providerMode === 'managed' ? 'Save' : 'Save & Test Connection'}
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Knowledge Base</h2>
        <div className="flex gap-3">
          <a
            href="/kb"
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50"
          >
            Manage Knowledge Base
          </a>
          <a
            href="/setup"
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50"
          >
            Re-run Onboarding
          </a>
        </div>
      </div>
    </div>
  );
}
