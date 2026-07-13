import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createWsClient } from '../lib/ws-client';

const CallSessionContext = createContext(null);
const MESSAGE_DEDUP_WINDOW_MS = 2 * 60 * 1000;

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function suggestionFingerprint(suggestion) {
  const item = suggestion && suggestion.suggestion ? suggestion.suggestion : (suggestion || {});
  return [
    suggestion?.type || item?.type || '',
    normalizeText(item.question || item.headline || item.stat || item.fact || ''),
    normalizeText(item.trigger || suggestion?.trigger || ''),
  ].join('|');
}

function coachingFingerprint(nudge) {
  return [
    nudge?.persona || '',
    nudge?.type || '',
    normalizeText(nudge?.headline || ''),
    normalizeText(nudge?.signal || '')
  ].join('|');
}

function isDuplicate(cacheMapRef, fingerprint, ttlMs = MESSAGE_DEDUP_WINDOW_MS) {
  if (!fingerprint) return false;
  const now = Date.now();
  const map = cacheMapRef.current;
  for (const [key, ts] of map.entries()) {
    if ((now - ts) > ttlMs) map.delete(key);
  }
  const previous = map.get(fingerprint);
  if (previous && (now - previous) < ttlMs) return true;
  map.set(fingerprint, now);
  return false;
}

/**
 * Owns the live call session (websocket, audio capture, transcript, suggestions,
 * MEDDPICC, status). Lives at the app root so navigating away from the Call
 * page does NOT tear down the session — the user can leave and come back and
 * the call is still running.
 */
export function CallSessionProvider({ children }) {
  const [status, setStatus] = useState('idle'); // idle | connecting | listening | stopped
  const [sessionId, setSessionId] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [meddpicc, setMeddpicc] = useState(null);
  const [coaching, setCoaching] = useState([]);
  const [meddpiccQuestions, setMeddpiccQuestions] = useState({});
  const [error, setError] = useState(null);
  const [audioSourceId, setAudioSourceId] = useState(null);

  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const micStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const suggestionDedupRef = useRef(new Map());
  const coachingDedupRef = useRef(new Map());

  const handleWsMessage = useCallback((msg) => {
    switch (msg.type) {
      case '_connected':
        setStatus('listening');
        setError(null);
        break;
      case '_disconnected':
        setStatus(prev => (prev !== 'idle' ? 'stopped' : prev));
        break;
      case '_error':
        setError(msg.message);
        break;
      case 'session_started':
        setSessionId(msg.sessionId);
        break;
      case 'transcript':
        setTranscript(prev => [...prev, { text: msg.text, speaker: msg.speaker || 'customer', timestamp: new Date().toISOString() }]);
        setPartialTranscript('');
        break;
      case 'transcript_partial':
        setPartialTranscript(msg.text || '');
        break;
      case 'suggestion':
        if (isDuplicate(suggestionDedupRef, suggestionFingerprint(msg.suggestion || {}))) break;
        setSuggestions(prev => [...prev, { ...msg.suggestion, _id: Date.now() + Math.random() }]);
        break;
      case 'meddpicc_update':
        setMeddpicc(msg.meddpicc);
        break;
      case 'coaching':
        if (isDuplicate(coachingDedupRef, coachingFingerprint(msg.coaching || {}))) break;
        // Stack nudges - newest first, keep history so earlier moves aren't lost.
        setCoaching(prev => [{ ...msg.coaching, _id: Date.now() + Math.random() }, ...prev].slice(0, 30));
        break;
      case 'meddpicc_questions':
        setMeddpiccQuestions(msg.questions || {});
        break;
      case 'error':
        setError(msg.message);
        break;
      default:
        break;
    }
  }, []);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
  }, []);

  const startListening = useCallback(async () => {
    try {
      setStatus('connecting');
      setError(null);
      setTranscript([]);
      setPartialTranscript('');
      setSuggestions([]);
      setMeddpicc(null);
      setCoaching([]);
      setMeddpiccQuestions({});
      setSessionId(null);
      suggestionDedupRef.current.clear();
      coachingDedupRef.current.clear();

      const isElectron = !!window.clumo?.isElectron;
      let sourceId = audioSourceId;
      if (!sourceId && isElectron) {
        const sources = await window.clumo.getAudioSources();
        const screen = sources.find(s => s.id.startsWith('screen:'));
        if (screen) sourceId = screen.id;
      }
      if (!sourceId && !isElectron) {
        sourceId = 'screen-share';
      }

      let stream;
      let customerChannel = 'customer';
      if (isElectron && sourceId && sourceId !== 'microphone' && sourceId !== 'screen-share') {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } },
          video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } }
        });
        stream.getVideoTracks().forEach(t => t.stop());
      } else if (sourceId === 'screen-share') {
        stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        stream.getVideoTracks().forEach(t => t.stop());
      } else {
        // The rep explicitly picked their microphone as the (only) source.
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        customerChannel = 'you';
      }

      if (!stream || stream.getAudioTracks().length === 0) {
        throw new Error('No audio track available from the selected source.');
      }

      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      const ws = createWsClient(handleWsMessage);
      wsRef.current = ws;

      // Wire one capture pipeline (source -> processor -> muted output) that
      // streams PCM16 for a given speaker channel to the server.
      const wirePipeline = (mediaStream, channel) => {
        const source = audioContext.createMediaStreamSource(mediaStream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          try {
            if (ws.readyState !== WebSocket.OPEN) return;
            const float32 = e.inputBuffer.getChannelData(0);
            const pcm16 = new Int16Array(float32.length);
            for (let i = 0; i < float32.length; i++) {
              const s = Math.max(-1, Math.min(1, float32[i]));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            const bytes = new Uint8Array(pcm16.buffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            ws.sendAudio(btoa(binary), channel);
          } catch (err) {
            console.error('[CallSession] onaudioprocess error:', err);
          }
        };
        source.connect(processor);
        const muteGain = audioContext.createGain();
        muteGain.gain.value = 0;
        processor.connect(muteGain);
        muteGain.connect(audioContext.destination);
      };

      // Customer (system/screen) channel — always present.
      wirePipeline(stream, customerChannel);

      // Rep microphone = "You" channel. Skip when the customer source is already
      // the mic. If the mic is unavailable/denied, degrade gracefully to
      // customer-only rather than failing the whole call.
      if (customerChannel !== 'you') {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (micStream && micStream.getAudioTracks().length > 0) {
            micStreamRef.current = micStream;
            wirePipeline(micStream, 'you');
          }
        } catch (micErr) {
          console.warn('[CallSession] Microphone unavailable — transcribing customer audio only:', micErr?.message || micErr);
          setError('Microphone unavailable — only the other participant will be transcribed. Grant mic access to capture your side.');
        }
      }
    } catch (e) {
      console.error('[CallSession] Failed to start listening:', e);
      setError(e?.message || String(e) || 'Failed to start audio capture');
      cleanup();
      setStatus('idle');
    }
  }, [audioSourceId, handleWsMessage, cleanup]);

  const stopListening = useCallback(() => {
    cleanup();
    setStatus('stopped');
  }, [cleanup]);

  const sendSuggestionUsed = useCallback((id) => {
    wsRef.current?.sendSuggestionUsed?.(id);
  }, []);

  const sendSuggestionDismissed = useCallback((id) => {
    wsRef.current?.sendSuggestionDismissed?.(id);
  }, []);

  const resetSession = useCallback(() => {
    cleanup();
    setStatus('idle');
    setSessionId(null);
    setTranscript([]);
    setPartialTranscript('');
    setSuggestions([]);
    setMeddpicc(null);
    setCoaching([]);
    setMeddpiccQuestions({});
    setError(null);
    suggestionDedupRef.current.clear();
    coachingDedupRef.current.clear();
  }, [cleanup]);

  // Tear down on full unmount (e.g. window close) — best-effort
  useEffect(() => () => cleanup(), [cleanup]);

  const value = {
    status,
    sessionId,
    transcript,
    partialTranscript,
    suggestions,
    meddpicc,
    coaching,
    meddpiccQuestions,
    error,
    audioSourceId,
    setAudioSourceId,
    startListening,
    stopListening,
    sendSuggestionUsed,
    sendSuggestionDismissed,
    resetSession
  };

  return (
    <CallSessionContext.Provider value={value}>
      {children}
    </CallSessionContext.Provider>
  );
}

export function useCallSession() {
  const ctx = useContext(CallSessionContext);
  if (!ctx) throw new Error('useCallSession must be used within CallSessionProvider');
  return ctx;
}
