import { useState, useEffect } from 'react';

// PlaybookEditor — validate + edit the coaching playbook that grounds live nudges.
//
// The playbook is assembled from onboarding (seller profile + company analysis),
// shown here for the rep to correct, then saved and used by the coach during a
// call. Short-token fields (products, personas, competitors) use chips; sentence
// fields (outcomes, differentiators, proof) use one-per-line editors. Competitor
// "traps" are a question per competitor that exposes that competitor's weakness.

function ChipList({ label, hint, value, onChange, placeholder }) {
  const [draft, setDraft] = useState('');
  const items = Array.isArray(value) ? value : [];

  function add(raw) {
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...items];
    for (const p of parts) {
      if (!next.some(x => x.toLowerCase() === p.toLowerCase())) next.push(p);
    }
    onChange(next);
    setDraft('');
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">{hint}</p>}
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {items.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-2 py-1 rounded">
            {item}
            <button type="button" aria-label={`Remove ${item}`} onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-100">×</button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); } }}
        onBlur={() => add(draft)}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm"
      />
    </div>
  );
}

function LinesEditor({ label, hint, value, onChange, placeholder }) {
  const items = Array.isArray(value) ? value : [];
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">{hint}</p>}
      <textarea
        rows={Math.min(8, Math.max(3, items.length + 1))}
        value={items.join('\n')}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value.split('\n').map(s => s.replace(/^\s+/, '')).filter((s, i, arr) => s.trim() || i === arr.length - 1))}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm font-mono"
      />
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">One per line.</p>
    </div>
  );
}

// Keep a trap row for each competitor: preserve existing questions, add empties for
// new competitors, drop traps whose competitor was removed.
function reconcileTraps(competitors, traps) {
  const byName = new Map((traps || []).map(t => [String(t.competitor || '').toLowerCase(), t]));
  return (competitors || []).map(c => ({
    competitor: c,
    question: (byName.get(c.toLowerCase()) || {}).question || ''
  }));
}

export default function PlaybookEditor({ onContinue, onChange }) {
  const [pb, setPb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error

  useEffect(() => {
    let alive = true;
    fetch('/api/playbook')
      .then(res => res.ok ? res.json() : Promise.reject(new Error(res.status === 404 ? 'Run onboarding first to generate a playbook.' : 'Failed to load playbook')))
      .then(data => { if (alive) { setPb(normalizeShape(data)); setLoading(false); } })
      .catch(err => { if (alive) { setError(err.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  // Lift the current (possibly unsaved) playbook state up so a parent (e.g. the
  // Coach page) can drive a live prompt preview as any field changes.
  useEffect(() => { if (pb) onChange?.(pb); }, [pb, onChange]);

  function normalizeShape(data) {
    const d = data || {};
    return {
      role: d.role || '',
      company: { name: d.company?.name || '', description: d.company?.description || '' },
      products: d.products || [],
      personas: d.personas || [],
      outcomes: d.outcomes || [],
      differentiators: d.differentiators || [],
      competitors: d.competitors || [],
      proofPoints: d.proofPoints || [],
      competitorTraps: d.competitorTraps || [],
      source: d.source || 'draft'
    };
  }

  function set(patch) { setPb(prev => ({ ...prev, ...patch })); setStatus('idle'); }
  function setCompetitors(next) {
    setPb(prev => ({ ...prev, competitors: next, competitorTraps: reconcileTraps(next, prev.competitorTraps) }));
    setStatus('idle');
  }

  function setTrapQuestion(competitor, question) {
    setPb(prev => ({
      ...prev,
      competitorTraps: (prev.competitorTraps || []).map(t => t.competitor === competitor ? { ...t, question } : t)
    }));
    setStatus('idle');
  }

  async function save() {
    setStatus('saving');
    try {
      const res = await fetch('/api/playbook', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pb)
      });
      if (!res.ok) throw new Error('save failed');
      const saved = await res.json();
      setPb(normalizeShape(saved));
      setStatus('saved');
      return true;
    } catch {
      setStatus('error');
      return false;
    }
  }

  async function saveAndContinue() {
    const ok = await save();
    if (ok) onContinue?.();
  }

  async function regenerate() {
    if (!window.confirm('Rebuild the playbook from your knowledge base? This discards your edits.')) return;
    setStatus('saving');
    try {
      const res = await fetch('/api/playbook/regenerate', { method: 'POST' });
      if (!res.ok) throw new Error('regenerate failed');
      setPb(normalizeShape(await res.json()));
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  if (loading) return <div className="text-sm text-gray-500 dark:text-gray-400">Loading coach…</div>;
  if (error) return <div className="text-sm text-amber-700 dark:text-amber-400">{error}</div>;
  if (!pb) return null;

  const traps = pb.competitorTraps || [];

  // A personalised, human summary of who we drafted this for — so the rep feels the
  // tool has adapted to them, not handed them a blank form.
  const personalBits = [];
  if (pb.role) personalBits.push(`a ${pb.role}`);
  if (pb.company.name) personalBits.push(`at ${pb.company.name}`);
  const personaText = (pb.personas || []).slice(0, 3).join(', ');
  const productText = (pb.products || []).slice(0, 3).join(', ');
  const personalSummary = personalBits.length
    ? `You're ${personalBits.join(' ')}${productText ? `, selling ${productText}` : ''}${personaText ? ` to ${personaText}` : ''}.`
    : '';

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        {personalSummary && (
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-1">{personalSummary}</p>
        )}
        <p className="text-sm text-blue-800 dark:text-blue-300">
          This coach is <strong>yours</strong> — we drafted it from your onboarding so live coaching speaks to what you sell and how you win. Review, make it sound like you, then save.
        </p>
      </div>

      <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Your role</label>
          <input
            type="text"
            value={pb.role}
            placeholder="e.g. Solution Engineer"
            onChange={e => set({ role: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company</label>
          <input
            type="text"
            value={pb.company.name}
            placeholder="Company name"
            onChange={e => set({ company: { ...pb.company, name: e.target.value } })}
            className="w-full px-3 py-2 mb-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm"
          />
          <textarea
            rows={2}
            value={pb.company.description}
            placeholder="What your company does, in a sentence or two"
            onChange={e => set({ company: { ...pb.company, description: e.target.value } })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm"
          />
        </div>
        <ChipList label="Products you sell" value={pb.products} onChange={v => set({ products: v })} placeholder="Add a product and press Enter" />
        <ChipList label="Buyer personas you engage" value={pb.personas} onChange={v => set({ personas: v })} placeholder="e.g. CISO, VP Engineering" />
      </section>

      <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <LinesEditor label="Outcomes you deliver for clients" hint="The results customers get — the coach frames value around these." value={pb.outcomes} onChange={v => set({ outcomes: v })} placeholder="e.g. Cut data-pipeline latency by 60%" />
        <LinesEditor label="How you differentiate (why customers choose you)" value={pb.differentiators} onChange={v => set({ differentiators: v })} placeholder="e.g. Native governance built in, not bolted on" />
        <LinesEditor label="Proof arsenal" hint="Concrete stats and named wins the coach can cite. Never invents proof outside this list." value={pb.proofPoints} onChange={v => set({ proofPoints: v })} placeholder="e.g. 40% infra cost cut at Acme in 6 weeks" />
      </section>

      <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <ChipList label="Competitors" hint="Who you displace or run against." value={pb.competitors} onChange={setCompetitors} placeholder="e.g. Snowflake, Databricks" />
        {traps.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Competitor traps</label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">One question per competitor that exposes where they’re weak. The coach uses the matching trap when that competitor comes up.</p>
            <div className="space-y-2">
              {traps.map((t) => (
                <div key={t.competitor} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-32 shrink-0 truncate">{t.competitor}</span>
                  <input
                    type="text"
                    value={t.question}
                    aria-label={`Trap question for ${t.competitor}`}
                    placeholder="How do you handle … today?"
                    onChange={e => setTrapQuestion(t.competitor, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={onContinue ? saveAndContinue : save}
          disabled={status === 'saving'}
          className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
        >
          {status === 'saving' ? 'Saving…' : (onContinue ? 'Save & start meeting →' : 'Save coach')}
        </button>
        <button
          onClick={regenerate}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Rebuild from knowledge base
        </button>
        {status === 'saved' && !onContinue && <span className="text-sm text-green-700 dark:text-green-400">Saved.</span>}
        {status === 'error' && <span className="text-sm text-red-700 dark:text-red-400">Something went wrong.</span>}
      </div>
    </div>
  );
}
