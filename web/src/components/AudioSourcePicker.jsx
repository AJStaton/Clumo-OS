import { useState, useEffect, useRef } from 'react';

export default function AudioSourcePicker({ onSourceSelected }) {
  const [meetings, setMeetings] = useState([]);
  const [screens, setScreens] = useState([]);
  const [allSources, setAllSources] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const intervalRef = useRef(null);
  const isElectron = !!window.clumo?.isElectron;

  async function loadSources() {
    setLoading(true);
    try {
      if (isElectron && window.clumo.getMeetingSources) {
        const result = await window.clumo.getMeetingSources();
        setMeetings(result.meetings || []);
        setScreens(result.screens || []);
        setAllSources(result.allSources || []);
      } else if (isElectron) {
        // Fallback to old API
        const sources = await window.clumo.getAudioSources();
        setAllSources(sources);
        setScreens(sources.filter(s => s.id.startsWith('screen:')));
      } else {
        // Browser fallback
        setAllSources([
          { id: 'screen-share', name: 'Share tab audio' },
          { id: 'microphone', name: 'Microphone' }
        ]);
      }
    } catch (e) {
      console.error('Failed to get audio sources:', e);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadSources();
    // Auto-refresh every 5 seconds while idle
    intervalRef.current = setInterval(loadSources, 5000);
    return () => clearInterval(intervalRef.current);
  }, []);

  function handleSelect(sourceId) {
    setSelectedId(sourceId);
    onSourceSelected(sourceId);
  }

  // Detect platform for warnings
  const isMac = navigator.platform?.toLowerCase().includes('mac');
  const isLinux = navigator.platform?.toLowerCase().includes('linux');

  const cardClass = (id) =>
    `p-3 rounded-lg border-2 cursor-pointer transition-colors text-left ${
      selectedId === id
        ? 'border-gray-900 bg-gray-50'
        : 'border-gray-200 hover:border-gray-300'
    }`;

  return (
    <div className="space-y-3">
      {/* Detected meetings */}
      {meetings.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Detected meetings</p>
          <div className="flex gap-2 flex-wrap">
            {meetings.map(m => (
              <button
                key={m.id}
                onClick={() => handleSelect(m.id)}
                className={cardClass(m.id)}
              >
                <div className="text-sm font-medium">{m.meetingApp}</div>
                <div className="text-xs text-gray-500 truncate max-w-[180px]">{m.name}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {meetings.length === 0 && isElectron && (
        <p className="text-xs text-gray-400">
          No active meetings detected. Use Entire Screen to capture all audio.
        </p>
      )}

      {/* Always visible options */}
      <div className="flex gap-2">
        {isElectron && screens.length > 0 && (
          <button
            onClick={() => handleSelect(screens[0].id)}
            className={cardClass(screens[0].id)}
          >
            <div className="text-sm font-medium">Entire Screen</div>
            <div className="text-xs text-gray-500">Captures all audio</div>
          </button>
        )}

        {!isElectron && (
          <button
            onClick={() => handleSelect('screen-share')}
            className={cardClass('screen-share')}
          >
            <div className="text-sm font-medium">Share Tab Audio</div>
            <div className="text-xs text-gray-500">Share a browser tab</div>
          </button>
        )}

        <button
          onClick={() => handleSelect('microphone')}
          className={cardClass('microphone')}
        >
          <div className="text-sm font-medium">Microphone Only</div>
          <div className="text-xs text-gray-500">Your mic input</div>
        </button>
      </div>

      {/* Platform warnings */}
      {isMac && selectedId && selectedId !== 'microphone' && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-md p-2 border border-amber-100">
          macOS requires a virtual audio driver (like BlackHole) for system audio capture. Without one, only your microphone will be captured.
        </p>
      )}
      {isLinux && selectedId && selectedId !== 'microphone' && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-md p-2 border border-amber-100">
          Linux may require PulseAudio or PipeWire configuration for system audio capture.
        </p>
      )}

      {/* Advanced: full source list */}
      {isElectron && allSources.length > 0 && (
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <span className={`inline-block transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>&#9656;</span>
            Advanced: select a specific window
          </button>

          {showAdvanced && (
            <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md">
              {allSources.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleSelect(s.id)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-b-0 ${
                    selectedId === s.id ? 'bg-gray-50 font-medium' : ''
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && <span className="text-xs text-gray-400">Refreshing...</span>}
    </div>
  );
}
