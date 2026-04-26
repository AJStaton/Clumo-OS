import { useState, useEffect } from 'react';

const TYPE_STYLES = {
  case_study: { label: 'Case Study', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800' },
  discovery: { label: 'Discovery Question', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800' },
  proof_point: { label: 'Proof Point', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800' }
};

export default function SuggestionCard({ suggestion, onUse, onDismiss }) {
  const [timeLeft, setTimeLeft] = useState(15);
  const style = TYPE_STYLES[suggestion.type] || TYPE_STYLES.case_study;
  const item = suggestion.suggestion || suggestion;

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onDismiss?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onDismiss]);

  return (
    <div className={`${style.bg} ${style.border} border rounded-lg p-4 mb-3 relative animate-in`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold uppercase tracking-wide ${style.text}`}>
          {style.label}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{timeLeft}s</span>
          <button
            onClick={onUse}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/50 text-green-600"
            title="Used this"
          >
            &#10003;
          </button>
          <button
            onClick={onDismiss}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/50 text-gray-400"
            title="Dismiss"
          >
            &#10005;
          </button>
        </div>
      </div>

      {suggestion.type === 'case_study' && (
        <>
          <p className="font-semibold text-sm">{item.company} — {item.headline}</p>
          <p className="text-sm text-gray-600 mt-1">{item.result}</p>
          {item.link && (
            <a href={item.link} target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline mt-1 inline-block">
              Read more
            </a>
          )}
        </>
      )}

      {suggestion.type === 'discovery' && (
        <>
          <p className="font-semibold text-sm">{item.question}</p>
          {item.context && <p className="text-xs text-gray-500 mt-1">{item.context}</p>}
        </>
      )}

      {suggestion.type === 'proof_point' && (
        <>
          <p className="font-semibold text-sm">{item.stat}</p>
          {item.source && <p className="text-xs text-gray-500 mt-1">Source: {item.source}</p>}
        </>
      )}
    </div>
  );
}
