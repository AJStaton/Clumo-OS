import { useState } from 'react';

function SecurityModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">How Clumo handles security</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="space-y-5 text-sm text-gray-700">
          <div>
            <h3 className="font-semibold text-gray-900 mb-1.5">Your API key is encrypted</h3>
            <p>
              The moment you save your API key, it's encrypted using <strong>AES-256-CBC</strong>, the
              same encryption standard used by banks and government systems. Each encryption uses a unique
              random value, so even the same key encrypted twice looks completely different. Your key is
              stored in an encrypted local database, never in plain text, and is never displayed back in
              the UI once saved.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1.5">Everything runs on your machine</h3>
            <p>
              Clumo has no cloud backend, no account system, and no intermediary servers. The app runs
              entirely on your computer. Your knowledge base, transcripts, session history, and settings
              all stay in local files on your machine. Nothing is uploaded anywhere.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1.5">What data is sent to your AI provider</h3>
            <p className="mb-2">
              The only external connection Clumo makes is directly to the AI provider you choose (OpenAI
              or Azure OpenAI). Here's exactly what gets sent:
            </p>
            <ul className="space-y-1.5 ml-1">
              <li className="flex gap-2">
                <span className="text-gray-400 shrink-0">&#8226;</span>
                <span><strong>Audio stream</strong> sent in real time for live transcription</span>
              </li>
              <li className="flex gap-2">
                <span className="text-gray-400 shrink-0">&#8226;</span>
                <span><strong>Short transcript excerpts</strong> (~500 words) sent to score whether a suggestion is relevant right now</span>
              </li>
              <li className="flex gap-2">
                <span className="text-gray-400 shrink-0">&#8226;</span>
                <span><strong>Embeddings</strong> — text is converted to numeric vectors for semantic matching. See "How search works" below for details.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-gray-400 shrink-0">&#8226;</span>
                <span><strong>Full transcript</strong> (after the call) sent once to generate your call summary and follow up email</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1.5">How search works</h3>
            <p className="mb-2">
              Embeddings let Clumo match by meaning, not keywords. When a prospect says "we are struggling
              with employee churn," Clumo recognizes it relates to a case study about reducing attrition
              by 40%, even though no words match exactly. This makes suggestions accurate and timely.
            </p>
            <p className="mb-2">
              An embedding is a list of numbers (a vector) that captures meaning. The conversion is one way.
              There is no known method to reconstruct the original text from its vector. Your knowledge base
              text never leaves your machine after the initial one time conversion. During calls, transcript
              chunks are converted to vectors and compared locally against stored KB vectors.
            </p>
            <p className="text-xs text-gray-500 bg-gray-50 rounded-md p-2 border border-gray-100">
              When using managed models, embedding requests are sent to Clumo's AI service over a TLS
              encrypted connection. The text is processed and discarded. Clumo does not store your text
              or vectors on any server.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1.5">Secure connections</h3>
            <p>
              All communication with OpenAI and Azure uses <strong>TLS encrypted</strong> channels (HTTPS
              and WSS). Your API key is transmitted only in standard authorization headers, the same way
              any official OpenAI or Azure integration works. Data travels directly from your machine to
              your provider with no middleman.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1.5">No telemetry or tracking</h3>
            <p>
              Clumo collects zero analytics, zero telemetry, and zero usage data. There are no tracking
              pixels, no crash reporters, and no phone home connections. The app is open source so you can
              verify this yourself.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

export default function Setup({ onComplete }) {
  const [step, setStep] = useState(1);
  const [providerMode, setProviderMode] = useState(''); // 'managed' or 'byok'
  const [provider, setProvider] = useState('');
  const [config, setConfig] = useState({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);

  // Onboarding state
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [files, setFiles] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [onboardingStatus, setOnboardingStatus] = useState('idle');
  const [onboardingMessages, setOnboardingMessages] = useState([]);
  const [onboardingCounts, setOnboardingCounts] = useState(null);

  async function handleSelectManaged() {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerMode: 'managed' })
      });
      if (res.ok) {
        setStep(2);
      } else {
        const err = await res.json();
        setTestResult({ valid: false, error: err.error });
      }
    } catch (e) {
      setTestResult({ valid: false, error: e.message });
    }
    setSaving(false);
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);

    // Save first, then test
    try {
      const saveRes = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, ...config })
      });

      if (!saveRes.ok) {
        const err = await saveRes.json();
        setTestResult({ valid: false, error: err.error });
        setTesting(false);
        return;
      }

      const res = await fetch('/api/settings/test', { method: 'POST' });
      const data = await res.json();
      setTestResult(data);

      if (data.valid) {
        setSaving(false);
      }
    } catch (e) {
      setTestResult({ valid: false, error: e.message });
    }
    setTesting(false);
  }

  async function handleUploadFiles() {
    if (files.length === 0) return;

    const formData = new FormData();
    for (const f of files) {
      formData.append('documents', f);
    }

    const res = await fetch('/api/onboarding/upload', {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      const data = await res.json();
      setUploadedFiles(data.files);
    }
  }

  async function handleStartOnboarding() {
    setOnboardingStatus('running');
    setOnboardingMessages([]);

    // Upload files if not yet uploaded
    let filesToSend = uploadedFiles;
    if (files.length > 0 && uploadedFiles.length === 0) {
      const formData = new FormData();
      for (const f of files) {
        formData.append('documents', f);
      }
      const uploadRes = await fetch('/api/onboarding/upload', {
        method: 'POST',
        body: formData
      });
      if (uploadRes.ok) {
        const data = await uploadRes.json();
        filesToSend = data.files;
      }
    }

    // Start pipeline
    const startRes = await fetch('/api/onboarding/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        websiteUrl: websiteUrl || null,
        uploadedFiles: filesToSend.length > 0 ? filesToSend : null
      })
    });

    if (!startRes.ok) {
      const err = await startRes.json();
      setOnboardingMessages(prev => [...prev, `Error: ${err.error}`]);
      setOnboardingStatus('error');
      return;
    }

    const { sseToken } = await startRes.json();

    // Connect to SSE stream
    const eventSource = new EventSource(`/api/onboarding/stream?token=${sseToken}`);

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setOnboardingMessages(prev => [...prev, data.message]);
    });

    eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      setOnboardingCounts(data.counts);
      setOnboardingStatus('complete');
      eventSource.close();
    });

    eventSource.addEventListener('error', (e) => {
      try {
        const data = JSON.parse(e.data);
        setOnboardingMessages(prev => [...prev, `Error: ${data.message}`]);
      } catch {
        setOnboardingMessages(prev => [...prev, 'Connection lost']);
      }
      setOnboardingStatus('error');
      eventSource.close();
    });
  }

  function handleFinish() {
    onComplete?.();
    window.location.href = '/call';
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Clumo</h1>
          <p className="text-gray-500 mt-1">AI-powered live call coaching</p>
        </div>

        {/* Step 1: API Keys */}
        {step === 1 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Step 1: Connect your AI provider</h2>
              <button
                onClick={() => setShowSecurity(true)}
                className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2"
              >
                Security stuff for the techies
              </button>
            </div>

            {/* Managed vs BYOK choice */}
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => { setProviderMode('managed'); setProvider(''); setConfig({}); setTestResult(null); }}
                className={`flex-1 p-4 rounded-lg border-2 text-left transition-colors ${
                  providerMode === 'managed'
                    ? 'border-gray-900 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-sm font-semibold">Managed Models</div>
                <div className="text-xs text-gray-500 mt-1">Clumo provides the AI. No API keys needed. Just start coaching.</div>
              </button>
              <button
                onClick={() => { setProviderMode('byok'); setProvider(''); setConfig({}); setTestResult(null); }}
                className={`flex-1 p-4 rounded-lg border-2 text-left transition-colors ${
                  providerMode === 'byok'
                    ? 'border-gray-900 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-sm font-semibold">Bring Your Own Key</div>
                <div className="text-xs text-gray-500 mt-1">Use your own OpenAI or Azure OpenAI account.</div>
              </button>
            </div>

            {/* Managed mode: just a continue button */}
            {providerMode === 'managed' && (
              <div>
                <div className="bg-gray-50 rounded-md p-3 border border-gray-200 mb-4">
                  <p className="text-sm text-gray-600">
                    Clumo will handle all AI processing. Your data is sent over encrypted connections and is not stored on any server.
                  </p>
                </div>
                <button
                  onClick={handleSelectManaged}
                  disabled={saving}
                  className="w-full px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? 'Setting up...' : 'Continue'}
                </button>
              </div>
            )}

            {/* BYOK mode: provider selection */}
            {providerMode === 'byok' && (
              <div className="flex gap-3 mb-6">
                <button
                  onClick={() => { setProvider('azure'); setConfig({}); setTestResult(null); }}
                  className={`flex-1 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                    provider === 'azure'
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Azure OpenAI
                </button>
                <button
                  onClick={() => { setProvider('openai'); setConfig({}); setTestResult(null); }}
                  className={`flex-1 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                    provider === 'openai'
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
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
                  placeholder="Endpoint (https://your-resource.openai.azure.com)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  value={config.endpoint || ''}
                  onChange={e => setConfig({ ...config, endpoint: e.target.value })}
                />
                <input
                  type="password"
                  placeholder="API Key"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  value={config.apiKey || ''}
                  onChange={e => setConfig({ ...config, apiKey: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Chat deployment name (e.g. gpt-4o-mini)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  value={config.chatDeployment || ''}
                  onChange={e => setConfig({ ...config, chatDeployment: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Realtime deployment (e.g. gpt-realtime-mini)"
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

                <div className="bg-gray-50 rounded-md p-3 border border-gray-200 mt-2">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Recommended models</p>
                  <div className="space-y-2 text-xs text-gray-600">
                    <div>
                      <span className="font-medium text-gray-800">Chat: gpt-4o-mini</span>
                      <p className="mt-0.5">Fast and cheap for scoring suggestions in real time. Keeps up with live conversation without noticeable delay and keeps costs low.</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-800">Realtime: gpt-realtime-mini</span>
                      <p className="mt-0.5">Lightweight realtime model for live audio transcription. Lower cost than the full gpt-4o realtime model while still providing accurate transcription.</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-800">Embedding: text-embedding-3-small</span>
                      <p className="mt-0.5">Used to match transcript context to knowledge base items via semantic similarity. Fast and cost-effective.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {provider === 'openai' && (
              <div className="space-y-3">
                <input
                  type="password"
                  placeholder="API Key (sk-...)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  value={config.apiKey || ''}
                  onChange={e => setConfig({ ...config, apiKey: e.target.value })}
                />

                <div className="bg-gray-50 rounded-md p-3 border border-gray-200">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Recommended models</p>
                  <div className="space-y-2 text-xs text-gray-600">
                    <div>
                      <span className="font-medium text-gray-800">Suggestions: gpt-4o-mini</span>
                      <span className="ml-1.5 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">default</span>
                      <p className="mt-0.5">Fast and cheap for scoring suggestions in real time. Keeps up with live conversation without noticeable delay and keeps costs low.</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-800">Transcription: gpt-realtime-mini</span>
                      <span className="ml-1.5 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">default</span>
                      <p className="mt-0.5">Lightweight realtime model for live audio transcription. Lower cost than the full gpt-4o realtime model while still providing accurate transcription.</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-800">Embedding: text-embedding-3-small</span>
                      <span className="ml-1.5 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">default</span>
                      <p className="mt-0.5">Used to match transcript context to knowledge base items via semantic similarity. Fast and cost-effective. Used automatically with your API key.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {testResult && (
              <div className={`mt-4 p-3 rounded-md text-sm ${
                testResult.valid
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {testResult.valid ? 'Connection successful.' : `Failed: ${testResult.error}`}
              </div>
            )}

            {provider && (
              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                >
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>
                {testResult?.valid && (
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800"
                  >
                    Next
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Knowledge Base Onboarding */}
        {step === 2 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Step 2: Build your knowledge base</h2>
            <p className="text-sm text-gray-500 mb-4">
              Enter your company website and/or upload sales documents. Clumo will extract case studies,
              discovery questions, and proof points.
            </p>

            {onboardingStatus === 'idle' && (
              <>
                <div className="space-y-3">
                  <input
                    type="url"
                    placeholder="Company website URL (e.g. https://yourcompany.com)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    value={websiteUrl}
                    onChange={e => setWebsiteUrl(e.target.value)}
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Upload documents (optional)
                    </label>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.docx,.pptx,.md,.txt"
                      className="text-sm"
                      onChange={e => setFiles(Array.from(e.target.files))}
                    />
                    {files.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">{files.length} file(s) selected</p>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => setStep(1)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleStartOnboarding}
                    disabled={!websiteUrl && files.length === 0}
                    className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                  >
                    Generate Knowledge Base
                  </button>
                </div>
              </>
            )}

            {onboardingStatus === 'running' && (
              <div>
                <div className="space-y-1 max-h-60 overflow-y-auto bg-gray-50 rounded-md p-3 text-sm text-gray-600">
                  {onboardingMessages.map((msg, i) => (
                    <div key={i}>{msg}</div>
                  ))}
                  <div className="animate-pulse">Processing...</div>
                </div>
              </div>
            )}

            {onboardingStatus === 'complete' && (
              <div>
                <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
                  <p className="text-sm font-medium text-green-800">Knowledge base generated!</p>
                  {onboardingCounts && (
                    <ul className="text-sm text-green-700 mt-2 space-y-1">
                      <li>{onboardingCounts.caseStudies} case studies</li>
                      <li>{onboardingCounts.discoveryQuestions} discovery questions</li>
                      <li>{onboardingCounts.proofPoints} proof points</li>
                    </ul>
                  )}
                </div>
                <button
                  onClick={handleFinish}
                  className="w-full px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800"
                >
                  Start Coaching
                </button>
              </div>
            )}

            {onboardingStatus === 'error' && (
              <div>
                <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
                  <p className="text-sm text-red-800">Something went wrong. Check the log above.</p>
                </div>
                <button
                  onClick={() => { setOnboardingStatus('idle'); setOnboardingMessages([]); }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          Step {step} of 2
        </p>

        {showSecurity && <SecurityModal onClose={() => setShowSecurity(false)} />}
      </div>
    </div>
  );
}
