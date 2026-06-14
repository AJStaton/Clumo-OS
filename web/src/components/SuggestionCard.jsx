import { useState, useEffect } from 'react';

const TYPE_STYLES = {
  case_study: { label: 'Case Study', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800' },
  discovery: { label: 'Discovery Question', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800' },
  proof_point: { label: 'Proof Point', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800' },
  product_truth: { label: 'Product Truth', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800' }
};

export default function SuggestionCard({ suggestion }) {
  const style = TYPE_STYLES[suggestion.type] || TYPE_STYLES.case_study;
  const item = suggestion.suggestion || suggestion;
  const triggeredAt = suggestion.triggeredAt || item.triggeredAt;
  const triggerTime = triggeredAt ? new Date(triggeredAt).toLocaleTimeString() : null;
  const trigger = suggestion.trigger || item.trigger;

  return (
    <div className={`${style.bg} ${style.border} border rounded-lg p-4 mb-3 relative animate-in`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold uppercase tracking-wide ${style.text}`}>
          {style.label}
        </span>
        {triggerTime && (
          <span className="text-xs text-gray-400" title="When the customer said the triggering statement">
            {triggerTime}
          </span>
        )}
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
          {item.link && (
            <a href={item.link} target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline mt-1 inline-block">
              View source
            </a>
          )}
        </>
      )}

      {suggestion.type === 'product_truth' && (
        <>
          <p className="font-semibold text-sm">{item.fact}</p>
          {item.category && <p className="text-xs text-gray-500 mt-1">{item.category}</p>}
          {item.link && (
            <a href={item.link} target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline mt-1 inline-block">
              View source
            </a>
          )}
        </>
      )}

      {trigger && (
        <p
          className="mt-2 pt-2 border-t border-black/5 text-xs italic text-gray-400 truncate"
          title={`Why now — the customer said: "${trigger}"`}
        >
          <span className="not-italic text-gray-300 mr-1">&#8627;</span>
          &ldquo;{trigger}&rdquo;
        </p>
      )}
    </div>
  );
}
