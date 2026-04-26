import { useState, useEffect } from 'react';

export default function AudioSourcePicker({ onSourceSelected }) {
  const [sources, setSources] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const isElectron = !!window.clumo?.isElectron;

  async function loadSources() {
    setLoading(true);
    try {
      if (isElectron) {
        // Electron: use desktopCapturer via preload
        const electronSources = await window.clumo.getAudioSources();
        setSources(electronSources);
      } else {
        // Browser fallback: offer microphone and screen share
        setSources([
          { id: 'microphone', name: 'Microphone' },
          { id: 'screen-share', name: 'Share tab audio' }
        ]);
      }
    } catch (e) {
      console.error('Failed to get audio sources:', e);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadSources();
  }, []);

  function handleSelect(sourceId) {
    setSelectedId(sourceId);
    onSourceSelected(sourceId);
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white"
        value={selectedId || ''}
        onChange={e => handleSelect(e.target.value)}
      >
        <option value="" disabled>Select audio source</option>
        {sources.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <button
        onClick={loadSources}
        disabled={loading}
        className="text-xs text-gray-500 hover:text-gray-700"
        title="Refresh sources"
      >
        {loading ? '...' : 'Refresh'}
      </button>
    </div>
  );
}
