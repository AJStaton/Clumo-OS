import GenericSyncPanel from './GenericSyncPanel';

// Maps a provider id to a bespoke sync panel component. Any CRM that needs a
// custom flow registers it here; everything else falls back to the
// descriptor-driven GenericSyncPanel. This is the per-CRM UI override point.
const REGISTRY = {
  // dynamics: DynamicsSyncPanel,  // example future override
};

export function getSyncPanel(providerId) {
  return REGISTRY[providerId] || GenericSyncPanel;
}

export default getSyncPanel;
