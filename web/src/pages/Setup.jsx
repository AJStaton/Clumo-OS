import { useState, useRef, useEffect } from 'react';

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

// Free-text chip input: type and press Enter (or comma) to add a chip; Backspace on empty removes the last.
function ChipInput({ value = [], onChange, placeholder }) {
  const [text, setText] = useState('');
  function commit(raw) {
    const v = (raw || '').trim().replace(/,$/, '').trim();
    if (!v) return;
    if (!value.some(x => x.toLowerCase() === v.toLowerCase())) onChange([...value, v]);
    setText('');
  }
  return (
    <div className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm flex flex-wrap gap-1.5 items-center focus-within:border-gray-900">
      {value.map((chip, i) => (
        <span key={i} className="inline-flex items-center gap-1 bg-gray-100 text-gray-800 rounded-full px-2 py-0.5 text-xs font-medium">
          {chip}
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-gray-400 hover:text-gray-700 leading-none">&times;</button>
        </span>
      ))}
      <input
        type="text"
        className="flex-1 min-w-[8rem] px-1 py-0.5 outline-none text-sm"
        placeholder={value.length === 0 ? placeholder : ''}
        value={text}
        onChange={e => {
          const v = e.target.value;
          if (v.endsWith(',')) commit(v);
          else setText(v);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(text); }
          else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => commit(text)}
      />
    </div>
  );
}

// Toggle chips from a preset list. Optional free-add via allowAdd.
function PresetChips({ options, value = [], onChange, allowAdd = false, addPlaceholder = 'Add…' }) {
  const [text, setText] = useState('');
  const merged = [...options];
  for (const v of value) if (!merged.some(o => o.toLowerCase() === v.toLowerCase())) merged.push(v);
  function toggle(opt) {
    if (value.some(x => x.toLowerCase() === opt.toLowerCase())) onChange(value.filter(x => x.toLowerCase() !== opt.toLowerCase()));
    else onChange([...value, opt]);
  }
  function add(raw) {
    const v = (raw || '').trim();
    if (!v) return;
    if (!value.some(x => x.toLowerCase() === v.toLowerCase())) onChange([...value, v]);
    setText('');
  }
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {merged.map(opt => {
        const active = value.some(x => x.toLowerCase() === opt.toLowerCase());
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'}`}
          >
            {opt}
          </button>
        );
      })}
      {allowAdd && (
        <input
          type="text"
          className="min-w-[7rem] px-2 py-1 border border-gray-300 rounded-full text-xs outline-none focus:border-gray-900"
          placeholder={addPlaceholder}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(text); } }}
          onBlur={() => add(text)}
        />
      )}
    </div>
  );
}

const ROLE_OPTIONS = [
  { v: 'AE', l: 'Account Executive' },
  { v: 'SE', l: 'Solution Engineer' },
  { v: 'FDE', l: 'Forward Deployed Engineer' },
  { v: 'Other', l: 'Other' }
];
const SIZE_PRESETS = ['SMB', 'Mid-market', 'Enterprise'];
const PERSONA_PRESETS = ['CEO', 'CFO', 'CTO', 'CIO', 'CMO', 'COO', 'VP Sales', 'VP Engineering', 'RevOps', 'Head of IT'];

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
  const fileInputRef = useRef(null);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [files, setFiles] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [onboardingStatus, setOnboardingStatus] = useState('idle');
  const [onboardingMessages, setOnboardingMessages] = useState([]);
  const [onboardingCounts, setOnboardingCounts] = useState(null);
  const [onboardingCoverage, setOnboardingCoverage] = useState(null);

  // Guided onboarding wizard state
  const [obStep, setObStep] = useState('profile'); // profile | website | priorities | sources
  const [profile, setProfile] = useState({
    role: '',
    focusProducts: [],
    focusIndustries: [],
    companySize: [],
    personas: [],
    competitors: []
  });
  const [sourceUrls, setSourceUrls] = useState({ caseStudies: '', blog: '', docs: '' });
  const [sourceDirty, setSourceDirty] = useState({ caseStudies: false, blog: false, docs: false });
  const [scanStatus, setScanStatus] = useState('idle'); // idle | scanning | done | failed
  const [scanResult, setScanResult] = useState(null); // {products,solutions,hubs}
  const [scanNotice, setScanNotice] = useState('');
  const [priorities, setPriorities] = useState([]); // selected product/solution labels
  const scanReqId = useRef(0);
  const eventSourceRef = useRef(null);

  // Tear down any live SSE stream on unmount.
  useEffect(() => () => { try { eventSourceRef.current?.close(); } catch { /* noop */ } }, []);

  // Edit a source-URL field and mark it dirty so a later re-scan won't clobber the user's input.
  function editSourceUrl(key, val) {
    setSourceUrls(prev => ({ ...prev, [key]: val }));
    setSourceDirty(prev => ({ ...prev, [key]: true }));
  }

  // Split a textarea/comma string into a clean array of URLs or terms.
  function splitList(value) {
    return (value || '')
      .split(/[\n,]/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function buildSourcePayload() {
    return {
      caseStudies: splitList(sourceUrls.caseStudies),
      blog: splitList(sourceUrls.blog),
      docs: splitList(sourceUrls.docs)
    };
  }

  function buildProfilePayload() {
    const p = {
      role: profile.role || '',
      focusProducts: profile.focusProducts,
      focusIndustries: profile.focusIndustries,
      companySize: profile.companySize,
      personas: profile.personas,
      competitors: profile.competitors
    };
    const hasAny = p.role || p.focusProducts.length || p.focusIndustries.length ||
      p.companySize.length || p.personas.length || p.competitors.length;
    return hasAny ? p : null;
  }

  // Dedupe products + solutions into a single ordered list of {label,kind}.
  function scanAreas(scan) {
    const out = [];
    const seen = new Set();
    for (const a of [...(scan?.products || []), ...(scan?.solutions || [])]) {
      const key = (a.label || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ label: a.label, kind: (scan.products || []).includes(a) ? 'product' : 'solution' });
    }
    return out;
  }

  // Which detected areas best match what the seller said they focus on.
  function defaultPriorities(areas, focusProducts) {
    const fp = (focusProducts || []).map(s => s.toLowerCase());
    return areas
      .filter(a => fp.some(f => a.label.toLowerCase().includes(f) || f.includes(a.label.toLowerCase())))
      .map(a => a.label);
  }

  async function handleScan() {
    const url = (websiteUrl || '').trim();
    if (!url) return;
    const reqId = ++scanReqId.current;
    setScanStatus('scanning');
    setScanNotice('');
    try {
      const res = await fetch('/api/onboarding/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteUrl: url })
      });
      if (reqId !== scanReqId.current) return; // a newer scan superseded this one
      const data = res.ok ? await res.json() : { products: [], solutions: [], hubs: {}, error: 'scan_failed' };
      const areas = scanAreas(data);

      if (data.error || areas.length === 0) {
        setScanResult(data);
        setScanStatus('failed');
        setPriorities([]);
        setScanNotice("We couldn't detect products automatically. Paste specific source URLs below, or continue with your uploads.");
        prefillSources(data.hubs || {});
        setObStep('sources');
        return;
      }

      setScanResult(data);
      setScanStatus('done');
      // Reconcile selection: keep prior picks that still exist, then add fresh matches.
      const labels = new Set(areas.map(a => a.label));
      const kept = priorities.filter(p => labels.has(p));
      const fresh = defaultPriorities(areas, profile.focusProducts);
      setPriorities([...new Set([...kept, ...fresh])]);
      prefillSources(data.hubs || {});
      setObStep('priorities');
    } catch (e) {
      if (reqId !== scanReqId.current) return;
      setScanStatus('failed');
      setPriorities([]);
      setScanNotice('Site scan failed. Paste specific source URLs below, or continue with your uploads.');
      setObStep('sources');
    }
  }

  // Pre-fill detected hub URLs without overwriting fields the user has edited.
  function prefillSources(hubs) {
    setSourceUrls(prev => {
      const next = { ...prev };
      const map = { caseStudies: hubs.caseStudies, blog: hubs.blog, docs: hubs.docs };
      for (const key of Object.keys(map)) {
        if (map[key] && !sourceDirty[key]) next[key] = map[key];
      }
      return next;
    });
  }

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
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { valid: false, error: text || 'Connection test failed — no response from server' };
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
    if (onboardingStatus === 'running') return; // guard against double-submit
    setOnboardingStatus('running');
    setOnboardingMessages([]);
    setOnboardingCounts(null);
    setOnboardingCoverage(null);
    try { eventSourceRef.current?.close(); } catch { /* noop */ }

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
        uploadedFiles: filesToSend.length > 0 ? filesToSend : null,
        sourceUrls: buildSourcePayload(),
        profile: buildProfilePayload(),
        priorities
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

            {onboardingStatus === 'idle' && (
              <>
                {/* Guided-step breadcrumb */}
                <div className="flex items-center gap-1.5 mb-5 text-xs">
                  {[['profile', 'About you'], ['website', 'Website'], ['priorities', 'Priorities'], ['sources', 'Sources']].map(([key, label], i) => {
                    const order = ['profile', 'website', 'priorities', 'sources'];
                    const active = obStep === key;
                    const done = order.indexOf(obStep) > order.indexOf(key);
                    return (
                      <span key={key} className="flex items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 font-medium ${active ? 'bg-gray-900 text-white' : done ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-400'}`}>{label}</span>
                        {i < 3 && <span className="text-gray-300">&rsaquo;</span>}
                      </span>
                    );
                  })}
                </div>

                {/* Sub-step: About you (5 structured fields, no LLM, no API key needed) */}
                {obStep === 'profile' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-500">
                      A few quick taps tailor discovery questions and rank case studies to what you actually sell. All optional.
                    </p>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Your role</label>
                      <div className="flex flex-wrap gap-1.5">
                        {ROLE_OPTIONS.map(o => (
                          <button
                            key={o.v}
                            type="button"
                            onClick={() => setProfile({ ...profile, role: profile.role === o.v ? '' : o.v })}
                            className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${profile.role === o.v ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'}`}
                          >
                            {o.l}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Products you sell</label>
                      <ChipInput value={profile.focusProducts} onChange={v => setProfile({ ...profile, focusProducts: v })} placeholder="e.g. Azure OpenAI, AI Foundry, Fabric" />
                      <p className="text-xs text-gray-400 mt-1">Highest-leverage signal — case studies are ranked to these.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Industries you target</label>
                      <ChipInput value={profile.focusIndustries} onChange={v => setProfile({ ...profile, focusIndustries: v })} placeholder="e.g. Financial services, Telco" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Company size</label>
                      <PresetChips options={SIZE_PRESETS} value={profile.companySize} onChange={v => setProfile({ ...profile, companySize: v })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Buyer personas</label>
                      <PresetChips options={PERSONA_PRESETS} value={profile.personas} onChange={v => setProfile({ ...profile, personas: v })} allowAdd addPlaceholder="Add title…" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Key competitors <span className="text-gray-400 font-normal">(optional)</span></label>
                      <ChipInput value={profile.competitors} onChange={v => setProfile({ ...profile, competitors: v })} placeholder="e.g. Competitor A, Competitor B" />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setStep(1)} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50">Back</button>
                      <button onClick={() => setObStep('website')} className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800">Next</button>
                    </div>
                  </div>
                )}

                {/* Sub-step: Website + optional document upload */}
                {obStep === 'website' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-500">Where should Clumo look? We read only this site — no third-party search.</p>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Company website</label>
                      <input
                        type="url"
                        placeholder="https://yourcompany.com"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        value={websiteUrl}
                        onChange={e => setWebsiteUrl(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Upload documents (optional)</label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.docx,.pptx,.md,.txt"
                        className="hidden"
                        onChange={e => setFiles(Array.from(e.target.files))}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current.click()}
                        className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:border-gray-900 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Choose Files
                      </button>
                      {files.length > 0 && (
                        <p className="text-sm text-gray-600 mt-2 font-medium">{files.length} file(s) selected</p>
                      )}
                    </div>
                    {scanStatus === 'scanning' && (
                      <div className="text-sm text-gray-500 animate-pulse">Scanning {websiteUrl} …</div>
                    )}
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setObStep('profile')} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50">Back</button>
                      <button
                        onClick={handleScan}
                        disabled={!websiteUrl.trim() || scanStatus === 'scanning'}
                        className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                      >
                        {scanStatus === 'scanning' ? 'Scanning…' : 'Scan my site'}
                      </button>
                    </div>
                    <button onClick={() => setObStep('sources')} className="w-full text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2">
                      Skip scan and enter sources manually
                    </button>
                  </div>
                )}

                {/* Sub-step: Pick priorities from detected areas */}
                {obStep === 'priorities' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-500">
                      We detected these areas on your site. Pick what you sell — case studies and proof points are ranked to your picks.
                    </p>
                    {(() => {
                      const areas = scanAreas(scanResult);
                      if (areas.length === 0) {
                        return <p className="text-sm text-gray-500">No product areas detected. You can continue and confirm sources next.</p>;
                      }
                      return (
                        <div className="flex flex-wrap gap-1.5">
                          {areas.map(a => {
                            const active = priorities.includes(a.label);
                            return (
                              <button
                                key={a.label}
                                type="button"
                                onClick={() => setPriorities(active ? priorities.filter(p => p !== a.label) : [...priorities, a.label])}
                                className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'}`}
                              >
                                {a.label}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setObStep('website')} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50">Back</button>
                      <button onClick={() => setObStep('sources')} className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800">Next</button>
                    </div>
                  </div>
                )}

                {/* Sub-step: Confirm / supply source URLs */}
                {obStep === 'sources' && (
                  <div className="space-y-4">
                    {scanNotice && (
                      <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">{scanNotice}</div>
                    )}
                    <p className="text-sm text-gray-500">
                      Confirm or paste the exact pages for each type. One URL per line.{scanStatus === 'done' ? ' Pre-filled from your site scan.' : ''}
                    </p>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Customer / case-study pages</label>
                      <textarea
                        rows={2}
                        placeholder="https://yourcompany.com/customers"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
                        value={sourceUrls.caseStudies}
                        onChange={e => editSourceUrl('caseStudies', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Blog / research / ROI pages</label>
                      <textarea
                        rows={2}
                        placeholder="https://yourcompany.com/blog"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
                        value={sourceUrls.blog}
                        onChange={e => editSourceUrl('blog', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Docs / product pages</label>
                      <textarea
                        rows={2}
                        placeholder="https://docs.yourcompany.com"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
                        value={sourceUrls.docs}
                        onChange={e => editSourceUrl('docs', e.target.value)}
                      />
                    </div>
                    {priorities.length > 0 && (
                      <p className="text-xs text-gray-400">Ranking case studies to: {priorities.join(', ')}</p>
                    )}
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setObStep(scanStatus === 'done' ? 'priorities' : 'website')} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50">Back</button>
                      <button
                        onClick={handleStartOnboarding}
                        disabled={!websiteUrl.trim() && files.length === 0 && !sourceUrls.caseStudies.trim() && !sourceUrls.blog.trim() && !sourceUrls.docs.trim()}
                        className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                      >
                        Generate Knowledge Base
                      </button>
                    </div>
                  </div>
                )}
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
                        onClick={() => { setObStep('sources'); setOnboardingStatus('idle'); setOnboardingMessages([]); }}
                        className="mt-3 px-3 py-1.5 border border-amber-300 bg-white rounded-md text-sm font-medium text-amber-800 hover:bg-amber-100"
                      >
                        Add a source &amp; re-run
                      </button>
                    </div>
                  );
                })()}

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

        <p className="text-center text-xs text-gray-400 mt-6">
          Step {step} of 2
        </p>

        {showSecurity && <SecurityModal onClose={() => setShowSecurity(false)} />}
      </div>
    </div>
  );
}
