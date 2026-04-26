import { useState, useRef, useCallback } from 'react';
import AudioSourcePicker from '../components/AudioSourcePicker';
import Transcript from '../components/Transcript';
import SuggestionCard from '../components/SuggestionCard';
import MeddpiccTracker from '../components/MeddpiccTracker';
import { createWsClient } from '../lib/ws-client';

export default function Call() {
  const [status, setStatus] = useState('idle'); // idle, connecting, listening, stopped
  const [sessionId, setSessionId] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [meddpicc, setMeddpicc] = useState(null);
  const [error, setError] = useState(null);
  const [audioSourceId, setAudioSourceId] = useState(null);

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

  async function startListening() {
    if (!audioSourceId) {
      setError('Please select an audio source');
      return;
    }

    setStatus('connecting');
    setError(null);
    setTranscript([]);
    setSuggestions([]);
    setMeddpicc(null);

    try {
      // Get audio stream
      let stream;
      const isElectron = !!window.clumo?.isElectron;

      if (isElectron && audioSourceId !== 'microphone' && audioSourceId !== 'screen-share') {
        // Electron desktopCapturer source
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: audioSourceId
            }
          },
          video: false
        });
      } else if (audioSourceId === 'screen-share') {
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

  return (
    <div className="h-[calc(100vh-57px)] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-gray-200 bg-white">
        <AudioSourcePicker onSourceSelected={setAudioSourceId} />

        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            status === 'listening' ? 'bg-green-500 animate-pulse' :
            status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
            'bg-gray-300'
          }`} />
          <span className="text-sm text-gray-600">
            {status === 'idle' && 'Ready'}
            {status === 'connecting' && 'Connecting...'}
            {status === 'listening' && 'Listening'}
            {status === 'stopped' && 'Stopped'}
          </span>
        </div>

        {status === 'idle' || status === 'stopped' ? (
          <button
            onClick={startListening}
            className="ml-auto px-4 py-1.5 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800"
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
            className="px-4 py-1.5 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50"
          >
            View Summary
          </a>
        )}
      </div>

      {error && (
        <div className="px-6 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Main content: 3-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Transcript */}
        <div className="w-1/3 border-r border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Transcript</h2>
          </div>
          <Transcript entries={transcript} />
        </div>

        {/* Center: Suggestions */}
        <div className="w-1/3 border-r border-gray-200 bg-gray-50 overflow-y-auto p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Suggestions</h2>
          {suggestions.length === 0 && (
            <p className="text-sm text-gray-400">
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

        {/* Right: MEDDPICC */}
        <div className="w-1/3 bg-white overflow-y-auto">
          <MeddpiccTracker meddpicc={meddpicc} />
          {!meddpicc && (
            <p className="text-sm text-gray-400 p-4">
              MEDDPICC tracking will begin when the call starts
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
