import { useEffect, useRef } from 'react';

export default function Transcript({ entries, compact = false }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  return (
    <div className={`h-full overflow-y-auto ${compact ? 'p-2 space-y-1' : 'p-4 space-y-2'}`}>
      {entries.length === 0 && (
        <p className={`text-gray-400 ${compact ? 'text-xs' : 'text-sm'}`}>
          Transcript will appear here when the call starts...
        </p>
      )}
      {entries.map((entry, i) => {
        const isYou = entry.speaker === 'you';
        const isCustomer = entry.speaker === 'customer';
        const speakerLabel = isYou ? 'You' : isCustomer ? 'Customer' : null;
        return (
          <div key={i} className={compact ? 'text-xs leading-snug' : 'text-sm leading-relaxed'}>
            <span className={`text-gray-400 mr-2 ${compact ? 'text-[10px]' : 'text-xs'}`}>
              {new Date(entry.timestamp).toLocaleTimeString()}
            </span>
            {speakerLabel && (
              <span
                className={`inline-block mr-2 rounded px-1.5 font-semibold ${compact ? 'text-[10px]' : 'text-xs'} ${
                  isYou ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {speakerLabel}
              </span>
            )}
            <span className="text-gray-800">{entry.text}</span>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
