import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SecurityModal from '../components/SecurityModal';
import AzureKeyGuide from '../components/AzureKeyGuide';

export default function AiModelsSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState('');
  const [config, setConfig] = useState({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const defaultAzureApiVersion = settings?.azureApiVersionSupport?.defaults?.chatEmbeddings || '2024-10-21';

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        setSettings(data);
        if (data.configured) {
          setProvider(data.provider);
          if (data.provider === 'azure') {
            setConfig({
              endpoint: data.endpoint || '',
              apiVersion: data.apiVersion || (data.azureApiVersionSupport?.defaults?.chatEmbeddings || '2024-10-21'),
              chatDeployment: data.chatDeployment || '',
              transcriptionDeployment: data.transcriptionDeployment || '',
              embeddingDeployment: data.embeddingDeployment || '',
              apiKey: ''
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
      result = { valid: false, error: text || 'Connection test failed' };
    }
    setTestResult(result);
    if (result.valid) setSaved(true);
    setTesting(false);
  }

  if (loading) return <div className="p-6 text-gray-500 dark:text-gray-400">Loading...</div>;

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">AI Models</h2>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">AI Provider</h3>
          <button
            onClick={() => setShowSecurity(true)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 underline underline-offset-2"
          >
            Security stuff for the techies
          </button>
        </div>

        <div className="flex gap-3 mb-6">
          <button
            onClick={() => {
              setProvider('azure');
              setConfig({
                apiVersion: defaultAzureApiVersion
              });
              setTestResult(null);
            }}
            className={`flex-1 p-3 rounded-lg border-2 text-sm font-medium text-gray-900 dark:text-gray-100 ${
              provider === 'azure' ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-700' : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
            }`}
          >
            Azure OpenAI
          </button>
          <button
            onClick={() => { setProvider('openai'); setConfig({}); setTestResult(null); }}
            className={`flex-1 p-3 rounded-lg border-2 text-sm font-medium text-gray-900 dark:text-gray-100 ${
              provider === 'openai' ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-700' : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
            }`}
          >
            OpenAI
          </button>
        </div>

        {provider === 'azure' && (
          <div className="space-y-3">
            <input type="text" placeholder="Endpoint" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-gray-200" value={config.endpoint || ''} onChange={e => setConfig({ ...config, endpoint: e.target.value })} />
            <input type="password" placeholder={settings?.hasApiKey ? 'API Key (leave blank to keep current)' : 'API Key'} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-gray-200" value={config.apiKey || ''} onChange={e => setConfig({ ...config, apiKey: e.target.value })} />
            <input
              type="text"
              list="azure-api-versions"
              placeholder="API version (e.g. 2024-10-21 or 2025-04-01-preview)"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-gray-200"
              value={config.apiVersion || defaultAzureApiVersion}
              onChange={e => setConfig({ ...config, apiVersion: e.target.value })}
            />
            <datalist id="azure-api-versions">
              {(settings?.azureApiVersionSupport?.chatEmbeddings || []).map(v => (
                <option key={v.version} value={v.version}>
                  {v.lifecycle} ({v.status})
                </option>
              ))}
            </datalist>
            <input type="text" placeholder="Chat deployment name" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-gray-200" value={config.chatDeployment || ''} onChange={e => setConfig({ ...config, chatDeployment: e.target.value })} />
            <input type="text" placeholder="Transcription deployment name (e.g. gpt-4o-mini-transcribe)" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-gray-200" value={config.transcriptionDeployment || ''} onChange={e => setConfig({ ...config, transcriptionDeployment: e.target.value })} />
            <input type="text" placeholder="Embedding deployment name (e.g. text-embedding-3-small)" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-gray-200" value={config.embeddingDeployment || ''} onChange={e => setConfig({ ...config, embeddingDeployment: e.target.value })} />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Chat and embeddings use this API version. Any valid Azure version string is accepted; known tested versions are suggested above.
            </p>
            <AzureKeyGuide />
          </div>
        )}

        {provider === 'openai' && (
          <div className="space-y-3">
            <input type="password" placeholder={settings?.hasApiKey ? 'API Key (leave blank to keep current)' : 'API Key (sk-...)'} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-gray-200" value={config.apiKey || ''} onChange={e => setConfig({ ...config, apiKey: e.target.value })} />
          </div>
        )}

        {testResult && (
          <div className={`mt-4 p-3 rounded-md text-sm ${
            testResult.valid
              ? 'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-700'
              : 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-700'
          }`}>
            {testResult.valid ? 'Connection successful. Settings saved.' : `Failed: ${testResult.error}`}
          </div>
        )}

        {provider && (
          <button
            onClick={handleSave}
            disabled={testing}
            className="mt-6 w-full px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
          >
            {testing ? 'Saving...' : 'Save & Test Connection'}
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mt-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 text-center">Knowledge Base</h3>
        <div className="flex gap-3 justify-center">
          <Link to="/kb" className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            Manage Knowledge Base
          </Link>
          <Link to="/setup" className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            Re-run Onboarding
          </Link>
        </div>
      </div>

      {showSecurity && <SecurityModal onClose={() => setShowSecurity(false)} />}
    </div>
  );
}
