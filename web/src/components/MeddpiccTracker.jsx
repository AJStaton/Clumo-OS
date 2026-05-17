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

export default function MeddpiccTracker({ meddpicc, methodology = 'meddpicc' }) {
  if (!meddpicc) return null;

  const criteria = Object.entries(meddpicc);
  const title = methodology === 'bant' ? 'BANT' : 'MEDDPICC';
  const labels = methodology === 'bant' ? BANT_LABELS : MEDDPICC_LABELS;

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
