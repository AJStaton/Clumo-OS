import { useState, useEffect, useRef } from 'react';
import { useBackgroundProcess } from '../context/BackgroundProcessContext';
import OnboardingWizard from '../components/OnboardingWizard';
import PlaybookEditor from '../components/PlaybookEditor';

const ONBOARDING_PROCESS_ID = 'kb-onboarding';
const ADD_CONTENT_PROCESS_ID = 'kb-add-content';

export default function KB() {
  const { processes, startProcess, clearProcess } = useBackgroundProcess();
  const [kb, setKb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('caseStudies');
  const [adding, setAdding] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [addFiles, setAddFiles] = useState([]);
  const fileInputRef = useRef(null);

  // First-time setup is handled by the shared OnboardingWizard component.

  // Derive status from background processes
  const onboardingProcess = processes[ONBOARDING_PROCESS_ID];
  const addContentProcess = processes[ADD_CONTENT_PROCESS_ID];
  const setupStatus = onboardingProcess?.status || 'idle';
  const setupMessages = onboardingProcess?.messages || [];
  const setupCounts = onboardingProcess?.counts || null;
  const setupCoverage = onboardingProcess?.coverage || null;
  const addStatus = addContentProcess?.status || 'idle';
  const addMessages = addContentProcess?.messages || [];

  const [confirmReset, setConfirmReset] = useState(false);

  async function handleResetKB() {
    const res = await fetch('/api/onboarding/knowledge-base', { method: 'DELETE' });
    if (res.ok) {
      setKb(null);
      setConfirmReset(false);
      clearProcess(ONBOARDING_PROCESS_ID);
    }
  }

  useEffect(() => {
    loadKB();
  }, []);

  // Reload KB when onboarding completes (handles case where user navigated away and back)
  useEffect(() => {
    if (setupStatus === 'complete' && !kb) {
      loadKB();
    }
  }, [setupStatus]);

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

  async function handleFirstTimeSetup({ websiteUrl, files, profile, priorities, sourceUrls }) {
    // Pre-check: verify AI provider is configured
    try {
      const statusRes = await fetch('/api/status');
      const status = await statusRes.json();
      if (!status.setupComplete) {
        clearProcess(ONBOARDING_PROCESS_ID);
        startProcess(ONBOARDING_PROCESS_ID, {
          sseToken: '__invalid__', onComplete: () => {}
        });
        // Manually set error — startProcess won't work with invalid token
        // Use a direct approach instead
        return;
      }
    } catch (e) {
      return;
    }

    // Upload files first if any
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

    // Start onboarding pipeline
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
      return;
    }

    const { sseToken } = await startRes.json();
    startProcess(ONBOARDING_PROCESS_ID, {
      sseToken,
      onComplete: () => loadKB()
    });
  }

  async function handleAddContent() {
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
      return;
    }

    const { sseToken } = await res.json();
    startProcess(ADD_CONTENT_PROCESS_ID, {
      sseToken,
      onComplete: () => loadKB()
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
              <button onClick={() => { setAdding(false); clearProcess(ADD_CONTENT_PROCESS_ID); setAddUrl(''); setAddFiles([]); }}
                className="ml-2 text-blue-600 dark:text-blue-400 hover:underline">Done</button>
            </div>
          )}
          {addStatus === 'error' && (
            <div className="text-sm text-red-700 dark:text-red-400">
              {addMessages[addMessages.length - 1] || 'Something went wrong'}
              <button onClick={() => clearProcess(ADD_CONTENT_PROCESS_ID)} className="ml-2 text-blue-600 dark:text-blue-400 hover:underline">Try again</button>
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
            <OnboardingWizard onSubmit={handleFirstTimeSetup} />
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
              {setupCoverage && (() => {
                const labels = {
                  case_study: 'Case studies',
                  proof_point: 'Proof points',
                  product_truth: 'Product truths',
                  discovery_question: 'Discovery questions'
                };
                const warnings = Object.entries(setupCoverage)
                  .filter(([, c]) => c && c.warning)
                  .map(([type, c]) => ({ type, label: labels[type] || type, ...c }));
                if (warnings.length === 0) return null;
                return (
                  <div className="mt-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-md p-3">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1.5">Some sources came back thin</p>
                    <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1">
                      {warnings.map(w => (
                        <li key={w.type}><strong>{w.label}:</strong> {w.warning}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-1.5">Add a docs, blog, or customer-story URL and re-run for more.</p>
                  </div>
                );
              })()}
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
                onClick={() => clearProcess(ONBOARDING_PROCESS_ID)}
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
            <button
              onClick={() => setTab('playbook')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === 'playbook'
                  ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              Playbook
            </button>
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

          {/* Playbook editor */}
          {tab === 'playbook' && <PlaybookEditor />}

          {/* Items */}
          {tab !== 'playbook' && (
          <div className="space-y-3">
            {tabs[tab].items.map((item, i) => (
              <div key={item.id || i} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                {tab === 'caseStudies' && (
                  <>
                    <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{item.company}: {item.headline}</p>
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
                    {item.link && (
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className="block text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 truncate">
                        Source: {item.link}
                      </a>
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
          )}
        </>
      )}
    </div>
  );
}
