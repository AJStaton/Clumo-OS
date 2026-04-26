import { useEffect, useRef } from 'react';

export default function Transcript({ entries }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-2">
      {entries.length === 0 && (
        <p className="text-gray-400 text-sm">Transcript will appear here when the call starts...</p>
      )}
      {entries.map((entry, i) => (
        <div key={i} className="text-sm leading-relaxed">
          <span className="text-gray-400 text-xs mr-2">
            {new Date(entry.timestamp).toLocaleTimeString()}
          </span>
          <span className="text-gray-800">{entry.text}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
