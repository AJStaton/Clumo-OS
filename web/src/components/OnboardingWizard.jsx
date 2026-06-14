import { useState, useRef } from 'react';

// Guided knowledge-base onboarding wizard, shared by the first-run Setup page and the
// in-app Knowledge Base page so the two entry points can never drift apart.
//
// Flow: About you -> Website (+ upload) -> Scan -> Priorities -> Confirm sources -> Run.
// Collects a seller profile + product/solution priorities up front, then uses them to softly
// prioritise the generated knowledge — best-matched case studies and proof points lead the
// list while everything well-grounded is still kept (inputs order results, they never filter).
//
// The wizard owns only the "idle" data-gathering UI. It hands the host a complete payload
// via onSubmit; the host owns upload + start + progress/SSE so each page keeps its own
// lifecycle (Setup uses a local EventSource, KB uses the background-process context).

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
    <div className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md text-sm flex flex-wrap gap-1.5 items-center focus-within:border-gray-900 dark:focus-within:border-gray-400">
      {value.map((chip, i) => (
        <span key={i} className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-100 rounded-full px-2 py-0.5 text-xs font-medium">
          {chip}
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 leading-none">&times;</button>
        </span>
      ))}
      <input
        type="text"
        className="flex-1 min-w-[8rem] px-1 py-0.5 outline-none text-sm bg-transparent text-gray-900 dark:text-gray-100"
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
            className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${active ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:border-gray-400'}`}
          >
            {opt}
          </button>
        );
      })}
      {allowAdd && (
        <input
          type="text"
          className="min-w-[7rem] px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-full text-xs outline-none focus:border-gray-900 dark:focus:border-gray-400"
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

function splitList(value) {
  return (value || '').split(/[\n,]/).map(s => s.trim()).filter(Boolean);
}

// Dedupe products + solutions from a scan result into a single ordered list of {label,kind}.
function scanAreas(scan) {
  const out = [];
  const seen = new Set();
  const products = scan?.products || [];
  for (const a of [...products, ...(scan?.solutions || [])]) {
    const key = (a.label || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ label: a.label, kind: products.includes(a) ? 'product' : 'solution' });
  }
  return out;
}

function defaultPriorities(areas, focusProducts) {
  const fp = (focusProducts || []).map(s => s.toLowerCase());
  return areas
    .filter(a => fp.some(f => a.label.toLowerCase().includes(f) || f.includes(a.label.toLowerCase())))
    .map(a => a.label);
}

// onSubmit({ websiteUrl, files, profile, priorities, sourceUrls }) — host does upload + start.
// onBack — optional; renders a Back button on the first step (e.g. to return to a previous page step).
export default function OnboardingWizard({ onSubmit, onBack, submitLabel = 'Generate Knowledge Base' }) {
  const [obStep, setObStep] = useState('profile'); // profile | website | priorities | sources
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [files, setFiles] = useState([]);
  const fileInputRef = useRef(null);
  const [profile, setProfile] = useState({
    role: '', focusProducts: [], focusIndustries: [], companySize: [], personas: [], competitors: []
  });
  const [sourceUrls, setSourceUrls] = useState({ caseStudies: '', blog: '', docs: '' });
  const [sourceDirty, setSourceDirty] = useState({ caseStudies: false, blog: false, docs: false });
  const [scanStatus, setScanStatus] = useState('idle'); // idle | scanning | done | failed
  const [scanResult, setScanResult] = useState(null);
  const [scanNotice, setScanNotice] = useState('');
  const [priorities, setPriorities] = useState([]);
  const scanReqId = useRef(0);

  function editSourceUrl(key, val) {
    setSourceUrls(prev => ({ ...prev, [key]: val }));
    setSourceDirty(prev => ({ ...prev, [key]: true }));
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
      if (reqId !== scanReqId.current) return; // superseded by a newer scan
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
      const labels = new Set(areas.map(a => a.label));
      const kept = priorities.filter(p => labels.has(p));
      const fresh = defaultPriorities(areas, profile.focusProducts);
      setPriorities([...new Set([...kept, ...fresh])]);
      prefillSources(data.hubs || {});
      setObStep('priorities');
    } catch {
      if (reqId !== scanReqId.current) return;
      setScanStatus('failed');
      setPriorities([]);
      setScanNotice('Site scan failed. Paste specific source URLs below, or continue with your uploads.');
      setObStep('sources');
    }
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

  function handleGenerate() {
    onSubmit?.({
      websiteUrl: websiteUrl || null,
      files,
      profile: buildProfilePayload(),
      priorities,
      sourceUrls: {
        caseStudies: splitList(sourceUrls.caseStudies),
        blog: splitList(sourceUrls.blog),
        docs: splitList(sourceUrls.docs)
      }
    });
  }

  const order = ['profile', 'website', 'priorities', 'sources'];

  return (
    <>
      {/* Guided-step breadcrumb */}
      <div className="flex items-center gap-1.5 mb-5 text-xs">
        {[['profile', 'About you'], ['website', 'Website'], ['priorities', 'Priorities'], ['sources', 'Sources']].map(([key, label], i) => {
          const active = obStep === key;
          const done = order.indexOf(obStep) > order.indexOf(key);
          return (
            <span key={key} className="flex items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 font-medium ${active ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : done ? 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'}`}>{label}</span>
              {i < 3 && <span className="text-gray-300 dark:text-gray-600">&rsaquo;</span>}
            </span>
          );
        })}
      </div>

      {/* Sub-step: About you */}
      {obStep === 'profile' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            A few quick taps tailor discovery questions and prioritise case studies toward what you sell. Nothing is excluded. All optional.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Your role</label>
            <div className="flex flex-wrap gap-1.5">
              {ROLE_OPTIONS.map(o => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setProfile({ ...profile, role: profile.role === o.v ? '' : o.v })}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${profile.role === o.v ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:border-gray-400'}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Products you sell</label>
            <ChipInput value={profile.focusProducts} onChange={v => setProfile({ ...profile, focusProducts: v })} placeholder="e.g. Azure OpenAI, AI Foundry, Fabric" />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Highest-leverage signal: your best-matched case studies lead, others still included.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Industries you target</label>
            <ChipInput value={profile.focusIndustries} onChange={v => setProfile({ ...profile, focusIndustries: v })} placeholder="e.g. Financial services, Telco" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Company size</label>
            <PresetChips options={SIZE_PRESETS} value={profile.companySize} onChange={v => setProfile({ ...profile, companySize: v })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Buyer personas</label>
            <PresetChips options={PERSONA_PRESETS} value={profile.personas} onChange={v => setProfile({ ...profile, personas: v })} allowAdd addPlaceholder="Add title…" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Key competitors <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span></label>
            <ChipInput value={profile.competitors} onChange={v => setProfile({ ...profile, competitors: v })} placeholder="e.g. Competitor A, Competitor B" />
          </div>
          <div className="flex gap-3 pt-2">
            {onBack && (
              <button onClick={onBack} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Back</button>
            )}
            <button onClick={() => setObStep('website')} className="flex-1 px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200">Next</button>
          </div>
        </div>
      )}

      {/* Sub-step: Website + optional upload */}
      {obStep === 'website' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Where should Clumo look? We read only this site, with no third-party search.</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Company website</label>
            <input
              type="url"
              placeholder="https://yourcompany.com"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm"
              value={websiteUrl}
              onChange={e => setWebsiteUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Upload documents (optional)</label>
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
              className="w-full px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-900 dark:hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Choose Files
            </button>
            {files.length > 0 && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 font-medium">{files.length} file(s) selected</p>
            )}
          </div>
          {scanStatus === 'scanning' && (
            <div className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">Scanning {websiteUrl} …</div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setObStep('profile')} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Back</button>
            <button
              onClick={handleScan}
              disabled={!websiteUrl.trim() || scanStatus === 'scanning'}
              className="flex-1 px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
            >
              {scanStatus === 'scanning' ? 'Scanning…' : 'Scan my site'}
            </button>
          </div>
          <button onClick={() => setObStep('sources')} className="w-full text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 underline underline-offset-2">
            Skip scan and enter sources manually
          </button>
        </div>
      )}

      {/* Sub-step: Priorities */}
      {obStep === 'priorities' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            We detected these areas on your site. Pick what you sell. Matching case studies and proof points lead the list, others are still included.
          </p>
          {(() => {
            const areas = scanAreas(scanResult);
            if (areas.length === 0) {
              return <p className="text-sm text-gray-500 dark:text-gray-400">No product areas detected. You can continue and confirm sources next.</p>;
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
                      className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${active ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:border-gray-400'}`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            );
          })()}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setObStep('website')} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Back</button>
            <button onClick={() => setObStep('sources')} className="flex-1 px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200">Next</button>
          </div>
        </div>
      )}

      {/* Sub-step: Confirm sources */}
      {obStep === 'sources' && (
        <div className="space-y-4">
          {scanNotice && (
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-sm text-amber-800 dark:text-amber-300">{scanNotice}</div>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Confirm or paste the exact pages for each type. One URL per line.{scanStatus === 'done' ? ' Pre-filled from your site scan.' : ''}
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Customer / case-study pages</label>
            <textarea
              rows={2}
              placeholder="https://yourcompany.com/customers"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm font-mono"
              value={sourceUrls.caseStudies}
              onChange={e => editSourceUrl('caseStudies', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Blog / research / ROI pages</label>
            <textarea
              rows={2}
              placeholder="https://yourcompany.com/blog"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm font-mono"
              value={sourceUrls.blog}
              onChange={e => editSourceUrl('blog', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Docs / product pages</label>
            <textarea
              rows={2}
              placeholder="https://docs.yourcompany.com"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm font-mono"
              value={sourceUrls.docs}
              onChange={e => editSourceUrl('docs', e.target.value)}
            />
          </div>
          {priorities.length > 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500">Prioritising toward: {priorities.join(', ')} (others still included)</p>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setObStep(scanStatus === 'done' ? 'priorities' : 'website')} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Back</button>
            <button
              onClick={handleGenerate}
              disabled={!websiteUrl.trim() && files.length === 0 && !sourceUrls.caseStudies.trim() && !sourceUrls.blog.trim() && !sourceUrls.docs.trim()}
              className="flex-1 px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
            >
              {submitLabel}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
