import { useState, useRef, useCallback, useEffect } from 'react';
import AudioSourcePicker from '../components/AudioSourcePicker';
import Transcript from '../components/Transcript';
import SuggestionCard from '../components/SuggestionCard';
import MeddpiccTracker from '../components/MeddpiccTracker';
import { createWsClient } from '../lib/ws-client';
import { useApp } from '../context/AppContext';

const MEDDPICC_LETTERS = [
  { letter: 'M', label: 'Metrics' },
  { letter: 'E', label: 'Economic Buyer' },
  { letter: 'D', label: 'Decision Criteria' },
  { letter: 'D', label: 'Decision Process' },
  { letter: 'P', label: 'Paper Process' },
  { letter: 'I', label: 'Identify Pain' },
  { letter: 'C', label: 'Champion' },
  { letter: 'C', label: 'Competition' },
];

const BANT_LETTERS = [
  { letter: 'B', label: 'Budget' },
  { letter: 'A', label: 'Authority' },
  { letter: 'N', label: 'Need' },
  { letter: 'T', label: 'Timeline' },
];

export default function Call({ onListeningChange }) {
  const [status, setStatus] = useState('idle'); // idle, connecting, listening, stopped
  const [sessionId, setSessionId] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [meddpicc, setMeddpicc] = useState(null);
  const [error, setError] = useState(null);
  const [audioSourceId, setAudioSourceId] = useState(null);
  const { preferences, refreshSessions } = useApp();

  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);

  const handleWsMessage = useCallback((msg) => {
    switch (msg.type) {
      case '_connected':
        setStatus('listening');
        setError(null);
        break;
      case '_disconnected':
        if (status !== 'idle') setStatus('stopped');
        break;
      case '_error':
        setError(msg.message);
        break;
      case 'session_started':
        setSessionId(msg.sessionId);
        break;
      case 'transcript':
        setTranscript(prev => [...prev, { text: msg.text, timestamp: new Date().toISOString() }]);
        break;
      case 'suggestion':
        setSuggestions(prev => {
          const next = [...prev, { ...msg.suggestion, _id: Date.now() }];
          return next.slice(-3); // max 3 visible
        });
        break;
      case 'meddpicc_update':
        setMeddpicc(msg.meddpicc);
        break;
      case 'error':
        setError(msg.message);
        break;
    }
  }, [status]);

  // Auto-collapse sidebar when listening starts; refresh sessions when stopped
  const prevStatusRef = useRef(null);
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      if (status === 'listening' && onListeningChange) {
        onListeningChange(true);
      }
      if (status === 'stopped') {
        refreshSessions();
      }
      prevStatusRef.current = status;
    }
  }, [status, onListeningChange, refreshSessions]);

  // Keyboard shortcut: Ctrl+L to toggle listening
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        if (status === 'idle' || status === 'stopped') {
          startListening();
        } else if (status === 'listening') {
          stopListening();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status]);

  async function startListening() {

    setStatus('connecting');
    setError(null);
    setTranscript([]);
    setSuggestions([]);
    setMeddpicc(null);

    try {
      // Get audio stream
      let stream;
      const isElectron = !!window.clumo?.isElectron;

      // Resolve source ID, falling back to auto-detection if not yet set
      let sourceId = audioSourceId;
      if (!sourceId && isElectron) {
        const sources = await window.clumo.getAudioSources();
        const screen = sources.find(s => s.id.startsWith('screen:'));
        if (screen) sourceId = screen.id;
      }
      if (!sourceId && !isElectron) {
        sourceId = 'screen-share';
      }

      if (isElectron && sourceId && sourceId !== 'microphone' && sourceId !== 'screen-share') {
        // Electron: capture Entire Screen audio
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId
            }
          },
          video: false
        });
      } else if (sourceId === 'screen-share') {
        stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: false });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      streamRef.current = stream;

      // Set up AudioWorklet for PCM16 encoding
      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      // Use ScriptProcessor as a fallback since AudioWorklet requires a separate file
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      // Connect WebSocket
      const ws = createWsClient(handleWsMessage);
      wsRef.current = ws;

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;

        const float32 = e.inputBuffer.getChannelData(0);
        // Convert float32 to PCM16
        const pcm16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Convert to base64
        const bytes = new Uint8Array(pcm16.buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        ws.sendAudio(base64);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (e) {
      console.error('Failed to start listening:', e);
      setError(e.message || 'Failed to start audio capture');
      setStatus('idle');
    }
  }

  function stopListening() {
    // Stop audio stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatus('stopped');
  }

  function handleDismissSuggestion(id) {
    setSuggestions(prev => prev.filter(s => s._id !== id));
    wsRef.current?.sendSuggestionDismissed(id);
  }

  function handleUseSuggestion(id) {
    setSuggestions(prev => prev.filter(s => s._id !== id));
    wsRef.current?.sendSuggestionUsed(id);
  }

  const methodologyLetters = preferences.methodology === 'bant' ? BANT_LETTERS : MEDDPICC_LETTERS;
  const isIdle = status === 'idle' || status === 'stopped';
  const isActive = status === 'listening' || status === 'connecting';

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {isIdle && !sessionId ? (
        /* Hero state — shown before first call or between calls */
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Current meeting</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 text-center max-w-md">
            Realtime AI-powered sales coaching. Start a call to get live suggestions and qualification tracking.
          </p>

          <button
            onClick={startListening}
            className="px-8 py-3 bg-red-500 text-white rounded-lg text-base font-semibold hover:bg-red-600 transition-colors shadow-sm"
          >
            Start listening
          </button>
          <span className="text-xs text-gray-400 dark:text-gray-500 mt-2">Ctrl+L</span>

          {error && (
            <div className="mt-4 px-4 py-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-md text-sm text-red-700 dark:text-red-300 max-w-md">
              {error}
            </div>
          )}

          {/* Methodology tracker — minimal vertical letters */}
          <div className="mt-12 flex flex-col items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
              {preferences.methodology === 'bant' ? 'BANT' : 'MEDDPICC'} Tracker
            </h3>
            <div className="flex gap-2">
              {methodologyLetters.map((item, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-sm font-bold text-gray-400 dark:text-gray-500 cursor-default"
                  title={item.label}
                >
                  {item.letter}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Scores fill during your call</p>
          </div>
        </div>
      ) : (
        /* Active/stopped-with-session state — 3-panel layout */
        <>
          {/* Top bar */}
          <div className="flex items-center gap-4 px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
            <AudioSourcePicker onSourceSelected={setAudioSourceId} />
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                status === 'listening' ? 'bg-green-500 animate-pulse' :
                status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                'bg-gray-300 dark:bg-gray-600'
              }`} />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {status === 'idle' && 'Ready'}
                {status === 'connecting' && 'Connecting...'}
                {status === 'listening' && 'Listening'}
                {status === 'stopped' && 'Stopped'}
              </span>
            </div>

            {status === 'idle' || status === 'stopped' ? (
              <button
                onClick={startListening}
                className="ml-auto px-4 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200"
              >
                Start Listening
              </button>
            ) : (
              <button
                onClick={stopListening}
                className="ml-auto px-4 py-1.5 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700"
              >
                Stop
              </button>
            )}

            {sessionId && status === 'stopped' && (
              <a
                href={`/session/${sessionId}`}
                className="px-4 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                View Summary
              </a>
            )}
          </div>

          {error && (
            <div className="px-6 py-2 bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-700 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Main content: 3-panel layout */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Transcript */}
            <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Transcript</h2>
              </div>
              <Transcript entries={transcript} />
            </div>

            {/* Center: Suggestions */}
            <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-y-auto p-4">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Suggestions</h2>
              {suggestions.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  {status === 'listening'
                    ? 'Listening for relevant moments...'
                    : 'Suggestions will appear here during a call'}
                </p>
              )}
              {suggestions.map(s => (
                <SuggestionCard
                  key={s._id}
                  suggestion={s}
                  onUse={() => handleUseSuggestion(s._id)}
                  onDismiss={() => handleDismissSuggestion(s._id)}
                />
              ))}
            </div>

            {/* Right: Methodology Tracker */}
            <div className="w-1/3 bg-white dark:bg-gray-800 overflow-y-auto">
              <MeddpiccTracker meddpicc={meddpicc} methodology={preferences.methodology} />
              {!meddpicc && (
                <p className="text-sm text-gray-400 dark:text-gray-500 p-4">
                  {preferences.methodology === 'bant' ? 'BANT' : 'MEDDPICC'} tracking will begin when the call starts
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
