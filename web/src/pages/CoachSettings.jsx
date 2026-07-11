import { useState, useEffect, useCallback, useRef } from 'react';
import PlaybookEditor from '../components/PlaybookEditor';

const MAX_STYLE = 1500;

// CoachSettings — the rep's single home for tuning live coaching.
//
// Two inputs feed the coach:
//  1. The playbook (PlaybookEditor) — WHAT the rep sells. Grounds BOTH coaching lanes.
//  2. The coaching style (this page) — HOW the rep wants to be coached. Injected into
//     the SLOW (strategic) lane only.
// A live prompt preview shows the exact composed block(s) that will be sent, updating
// as any box is filled or changed, so "edit the inputs" visibly means "edit the prompt".
export default function CoachSettings() {
  const [style, setStyle] = useState('');
  const [styleStatus, setStyleStatus] = useState('idle'); // idle | saving | saved | error
  const [playbookState, setPlaybookState] = useState(null);
  const [preview, setPreview] = useState({ hotLane: '', slowLane: '', styleBlock: '', playbookBlock: '' });

  // Load the saved coaching style once.
  useEffect(() => {
    let alive = true;
    fetch('/api/coaching-style')
      .then(res => res.ok ? res.json() : Promise.reject(new Error('load failed')))
      .then(data => { if (alive) setStyle(data.style || ''); })
      .catch(() => { /* leave empty on failure */ });
    return () => { alive = false; };
  }, []);

  // Stable handler so PlaybookEditor's lift-up effect doesn't loop.
  const handlePlaybookChange = useCallback((pb) => setPlaybookState(pb), []);

  // Rebuild the live preview (debounced) whenever the playbook or style changes.
  // Uses the server renderers so the preview matches exactly what gets injected.
  useEffect(() => {
    const t = setTimeout(() => {
      fetch('/api/coach/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playbook: playbookState || {}, style })
      })
        .then(res => res.ok ? res.json() : Promise.reject(new Error('preview failed')))
        .then(setPreview)
        .catch(() => { /* keep last good preview */ });
    }, 350);
    return () => clearTimeout(t);
  }, [playbookState, style]);

  async function saveStyle() {
    setStyleStatus('saving');
    try {
      const res = await fetch('/api/coaching-style', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style })
      });
      if (!res.ok) throw new Error('save failed');
      const saved = await res.json();
      setStyle(saved.style || '');
      setStyleStatus('saved');
    } catch {
      setStyleStatus('error');
    }
  }

  return (
    <div className="max-w-5xl grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-6">
      {/* Left: editors */}
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Coach</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Tune how Clumo coaches you live. Everything here is editable any time — changes take effect on your next call.
          </p>
        </div>

        {/* Coaching style — how to coach me (slow-lane) */}
        <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Coaching style</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              How should your coach behave? Tone, assertiveness, phrasing, and anything it should never say.
              This shapes the coach&apos;s strategic reasoning (slow lane).
            </p>
          </div>
          <textarea
            rows={5}
            value={style}
            maxLength={MAX_STYLE}
            placeholder={'e.g. Be direct and concise. Challenge me when I ramble. Never suggest discounting. Prefer questions over statements. Match a calm, consultative tone.'}
            onChange={e => { setStyle(e.target.value); setStyleStatus('idle'); }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={saveStyle}
              disabled={styleStatus === 'saving'}
              className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
            >
              {styleStatus === 'saving' ? 'Saving…' : 'Save style'}
            </button>
            {styleStatus === 'saved' && <span className="text-xs text-green-600 dark:text-green-400">Saved</span>}
            {styleStatus === 'error' && <span className="text-xs text-red-600 dark:text-red-400">Save failed</span>}
            <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">{style.length}/{MAX_STYLE}</span>
          </div>
        </section>

        {/* Playbook — what I sell (both lanes) */}
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Your playbook</h3>
          <PlaybookEditor onChange={handlePlaybookChange} />
        </div>
      </div>

      {/* Right: live prompt preview */}
      <aside className="lg:sticky lg:top-4 self-start">
        <div className="bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Live prompt preview</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            The exact context injected into the coach, updating as you edit.
          </p>

          <PreviewBlock
            title="Playbook — both lanes"
            body={preview.playbookBlock}
            empty="Fill in your playbook to ground coaching in what you sell."
          />
          <PreviewBlock
            title="Coaching style — strategic (slow) lane only"
            body={preview.styleBlock}
            empty="Add a coaching style above to shape how the coach reasons."
          />
        </div>
      </aside>
    </div>
  );
}

function PreviewBlock({ title, body, empty }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">{title}</div>
      {body
        ? <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2">{body}</pre>
        : <p className="text-[11px] italic text-gray-400 dark:text-gray-500">{empty}</p>}
    </div>
  );
}
