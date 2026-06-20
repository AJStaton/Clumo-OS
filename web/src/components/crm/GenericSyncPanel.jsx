import { useState, useEffect } from 'react';

// Renders the sync cascade entirely from the provider's capability descriptor:
//  - descriptor.steps drives the dropdowns (labels, order)
//  - the final step (searchable) also offers an ID-search box
//  - an editable note preview is always shown before any write
//
// This component is CRM-agnostic. Dynamics, Salesforce or HubSpot all render
// from their own descriptor with zero changes here.
export default function GenericSyncPanel({ providerId, descriptor, defaultNote }) {
  const steps = descriptor?.steps || [];
  const parentStep = steps.find(s => s.key === 'parent') || steps[0];
  const recordStep = steps.find(s => s.key === 'record') || steps[steps.length - 1];

  const [parents, setParents] = useState([]);
  const [parentId, setParentId] = useState('');
  const [records, setRecords] = useState([]);
  const [recordId, setRecordId] = useState('');

  const [searchValue, setSearchValue] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundRecord, setFoundRecord] = useState(null);

  const [note, setNote] = useState(defaultNote || '');
  const [loadingParents, setLoadingParents] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [status, setStatus] = useState(null); // { type, message }
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { setNote(defaultNote || ''); }, [defaultNote]);

  // Load parents (accounts) on mount.
  useEffect(() => {
    let cancelled = false;
    setLoadingParents(true);
    fetch(`/api/integrations/${providerId}/parents`)
      .then(r => r.json().then(b => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (cancelled) return;
        if (ok) setParents(b.items || []);
        else setStatus({ type: 'error', message: b.error || 'Failed to load accounts' });
      })
      .catch(e => !cancelled && setStatus({ type: 'error', message: e.message }))
      .finally(() => !cancelled && setLoadingParents(false));
    return () => { cancelled = true; };
  }, [providerId]);

  // Load records (opportunities) when a parent is chosen.
  useEffect(() => {
    if (!parentId) { setRecords([]); setRecordId(''); return; }
    let cancelled = false;
    setLoadingRecords(true);
    setRecordId('');
    fetch(`/api/integrations/${providerId}/parents/${parentId}/records`)
      .then(r => r.json().then(b => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (cancelled) return;
        if (ok) setRecords(b.items || []);
        else setStatus({ type: 'error', message: b.error || 'Failed to load opportunities' });
      })
      .catch(e => !cancelled && setStatus({ type: 'error', message: e.message }))
      .finally(() => !cancelled && setLoadingRecords(false));
    return () => { cancelled = true; };
  }, [providerId, parentId]);

  const selectedRecordId = foundRecord ? foundRecord.id : recordId;
  const selectedRecordLabel = foundRecord
    ? `${foundRecord.number || ''} ${foundRecord.name}`.trim()
    : (records.find(r => r.id === recordId)?.name || '');

  async function handleSearch() {
    if (!searchValue.trim()) return;
    setSearching(true);
    setStatus(null);
    setFoundRecord(null);
    try {
      const res = await fetch(`/api/integrations/${providerId}/records/search?number=${encodeURIComponent(searchValue.trim())}`);
      const body = await res.json();
      if (res.ok) {
        setFoundRecord(body);
        setParentId('');
        setRecordId('');
      } else {
        setStatus({ type: 'error', message: body.error || 'No matching record found' });
      }
    } catch (e) {
      setStatus({ type: 'error', message: e.message });
    } finally {
      setSearching(false);
    }
  }

  async function handleSync() {
    if (!selectedRecordId || !note.trim()) return;
    setSyncing(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/integrations/${providerId}/records/${selectedRecordId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: note.trim() })
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        setStatus({ type: 'success', message: 'Synced to CRM.' });
      } else {
        setStatus({ type: 'error', message: body.error || 'Sync failed' });
      }
    } catch (e) {
      setStatus({ type: 'error', message: e.message });
    } finally {
      setSyncing(false);
    }
  }

  const inputClass = 'w-full px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-gray-500';

  return (
    <div className="space-y-4">
      {/* Parent (account) dropdown */}
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          {parentStep?.label || 'Account'}
        </label>
        <select
          className={inputClass}
          value={parentId}
          disabled={loadingParents || !!foundRecord}
          onChange={e => setParentId(e.target.value)}
        >
          <option value="">{loadingParents ? 'Loading…' : `Select ${(parentStep?.label || 'account').toLowerCase()}…`}</option>
          {parents.map(p => (
            <option key={p.id} value={p.id}>{p.name}{p.role ? ` — ${p.role}` : ''}</option>
          ))}
        </select>
      </div>

      {/* Record (opportunity) dropdown */}
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          {recordStep?.label || 'Opportunity'}
        </label>
        <select
          className={inputClass}
          value={recordId}
          disabled={!parentId || loadingRecords || !!foundRecord}
          onChange={e => { setRecordId(e.target.value); setFoundRecord(null); }}
        >
          <option value="">
            {!parentId ? `Select ${(parentStep?.label || 'account').toLowerCase()} first…` : loadingRecords ? 'Loading…' : `Select ${(recordStep?.label || 'opportunity').toLowerCase()}…`}
          </option>
          {records.map(r => (
            <option key={r.id} value={r.id}>{r.number ? `${r.number} — ` : ''}{r.name}</option>
          ))}
        </select>
      </div>

      {/* Optional ID search */}
      {recordStep?.searchable && (
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            …or find by {recordStep.searchLabel || 'ID'}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              className={inputClass}
              placeholder={recordStep.searchLabel || 'ID'}
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <button
              onClick={handleSearch}
              disabled={searching || !searchValue.trim()}
              className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 shrink-0"
            >
              {searching ? '…' : 'Find'}
            </button>
          </div>
          {foundRecord && (
            <p className="text-xs text-green-700 dark:text-green-300 mt-1">
              Matched: {foundRecord.name}{foundRecord.parentName ? ` (${foundRecord.parentName})` : ''}
              <button onClick={() => { setFoundRecord(null); setSearchValue(''); }} className="ml-2 underline text-gray-500 dark:text-gray-400">clear</button>
            </p>
          )}
        </div>
      )}

      {/* Editable note preview */}
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Note ({descriptor?.noteTargetLabel || 'Comments'})
        </label>
        <textarea
          className={`${inputClass} h-28 resize-y font-sans`}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="The note that will be added to the CRM record…"
        />
      </div>

      {status && (
        <p className={`text-xs ${status.type === 'success' ? 'text-green-700 dark:text-green-300' : 'text-red-600 dark:text-red-400'}`}>
          {status.message}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSync}
          disabled={syncing || !selectedRecordId || !note.trim()}
          className="px-4 py-2 rounded-md text-sm font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
        >
          {syncing ? 'Syncing…' : 'Sync to CRM'}
        </button>
        {selectedRecordLabel && (
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">→ {selectedRecordLabel}</span>
        )}
      </div>
    </div>
  );
}
