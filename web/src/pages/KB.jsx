import { useState, useEffect } from 'react';

export default function KB() {
  const [kb, setKb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('caseStudies');
  const [adding, setAdding] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [addFiles, setAddFiles] = useState([]);
  const [addStatus, setAddStatus] = useState('idle');
  const [addMessages, setAddMessages] = useState([]);

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

  if (loading) return <div className="p-6 text-gray-500">Loading knowledge base...</div>;

  const tabs = {
    caseStudies: { label: 'Case Studies', items: kb?.caseStudies || [] },
    discoveryQuestions: { label: 'Discovery Questions', items: kb?.discoveryQuestions || [] },
    proofPoints: { label: 'Proof Points', items: kb?.proofPoints || [] }
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Knowledge Base</h1>
          {kb?.companyProfile?.companyName && (
            <p className="text-sm text-gray-500">{kb.companyProfile.companyName}</p>
          )}
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800"
        >
          {adding ? 'Cancel' : 'Add Content'}
        </button>
      </div>

      {/* Add content panel */}
      {adding && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          {addStatus === 'idle' && (
            <div className="space-y-3">
              <input
                type="url"
                placeholder="Additional website URL"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                value={addUrl}
                onChange={e => setAddUrl(e.target.value)}
              />
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.pptx,.md,.txt"
                className="text-sm"
                onChange={e => setAddFiles(Array.from(e.target.files))}
              />
              <button
                onClick={handleAddContent}
                disabled={!addUrl && addFiles.length === 0}
                className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                Process
              </button>
            </div>
          )}
          {addStatus === 'running' && (
            <div className="space-y-1 text-sm text-gray-600">
              {addMessages.map((msg, i) => <div key={i}>{msg}</div>)}
              <div className="animate-pulse">Processing...</div>
            </div>
          )}
          {addStatus === 'complete' && (
            <div className="text-sm text-green-700">Content added successfully.
              <button onClick={() => { setAdding(false); setAddStatus('idle'); setAddMessages([]); }}
                className="ml-2 text-blue-600 hover:underline">Done</button>
            </div>
          )}
          {addStatus === 'error' && (
            <div className="text-sm text-red-700">
              {addMessages[addMessages.length - 1]}
              <button onClick={() => setAddStatus('idle')} className="ml-2 text-blue-600 hover:underline">Try again</button>
            </div>
          )}
        </div>
      )}

      {!kb ? (
        <div className="text-center py-12 text-gray-500">
          <p>No knowledge base generated yet.</p>
          <a href="/setup" className="text-blue-600 hover:underline text-sm">Run setup</a>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 mb-4 border-b border-gray-200">
            {Object.entries(tabs).map(([key, { label, items }]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === key
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {label} ({items.length})
              </button>
            ))}
          </div>

          {/* Items */}
          <div className="space-y-3">
            {tabs[tab].items.map((item, i) => (
              <div key={item.id || i} className="bg-white rounded-lg border border-gray-200 p-4">
                {tab === 'caseStudies' && (
                  <>
                    <p className="font-semibold text-sm">{item.company} — {item.headline}</p>
                    <p className="text-sm text-gray-600 mt-1">{item.result}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(item.triggers || []).slice(0, 5).map((t, j) => (
                        <span key={j} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  </>
                )}
                {tab === 'discoveryQuestions' && (
                  <>
                    <p className="font-semibold text-sm">{item.question}</p>
                    {item.context && <p className="text-sm text-gray-500 mt-1">{item.context}</p>}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(item.triggers || []).slice(0, 5).map((t, j) => (
                        <span key={j} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  </>
                )}
                {tab === 'proofPoints' && (
                  <>
                    <p className="font-semibold text-sm">{item.stat}</p>
                    {item.source && <p className="text-sm text-gray-500 mt-1">Source: {item.source}</p>}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(item.triggers || []).slice(0, 5).map((t, j) => (
                        <span key={j} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{t}</span>
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
