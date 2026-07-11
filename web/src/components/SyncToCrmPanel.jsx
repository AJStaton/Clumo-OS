import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSyncPanel } from './crm/syncPanelRegistry';

// Compose a default CRM note from the session analysis (call notes + next steps).
// Mirrors the server-side note-format.composeNote so the preview matches.
function composeDefaultNote(analysis) {
  if (!analysis) return '';
  const parts = [];
  const notes = Array.isArray(analysis.callNotes) ? analysis.callNotes : [];
  if (notes.length) parts.push(notes.map(n => `- ${n}`).join('\n'));
  const nextSteps = analysis.crmUpdate && analysis.crmUpdate.nextSteps;
  if (nextSteps) parts.push(`Next steps: ${nextSteps}`);
  return parts.join('\n\n').trim();
}

// Thin wrapper: resolves the connected provider + capability descriptor, then
// renders the per-CRM panel from the registry (defaulting to GenericSyncPanel).
// Hidden entirely unless a CRM is connected.
export default function SyncToCrmPanel({ analysis }) {
  const [integration, setIntegration] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/integrations')
      .then(r => r.json())
      .then(data => {
        const active = (data.providers || []).find(p => p.connected);
        setIntegration(active || null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Sync to CRM{integration ? `: ${integration.label}` : ''}
        </h2>
      </div>
      <div className="p-4">
        {!integration ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No CRM connected.{' '}
            <Link to="/settings/integrations" className="underline text-gray-700 dark:text-gray-200">
              Set up an integration
            </Link>{' '}
            to sync this summary to an opportunity.
          </p>
        ) : (
          (() => {
            const Panel = getSyncPanel(integration.id);
            return (
              <Panel
                providerId={integration.id}
                descriptor={integration.descriptor}
                defaultNote={composeDefaultNote(analysis)}
              />
            );
          })()
        )}
      </div>
    </div>
  );
}
