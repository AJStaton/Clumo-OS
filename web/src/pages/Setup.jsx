import { useState, useRef, useEffect } from 'react';
import OnboardingWizard from '../components/OnboardingWizard';
import PlaybookEditor from '../components/PlaybookEditor';

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
            <h3 className="font-semibold text-gray-900 mb-1.5">Your keys are only stored locally on your device</h3>
            <p>
              Clumo is bring-your-own-key, and your API keys <strong>never leave your machine</strong>. When
              you save a key it's written only to a local database file on this computer&nbsp;
              (<span className="font-mono text-xs">clumo.db</span>) &mdash; there is no Clumo account, no cloud
              backend, and no server that your keys are sent to or synced with. The <em>only</em> place your key
              is ever transmitted is directly to the AI provider you chose (OpenAI or Azure OpenAI), in the
              standard authorization header, exactly as their own SDKs do it. If you delete Clumo's local data
              folder, the keys are gone &mdash; they exist nowhere else.
            </p>
          </div>

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
                <span><strong>Embeddings</strong>: text is converted to numeric vectors for semantic matching. See "How search works" below for details.</span>
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
  const [provider, setProvider] = useState('');
  const [config, setConfig] = useState({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showKeyGuide, setShowKeyGuide] = useState(false);

  // Onboarding state — the data-gathering wizard lives in <OnboardingWizard/>; this page
  // owns the run lifecycle (start + SSE progress + results).
  const [onboardingStatus, setOnboardingStatus] = useState('idle');
  const [onboardingMessages, setOnboardingMessages] = useState([]);
  const [onboardingCounts, setOnboardingCounts] = useState(null);
  const [onboardingCoverage, setOnboardingCoverage] = useState(null);
  const eventSourceRef = useRef(null);

  // Tear down any live SSE stream on unmount.
  useEffect(() => () => { try { eventSourceRef.current?.close(); } catch { /* noop */ } }, []);

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
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { valid: false, error: text || 'Connection test failed: no response from server' };
      }
      setTestResult(data);

      if (data.valid) {
        setSaving(false);
      }
    } catch (e) {
      setTestResult({ valid: false, error: e.message });
    }
    setTesting(false);
  }

  async function handleStartOnboarding({ websiteUrl, files, profile, priorities, sourceUrls }) {
    if (onboardingStatus === 'running') return; // guard against double-submit
    setOnboardingStatus('running');
    setOnboardingMessages([]);
    setOnboardingCounts(null);
    setOnboardingCoverage(null);
    try { eventSourceRef.current?.close(); } catch { /* noop */ }

    // Upload any selected files first.
    let filesToSend = [];
    if (files && files.length > 0) {
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
        uploadedFiles: filesToSend.length > 0 ? filesToSend : null,
        sourceUrls: sourceUrls || null,
        profile: profile || null,
        priorities: priorities || []
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
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setOnboardingMessages(prev => [...prev, data.message]);
    });

    eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      setOnboardingCounts(data.counts);
      setOnboardingCoverage(data.coverage || null);
      setOnboardingStatus('complete');
      eventSource.close();
    });

    eventSource.addEventListener('error', (e) => {
      try {
        const data = JSON.parse(e.data);
        setOnboardingMessages(prev => [...prev, `Error: ${data.message}`]);
      } catch {
        // Custom 'error' event without parseable data
        setOnboardingMessages(prev => [...prev, 'Error: Connection lost']);
      }
      setOnboardingStatus('error');
      eventSource.close();
    });

    // Native onerror fires on connection drop/timeout (separate from custom 'error' event)
    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) return; // already handled
      setOnboardingMessages(prev => [...prev, 'Error: Connection to server lost. The server may have crashed or timed out.']);
      setOnboardingStatus('error');
      eventSource.close();
    };
  }

  function handleFinish() {
    onComplete?.();
    window.location.href = '/call';
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className={`w-full ${step === 3 ? 'max-w-2xl' : 'max-w-lg'}`}>
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

            {/* Welcome / why bring-your-own-key */}
            <div className="mb-6 space-y-3 text-sm text-gray-600">
              <p>
                <strong className="text-gray-900">Clumo</strong> is AI-powered live call coaching. It listens to your
                sales calls and surfaces the right discovery question, case study, or proof point at exactly the
                right moment — in real time, during the call. It's built for account executives, founder-led sales,
                and technical sales / SEs who want an A-player on every call.
              </p>
              <div className="bg-gray-50 rounded-md p-3 border border-gray-200">
                <p className="font-semibold text-gray-800 mb-1">Why you bring your own AI keys</p>
                <p>
                  Clumo is an open-source project, and you'll use it live with real clients — so it has to be secure.
                  You connect your own OpenAI or Azure OpenAI account, which means your transcripts, prompts, and
                  data go straight to <em>your</em> AI provider and nowhere else. There's no shared key and no
                  middleman: only you have access to your AI keys, and only you can see your calls.
                </p>
              </div>
            </div>

            {/* BYOK provider selection */}
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
                  placeholder="Transcription deployment (e.g. gpt-4o-mini-transcribe)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  value={config.transcriptionDeployment || ''}
                  onChange={e => setConfig({ ...config, transcriptionDeployment: e.target.value })}
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
                      <span className="font-medium text-gray-800">Transcription: gpt-4o-mini-transcribe</span>
                      <p className="mt-0.5">A single transcription deployment carries the live audio session and streams partial results as the customer speaks (faster, lower-latency suggestions). No separate realtime deployment is required.</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-800">Embedding: text-embedding-3-small</span>
                      <p className="mt-0.5">Used to match transcript context to knowledge base items via semantic similarity. Fast and cost-effective.</p>
                    </div>
                  </div>
                </div>

                {/* How to set up your own keys — Azure AI Foundry walkthrough */}
                <div className="border border-gray-200 rounded-md">
                  <button
                    type="button"
                    onClick={() => setShowKeyGuide(v => !v)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50"
                  >
                    <span>How to set up your own keys (Azure AI Foundry)</span>
                    <span className="text-gray-400">{showKeyGuide ? '\u2212' : '+'}</span>
                  </button>

                  {showKeyGuide && (
                    <div className="px-3 pb-3 pt-1 text-xs text-gray-600 space-y-3 border-t border-gray-100">
                      <p>
                        Follow these steps in <strong>Azure AI Foundry</strong> (portal:{' '}
                        <span className="font-mono">ai.azure.com</span>) to create the models Clumo needs. You paste
                        the endpoint, key, and deployment names into the fields above.
                      </p>

                      <div>
                        <p className="font-semibold text-gray-800">1. Create a project + resource</p>
                        <p>
                          Sign in to Azure AI Foundry, create (or open) a project, and make sure it's backed by an
                          <strong> Azure OpenAI</strong> resource. Note the region — keep it in a location that meets
                          your data-residency / compliance needs.
                        </p>
                      </div>

                      <div>
                        <p className="font-semibold text-gray-800">2. Deploy the three models</p>
                        <p className="mb-1">Under <em>Deployments &rarr; Deploy model</em>, deploy each of these and note the deployment name you give it:</p>
                        <ul className="ml-1 space-y-1">
                          <li className="flex gap-2">
                            <span className="text-gray-400 shrink-0">&#8226;</span>
                            <span><strong>Chat completions:</strong> <span className="font-mono">gpt-4o-mini</span> — scores suggestions, powers coaching and post-call analysis.</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-gray-400 shrink-0">&#8226;</span>
                            <span><strong>Real-time transcription:</strong> <span className="font-mono">gpt-4o-mini-transcribe</span> — carries the live audio session and streams the transcript.</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-gray-400 shrink-0">&#8226;</span>
                            <span><strong>Embeddings:</strong> <span className="font-mono">text-embedding-3-small</span> — matches the conversation to your knowledge base.</span>
                          </li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold text-gray-800">3. Copy your endpoint + key</p>
                        <p>
                          In the resource's <em>Keys and Endpoint</em> page, copy the endpoint
                          (<span className="font-mono">https://your-resource.openai.azure.com</span>) and one of the API keys.
                        </p>
                      </div>

                      <div>
                        <p className="font-semibold text-gray-800">4. Paste into Clumo &amp; test</p>
                        <p>
                          Enter the endpoint, API key, and the three deployment names above, then click
                          <strong> Test Connection</strong>. That's it — your keys never leave this machine.
                        </p>
                      </div>

                      <div className="bg-amber-50 border border-amber-200 rounded-md p-2.5 text-amber-900 space-y-1.5">
                        <p className="font-semibold">Keep transcripts &amp; prompts private</p>
                        <ul className="ml-1 space-y-1">
                          <li className="flex gap-2">
                            <span className="shrink-0">&#8226;</span>
                            <span>Use a <strong>dedicated Azure resource and key</strong> for Clumo — don't reuse a shared team key.</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="shrink-0">&#8226;</span>
                            <span>Where your subscription is eligible, apply to <strong>disable Azure OpenAI content logging / abuse-monitoring human review</strong> (the "no data retention" path) so your prompts and transcripts aren't stored or reviewed by the provider.</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="shrink-0">&#8226;</span>
                            <span>Pick a <strong>region</strong> that satisfies your data-residency and compliance rules.</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="shrink-0">&#8226;</span>
                            <span><strong>Never share or commit your key.</strong> Clumo encrypts it at rest (AES-256) and never shows it again once saved. Rotate the key immediately if you suspect it's exposed.</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="shrink-0">&#8226;</span>
                            <span>Everything stays local; only audio, short transcript excerpts, embeddings, and the post-call transcript go to <em>your</em> Azure resource over an encrypted (TLS) connection. Keep the machine itself secured.</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  )}
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
                      <span className="font-medium text-gray-800">Transcription: gpt-4o-mini-transcribe</span>
                      <span className="ml-1.5 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">default</span>
                      <p className="mt-0.5">Streaming transcription model that returns partial results as the customer speaks, so live suggestions surface in around a second instead of waiting for the full sentence.</p>
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

            {onboardingStatus === 'idle' && (
              <OnboardingWizard onSubmit={handleStartOnboarding} onBack={() => setStep(1)} />
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
                      {typeof onboardingCounts.productTruths === 'number' && (
                        <li>{onboardingCounts.productTruths} product truths</li>
                      )}
                    </ul>
                  )}
                </div>

                {/* Per-type warnings: surface degraded/missing coverage so the user can act */}
                {onboardingCoverage && (() => {
                  const labels = {
                    case_study: 'Case studies',
                    proof_point: 'Proof points',
                    product_truth: 'Product truths',
                    discovery_question: 'Discovery questions'
                  };
                  const warnings = Object.entries(onboardingCoverage)
                    .filter(([, c]) => c && c.warning)
                    .map(([type, c]) => ({ type, label: labels[type] || type, ...c }));
                  if (warnings.length === 0) return null;
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-4">
                      <p className="text-sm font-medium text-amber-800 mb-2">Some sources came back thin</p>
                      <ul className="text-sm text-amber-700 space-y-1.5">
                        {warnings.map(w => (
                          <li key={w.type} className="flex gap-2">
                            <span className="text-amber-400 shrink-0">&#8226;</span>
                            <span><strong>{w.label}:</strong> {w.warning}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-amber-600 mt-2">
                        You can paste specific URLs and re-run, or add them later from the Knowledge Base page.
                      </p>
                      <button
                        onClick={() => { setOnboardingStatus('idle'); setOnboardingMessages([]); }}
                        className="mt-3 px-3 py-1.5 border border-amber-300 bg-white rounded-md text-sm font-medium text-amber-800 hover:bg-amber-100"
                      >
                        Add a source &amp; re-run
                      </button>
                    </div>
                  );
                })()}

                <button
                  onClick={() => setStep(3)}
                  className="w-full px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800"
                >
                  Set up your Coach →
                </button>
              </div>
            )}

            {onboardingStatus === 'error' && (
              <div>
                {onboardingMessages.length > 0 && (
                  <div className="space-y-1 max-h-60 overflow-y-auto bg-gray-50 rounded-md p-3 text-sm text-gray-600 mb-4">
                    {onboardingMessages.map((msg, i) => (
                      <div key={i} className={msg.startsWith('Error:') ? 'text-red-600 font-medium' : ''}>{msg}</div>
                    ))}
                  </div>
                )}
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

        {/* Step 3: Set up your Coach */}
        {step === 3 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-1">Step 3: Set up your Coach</h2>
            <p className="text-sm text-gray-500 mb-4">
              We drafted this from your knowledge base — who you are and how you win. Review and
              edit it, then start your first meeting. The coach uses it to ground every nudge in
              your world.
            </p>
            <PlaybookEditor onContinue={handleFinish} />
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          Step {step} of 3
        </p>

        {showSecurity && <SecurityModal onClose={() => setShowSecurity(false)} />}
      </div>
    </div>
  );
}
