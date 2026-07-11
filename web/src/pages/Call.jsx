import { useEffect, useRef } from 'react';
import AudioSourcePicker from '../components/AudioSourcePicker';
import Transcript from '../components/Transcript';
import SuggestionCard from '../components/SuggestionCard';
import MeddpiccTracker from '../components/MeddpiccTracker';
import CoachingPanel from '../components/CoachingPanel';
import { useApp } from '../context/AppContext';
import { useCallSession } from '../context/CallSessionContext';

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
  const { preferences, refreshSessions } = useApp();
  const {
    status,
    sessionId,
    transcript,
    suggestions,
    meddpicc,
    coaching,
    meddpiccQuestions,
    error,
    setAudioSourceId,
    startListening,
    stopListening
  } = useCallSession();

  const prevStatusRef = useRef(null);
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      if (status === 'listening' && onListeningChange) onListeningChange(true);
      if (status === 'stopped') refreshSessions();
      prevStatusRef.current = status;
    }
  }, [status, onListeningChange, refreshSessions]);

  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        if (status === 'idle' || status === 'stopped') startListening();
        else if (status === 'listening') stopListening();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, startListening, stopListening]);

  const methodologyLetters = preferences.methodology === 'bant' ? BANT_LETTERS : MEDDPICC_LETTERS;
  const isIdle = status === 'idle' || status === 'stopped';

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {isIdle && !sessionId ? (
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
        <>
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

          <div className="flex-1 flex overflow-hidden">
              {/* Coaching — wide primary column */}
              <div className="flex-1 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Coaching</h2>
                </div>
                <CoachingPanel coaching={coaching} status={status} />
              </div>

              {/* Knowledge — medium column (formerly Suggestions) */}
              <div className="w-80 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-y-auto p-4 flex-shrink-0">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Knowledge</h2>
                {suggestions.length === 0 && (
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    {status === 'listening'
                      ? 'Surfacing relevant knowledge...'
                      : 'Knowledge will appear here during a call'}
                  </p>
                )}
                {suggestions.map(s => (
                  <SuggestionCard key={s._id} suggestion={s} />
                ))}
              </div>

              {/* Thin rail — MEDDPICC on top (room for tooltips), compact transcript tucked bottom-right */}
              <div className="w-64 bg-white dark:bg-gray-800 flex flex-col flex-shrink-0 overflow-hidden">
                <div className="flex-1 min-h-0 overflow-y-auto border-b border-gray-200 dark:border-gray-700">
                  {meddpicc ? (
                    <MeddpiccTracker
                      meddpicc={meddpicc}
                      methodology={preferences.methodology}
                      minimised
                      questions={meddpiccQuestions}
                    />
                  ) : (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 p-3">
                      {preferences.methodology === 'bant' ? 'BANT' : 'MEDDPICC'} tracking starts with the call
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0 h-[38%] flex flex-col min-h-0">
                  <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                    <h2 className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Transcript</h2>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <Transcript entries={transcript} compact />
                  </div>
                </div>
              </div>
            </div>
        </>
      )}
    </div>
  );
}
