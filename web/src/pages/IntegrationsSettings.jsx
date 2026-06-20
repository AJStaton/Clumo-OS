import { useState, useEffect } from 'react';

const PROVIDER_BLURB = {
  dynamics: 'Sync session summaries to your Dynamics 365 / MSX opportunities.',
  salesforce: 'Sync session summaries to Salesforce opportunities.',
  hubspot: 'Sync session summaries to HubSpot deals.'
};

function ProviderIcon({ id }) {
  const letter = { dynamics: 'D', salesforce: 'S', hubspot: 'H' }[id] || '?';
  return (
    <div className="w-9 h-9 rounded-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-300">
      {letter}
    </div>
  );
}

export default function IntegrationsSettings() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null); // provider id currently connecting
  const [error, setError] = useState(null);

  async function refresh() {
    const res = await fetch('/api/integrations');
    setData(await res.json());
  }

  useEffect(() => { refresh(); }, []);

  async function connect(id) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/integrations/${id}/connect`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok || !body.connected) {
        setError({ id, message: body.error || 'Connection failed' });
      }
    } catch (e) {
      setError({ id, message: e.message });
    } finally {
      setBusy(null);
      refresh();
    }
  }

  async function disconnect(id) {
    setBusy(id);
    setError(null);
    await fetch(`/api/integrations/${id}/disconnect`, { method: 'POST' });
    setBusy(null);
    refresh();
  }

  if (!data) {
    return <div className="text-sm text-gray-400 dark:text-gray-500">Loading integrations…</div>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Integrations</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Connect a CRM to sync session summaries straight to the right opportunity.
      </p>

      <div className="space-y-3">
        {data.providers.map(p => {
          const comingSoon = p.status !== 'available';
          return (
            <div
              key={p.id}
              className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            >
              <ProviderIcon id={p.id} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{p.label}</h2>
                  {p.connected && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                      Connected
                    </span>
                  )}
                  {comingSoon && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                      Coming soon
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {p.connected && p.userName ? `Signed in as ${p.userName}` : (PROVIDER_BLURB[p.id] || '')}
                </p>
                {error && error.id === p.id && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error.message}</p>
                )}
              </div>

              <div className="shrink-0">
                {comingSoon ? (
                  <button
                    disabled
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                  >
                    Setup
                  </button>
                ) : p.connected ? (
                  <button
                    onClick={() => disconnect(p.id)}
                    disabled={busy === p.id}
                    className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    {busy === p.id ? 'Working…' : 'Disconnect'}
                  </button>
                ) : (
                  <button
                    onClick={() => connect(p.id)}
                    disabled={busy === p.id}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
                  >
                    {busy === p.id ? 'Connecting…' : 'Setup'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 mt-6 leading-relaxed">
        Dynamics 365 uses your existing Microsoft (Entra ID) sign-in via the Azure CLI —
        no passwords are stored. Make sure you are signed in with <code>az login</code> before connecting.
      </p>
    </div>
  );
}
