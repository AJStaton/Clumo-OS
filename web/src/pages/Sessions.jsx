import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Sessions() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sessions')
      .then(res => res.json())
      .then(data => {
        setSessions(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function formatDuration(start, end) {
    if (!start || !end) return '-';
    const ms = new Date(end) - new Date(start);
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  if (loading) {
    return <div className="p-6 text-gray-500">Loading sessions...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-xl font-bold mb-6">Sessions</h1>

      {sessions.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No sessions yet.</p>
          <p className="text-sm mt-1">Start a call from the <Link to="/call" className="text-blue-600 hover:underline">Call</Link> page.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Duration</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Suggestions</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.sessionId} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">{formatDate(s.startTime)}</td>
                  <td className="px-4 py-3">
                    <Link to={`/session/${s.sessionId}`} className="text-blue-600 hover:underline">
                      {s.name || s.sessionId.slice(0, 20)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatDuration(s.startTime, s.endTime)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {s.suggestionCount ?? s.totalSuggestions ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      s.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
