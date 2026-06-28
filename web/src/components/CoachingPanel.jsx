// Live coaching panel: one prioritised nudge at a time, from a single coach
// voice. The persona (SE / AE / Closer) is shown as a flavour tag; the engine
// debates internally and surfaces only the single best move.

const PERSONA_STYLES = {
  se: { label: 'Solution Engineer', dot: 'bg-amber-400', tag: 'text-amber-700 dark:text-amber-300' },
  ae: { label: 'Account Executive', dot: 'bg-blue-400', tag: 'text-blue-700 dark:text-blue-300' },
  closer: { label: 'Closer', dot: 'bg-rose-400', tag: 'text-rose-700 dark:text-rose-300' }
};

const MOVE_LABELS = {
  Sharpen: 'Sharpen', Dig: 'Dig into pain', Reframe: 'Reframe',
  HandleObjection: 'Handle objection', Advance: 'Advance', MultiThread: 'Multi-thread',
  SlowDown: 'Slow down', DeRisk: 'De-risk', NextStep: 'Next step'
};

export default function CoachingPanel({ coaching, status }) {
  const isListening = status === 'listening';

  if (!coaching) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6">
        <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
          <span className="text-lg">🎯</span>
        </div>
        <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">
          {isListening
            ? 'Coaching the call. The coach speaks rarely, only when it has a sharp move for you.'
            : 'Live coaching appears here during a call.'}
        </p>
      </div>
    );
  }

  const persona = PERSONA_STYLES[coaching.persona] || PERSONA_STYLES.ae;
  const moveLabel = MOVE_LABELS[coaching.type] || coaching.type;
  const isNow = coaching.urgency === 'now';

  return (
    <div className="p-4">
      <div
        key={coaching._id}
        className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-5 animate-in"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${persona.dot}`} />
            <span className={`text-xs font-semibold ${persona.tag}`}>{persona.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {moveLabel}
            </span>
            {isNow && (
              <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                Now
              </span>
            )}
          </div>
        </div>

        <p className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-snug">
          {coaching.headline}
        </p>

        {coaching.why && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
            {coaching.why}
          </p>
        )}

        {coaching.say && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
              Try saying
            </p>
            <p className="text-sm text-gray-800 dark:text-gray-200 italic leading-relaxed">
              &ldquo;{coaching.say}&rdquo;
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
