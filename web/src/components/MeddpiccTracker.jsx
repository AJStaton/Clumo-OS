const MEDDPICC_LABELS = {
  M: 'Metrics',
  E: 'Economic Buyer',
  D: 'Decision Criteria',
  D2: 'Decision Process',
  P: 'Paper Process',
  I: 'Identify Pain',
  C: 'Champion',
  C2: 'Competition'
};

const BANT_LABELS = {
  B: 'Budget',
  A: 'Authority',
  N: 'Need',
  T: 'Timeline'
};

function scoreColor(score) {
  if (score >= 4) return 'text-green-600 dark:text-green-400';
  if (score >= 3) return 'text-yellow-600 dark:text-yellow-400';
  if (score >= 1) return 'text-orange-500 dark:text-orange-400';
  return 'text-gray-400 dark:text-gray-500';
}

function barColor(score) {
  if (score >= 4) return 'bg-green-500';
  if (score >= 3) return 'bg-yellow-400';
  if (score >= 1) return 'bg-orange-400';
  return 'bg-gray-200 dark:bg-gray-600';
}

export default function MeddpiccTracker({ meddpicc, methodology = 'meddpicc', minimised = false, questions = {} }) {
  if (!meddpicc) return null;

  const criteria = Object.entries(meddpicc);
  const title = methodology === 'bant' ? 'BANT' : 'MEDDPICC';
  const labels = methodology === 'bant' ? BANT_LABELS : MEDDPICC_LABELS;

  if (minimised) {
    return (
      <div className="p-3 space-y-1.5">
        <h3 className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</h3>
        <div className="space-y-1">
          {criteria.map(([key, data]) => {
            const hasScore = typeof data.score === 'number';
            const score = hasScore ? data.score : 0;
            const label = data.label || labels[key] || key;
            const status = data.status;
            const confirmed = hasScore ? score >= 4 : status === 'confirmed';
            const partial = hasScore ? score >= 1 && score < 4 : status === 'partial';
            const dot = confirmed ? 'bg-green-500' : partial ? 'bg-yellow-400' : 'bg-gray-300 dark:bg-gray-600';
            const qs = !confirmed ? (questions[key] || []) : [];
            const hasTip = qs.length > 0;

            return (
              <div key={key} className="relative group flex items-center gap-2 text-xs py-0.5 cursor-default">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                <span className="font-mono font-bold text-gray-400 dark:text-gray-500 w-7">{key}</span>
                <span className="text-gray-600 dark:text-gray-400 truncate">{label}</span>
                {hasTip && (
                  <span className="ml-auto text-[9px] text-gray-300 dark:text-gray-600">?</span>
                )}

                {hasTip && (
                  <div className="pointer-events-none absolute right-0 top-full mt-1 z-20 w-64 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">
                        {label} — ask
                      </p>
                      <ul className="space-y-1.5">
                        {qs.slice(0, 3).map((q, i) => (
                          <li key={i} className="text-xs text-gray-700 dark:text-gray-300 leading-snug flex gap-1.5">
                            <span className="text-gray-300 dark:text-gray-600">•</span>
                            <span>{q}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">{title}</h3>
      {criteria.map(([key, data]) => {
        // Support both score-based (summary) and status-based (live) formats
        const hasScore = typeof data.score === 'number';
        const score = hasScore ? data.score : 0;
        const label = data.label || labels[key] || key;
        const notes = data.notes || '';

        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-gray-500 dark:text-gray-400 w-6">{key}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
                  {hasScore ? (
                    <span className={`text-xs font-semibold ${scoreColor(score)}`}>
                      {score}/5
                    </span>
                  ) : (
                    <span className={`text-xs ${data.status === 'confirmed' ? 'text-green-600 dark:text-green-400' : data.status === 'partial' ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-400 dark:text-gray-500'}`}>
                      {data.status === 'confirmed' ? 'Found' : data.status === 'partial' ? 'Partial' : 'Not found'}
                    </span>
                  )}
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${hasScore ? barColor(score) : (data.status === 'confirmed' ? 'bg-green-500' : data.status === 'partial' ? 'bg-yellow-400' : 'bg-gray-200 dark:bg-gray-600')}`}
                    style={{
                      width: hasScore ? `${(score / 5) * 100}%` : (data.status === 'confirmed' ? '100%' : data.status === 'partial' ? '50%' : '0%')
                    }}
                  />
                </div>
              </div>
            </div>
            {notes && (
              <p className="text-[10px] text-gray-400 dark:text-gray-500 ml-9 leading-relaxed">{notes}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
