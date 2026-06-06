import { useState, useEffect, useRef } from 'react';

export default function KB() {
  const [kb, setKb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('caseStudies');
  const [adding, setAdding] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [addFiles, setAddFiles] = useState([]);
  const [addStatus, setAddStatus] = useState('idle');
  const [addMessages, setAddMessages] = useState([]);
  const fileInputRef = useRef(null);

  // First-time setup state
  const [setupUrl, setSetupUrl] = useState('');
  const [setupFiles, setSetupFiles] = useState([]);
  const [setupStatus, setSetupStatus] = useState('idle');
  const [setupMessages, setSetupMessages] = useState([]);
  const [setupCounts, setSetupCounts] = useState(null);
  const setupFileRef = useRef(null);

  const [confirmReset, setConfirmReset] = useState(false);

  async function handleResetKB() {
    const res = await fetch('/api/onboarding/knowledge-base', { method: 'DELETE' });
    if (res.ok) {
      setKb(null);
      setConfirmReset(false);
      setSetupStatus('idle');
      setSetupMessages([]);
      setSetupCounts(null);
    }
  }

  useEffect(() => {
    loadKB();
  }, []);

  function loadKB() {
    setLoading(true);
    fetch('/api/onboarding/knowledge-base')
      .then(res => {
        if (!res.ok) throw new Error('No KB');
        return res.json();
      })
      .then(data => { setKb(data); setLoading(false); })
      .catch(() => setLoading(false));
  }

  async function handleFirstTimeSetup() {
    setSetupStatus('running');
    setSetupMessages([]);

    // Pre-check: verify AI provider is configured
    try {
      const statusRes = await fetch('/api/status');
      const status = await statusRes.json();
      if (!status.setupComplete) {
        setSetupMessages(['AI provider not configured. Go to Settings → AI Models to add your API key first.']);
        setSetupStatus('error');
        return;
      }
    } catch (e) {
      setSetupMessages(['Could not check server status. Is the server running?']);
      setSetupStatus('error');
      return;
    }

    // Upload files first if any
    let filesToSend = [];
    if (setupFiles.length > 0) {
      const formData = new FormData();
      for (const f of setupFiles) {
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

    // Start onboarding pipeline
    const startRes = await fetch('/api/onboarding/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        websiteUrl: setupUrl || null,
        uploadedFiles: filesToSend.length > 0 ? filesToSend : null
      })
    });

    if (!startRes.ok) {
      const err = await startRes.json();
      setSetupMessages([`Error: ${err.error}`]);
      setSetupStatus('error');
      return;
    }

    const { sseToken } = await startRes.json();

    // First verify the stream endpoint is accessible (handles provider-not-configured errors)
    const streamUrl = `/api/onboarding/stream?token=${sseToken}`;
    const eventSource = new EventSource(streamUrl);

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setSetupMessages(prev => [...prev, data.message]);
    });

    eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      setSetupCounts(data.counts);
      setSetupStatus('complete');
      eventSource.close();
      loadKB();
    });

    eventSource.addEventListener('error', (e) => {
      try {
        const data = JSON.parse(e.data);
        setSetupMessages(prev => [...prev, `Error: ${data.message}`]);
      } catch {
        setSetupMessages(prev => [...prev, 'AI provider not configured or connection failed. Go to Settings → AI Models to configure your provider.']);
      }
      setSetupStatus('error');
      eventSource.close();
    });
  }

  async function handleAddContent() {
    setAddStatus('running');
    setAddMessages([]);

    const formData = new FormData();
    if (addUrl) formData.append('websiteUrl', addUrl);
    for (const f of addFiles) {
      formData.append('documents', f);
    }

    const res = await fetch('/api/onboarding/add-documents', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      setAddMessages([`Error: ${err.error}`]);
      setAddStatus('error');
      return;
    }

    const { sseToken } = await res.json();
    const eventSource = new EventSource(`/api/onboarding/stream?token=${sseToken}`);

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setAddMessages(prev => [...prev, data.message]);
    });

    eventSource.addEventListener('complete', () => {
      setAddStatus('complete');
      eventSource.close();
      loadKB();
    });

    eventSource.addEventListener('error', () => {
      setAddStatus('error');
      eventSource.close();
    });
  }

  if (loading) return <div className="p-6 text-gray-500 dark:text-gray-400">Loading knowledge base...</div>;

  const tabs = {
    caseStudies: { label: 'Case Studies', items: kb?.caseStudies || [] },
    discoveryQuestions: { label: 'Discovery Questions', items: kb?.discoveryQuestions || [] },
    proofPoints: { label: 'Proof Points', items: kb?.proofPoints || [] },
    productTruths: { label: 'Product Truths', items: kb?.productTruths || [] }
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Knowledge Base</h1>
          {kb?.companyProfile?.companyName && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{kb.companyProfile.companyName}</p>
          )}
        </div>
        {kb && (
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmReset(true)}
              className="px-4 py-2 border border-red-300 dark:border-red-600 text-red-700 dark:text-red-400 rounded-md text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Re-run Onboarding
            </button>
            <button
              onClick={() => setAdding(!adding)}
              className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200"
            >
              {adding ? 'Cancel' : 'Add Content'}
            </button>
          </div>
        )}
      </div>

      {/* Reset confirmation dialog */}
      {confirmReset && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 mb-6">
          <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-3">
            This will delete your entire knowledge base and restart the onboarding process. Are you sure?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleResetKB}
              className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700"
            >
              Yes, reset and re-run
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add content panel (for existing KB) */}
      {adding && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
          {addStatus === 'idle' && (
            <div className="space-y-3">
              <input
                type="url"
                placeholder="Additional website URL"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm"
                value={addUrl}
                onChange={e => setAddUrl(e.target.value)}
              />
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.pptx,.md,.txt"
                className="text-sm text-gray-700 dark:text-gray-300"
                onChange={e => setAddFiles(Array.from(e.target.files))}
              />
              <button
                onClick={handleAddContent}
                disabled={!addUrl && addFiles.length === 0}
                className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
              >
                Process
              </button>
            </div>
          )}
          {addStatus === 'running' && (
            <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
              {addMessages.map((msg, i) => <div key={i}>{msg}</div>)}
              <div className="animate-pulse">Processing...</div>
            </div>
          )}
          {addStatus === 'complete' && (
            <div className="text-sm text-green-700 dark:text-green-400">Content added successfully.
              <button onClick={() => { setAdding(false); setAddStatus('idle'); setAddMessages([]); setAddUrl(''); setAddFiles([]); }}
                className="ml-2 text-blue-600 dark:text-blue-400 hover:underline">Done</button>
            </div>
          )}
          {addStatus === 'error' && (
            <div className="text-sm text-red-700 dark:text-red-400">
              {addMessages[addMessages.length - 1] || 'Something went wrong'}
              <button onClick={() => setAddStatus('idle')} className="ml-2 text-blue-600 dark:text-blue-400 hover:underline">Try again</button>
            </div>
          )}
        </div>
      )}

      {!kb ? (
        /* First-time KB setup — inline form */
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Build your knowledge base</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
            Enter your company website and/or upload sales documents. Clumo will extract case studies,
            discovery questions, and proof points to use during live calls.
          </p>

          {setupStatus === 'idle' && (
            <div className="space-y-4">
              <input
                type="url"
                placeholder="Company website URL (e.g. https://yourcompany.com)"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm"
                value={setupUrl}
                onChange={e => setSetupUrl(e.target.value)}
              />
              <div>
                <input
                  ref={setupFileRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.pptx,.md,.txt"
                  className="hidden"
                  onChange={e => setSetupFiles(Array.from(e.target.files))}
                />
                <button
                  type="button"
                  onClick={() => setupFileRef.current.click()}
                  className="w-full px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-900 dark:hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Upload Documents (.pdf, .docx, .pptx, .md, .txt)
                </button>
                {setupFiles.length > 0 && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 font-medium">{setupFiles.length} file(s) selected</p>
                )}
              </div>
              <button
                onClick={handleFirstTimeSetup}
                disabled={!setupUrl && setupFiles.length === 0}
                className="w-full px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
              >
                Generate Knowledge Base
              </button>
            </div>
          )}

          {setupStatus === 'running' && (
            <div className="space-y-1 max-h-60 overflow-y-auto bg-gray-50 dark:bg-gray-700 rounded-md p-3 text-sm text-gray-600 dark:text-gray-400">
              {setupMessages.map((msg, i) => (
                <div key={i}>{msg}</div>
              ))}
              <div className="animate-pulse">Processing...</div>
            </div>
          )}

          {setupStatus === 'complete' && (
            <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-md p-4">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">Knowledge base generated!</p>
              {setupCounts && (
                <ul className="text-sm text-green-700 dark:text-green-400 mt-2 space-y-1">
                  <li>{setupCounts.caseStudies} case studies</li>
                  <li>{setupCounts.discoveryQuestions} discovery questions</li>
                  <li>{setupCounts.proofPoints} proof points</li>
                  {setupCounts.productTruths > 0 && <li>{setupCounts.productTruths} product truths</li>}
                </ul>
              )}
            </div>
          )}

          {setupStatus === 'error' && (
            <div>
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md p-3 mb-3">
                <p className="text-sm text-red-800 dark:text-red-300">
                  {setupMessages[setupMessages.length - 1] || 'Something went wrong. Check your AI provider settings are configured correctly.'}
                </p>
              </div>
              <button
                onClick={() => { setSetupStatus('idle'); setSetupMessages([]); }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
            {Object.entries(tabs).map(([key, { label, items }]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === key
                    ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {label} ({items.length})
              </button>
            ))}
          </div>

          {/* Items */}
          <div className="space-y-3">
            {tabs[tab].items.map((item, i) => (
              <div key={item.id || i} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                {tab === 'caseStudies' && (
                  <>
                    <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{item.company} — {item.headline}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{item.result}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(item.triggers || []).slice(0, 5).map((t, j) => (
                        <span key={j} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  </>
                )}
                {tab === 'discoveryQuestions' && (
                  <>
                    <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{item.question}</p>
                    {item.context && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{item.context}</p>}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(item.triggers || []).slice(0, 5).map((t, j) => (
                        <span key={j} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  </>
                )}
                {tab === 'proofPoints' && (
                  <>
                    <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{item.stat}</p>
                    {item.source && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Source: {item.source}</p>}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(item.triggers || []).slice(0, 5).map((t, j) => (
                        <span key={j} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  </>
                )}
                {tab === 'productTruths' && (
                  <>
                    <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{item.fact}</p>
                    {item.category && (
                      <span className="inline-block mt-1 text-xs bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">{item.category}</span>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(item.triggers || []).slice(0, 5).map((t, j) => (
                        <span key={j} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
