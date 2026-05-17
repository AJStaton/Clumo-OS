import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Sessions() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState(null);

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

  async function handleDelete(sessionId) {
    if (deleting === sessionId) {
      await fetch(`/api/session/${sessionId}`, { method: 'DELETE' });
      setSessions(sessions.filter(s => s.sessionId !== sessionId));
      setDeleting(null);
    } else {
      setDeleting(sessionId);
    }
  }

  const filtered = sessions.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = (s.name || s.sessionId || '').toLowerCase();
    return name.includes(q);
  });

  if (loading) {
    return <div className="p-6 text-gray-500">Loading sessions...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">History</h1>
        {sessions.length > 0 && (
          <input
            type="text"
            placeholder="Search sessions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm w-56 focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No sessions yet.</p>
          <p className="text-sm mt-1">Start a session from the <Link to="/session" className="text-blue-600 hover:underline">Session</Link> page.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">No sessions match "{search}"</p>
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
                <th className="text-right px-4 py-3 font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
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
                    <div className="flex gap-1.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        s.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {s.status}
                      </span>
                      {s.hasAnalysis && (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          Analyzed
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.status === 'completed' && (
                      <button
                        onClick={() => handleDelete(s.sessionId)}
                        className={`text-xs ${deleting === s.sessionId ? 'text-red-600 font-medium' : 'text-gray-400 hover:text-red-500'}`}
                      >
                        {deleting === s.sessionId ? 'Confirm?' : 'Delete'}
                      </button>
                    )}
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
