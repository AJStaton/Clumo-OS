import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function Sidebar({ collapsed, onToggleCollapse }) {
  const { sessions, connectionStatus, refreshSessions } = useApp();
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filteredSessions = sessions.filter(s =>
    s.status === 'completed' &&
    (!search || (s.name || s.sessionId).toLowerCase().includes(search.toLowerCase()))
  );

  async function handleRename(sessionId) {
    if (!renameValue.trim()) return;
    const res = await fetch(`/api/session/${sessionId}/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: renameValue.trim() })
    });
    if (res.ok) {
      setRenaming(null);
      refreshSessions();
    }
  }

  async function handleDelete(sessionId) {
    const res = await fetch(`/api/session/${sessionId}`, { method: 'DELETE' });
    if (res.ok) {
      setConfirmDelete(null);
      refreshSessions();
    }
  }

  function handleExport(session) {
    const url = `/api/session/${session.sessionId}/export`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.name || session.sessionId}.json`;
    a.click();
    setMenuOpen(null);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }

  // Collapsed icon rail
  if (collapsed) {
    return (
      <aside className="w-12 bg-gray-50 border-r border-gray-200 flex flex-col items-center py-4 gap-4 transition-all duration-200">
        <button
          onClick={onToggleCollapse}
          className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-700"
          title="Expand sidebar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button
          onClick={() => { onToggleCollapse(); navigate('/session'); }}
          className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-700"
          title="Current meeting"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>
        <button
          onClick={() => { onToggleCollapse(); }}
          className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-700"
          title="Summaries"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        <div className="mt-auto">
          <button
            onClick={() => { onToggleCollapse(); navigate('/settings'); }}
            className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-700"
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col h-full transition-all duration-200">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight text-gray-900">Clumo</span>
          <button
            onClick={onToggleCollapse}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-200"
            title="Collapse sidebar"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Current Meeting Button */}
      <div className="px-3 py-3">
        <NavLink
          to="/session"
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-200'
            }`
          }
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          Current meeting
        </NavLink>
      </div>

      {/* Summaries Section */}
      <div className="flex-1 flex flex-col overflow-hidden px-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">Summaries</h3>
        </div>

        {/* Search */}
        <div className="mb-2">
          <input
            type="text"
            placeholder="Search sessions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-gray-300 placeholder-gray-400"
          />
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto space-y-0.5">
          {filteredSessions.length === 0 && !search && (
            <div className="px-2 py-4 text-center">
              <p className="text-xs text-gray-400 leading-relaxed">
                Your session summaries will appear here after your first call.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Click <span className="font-medium text-gray-500">"Start listening"</span> to begin.
              </p>
            </div>
          )}
          {filteredSessions.length === 0 && search && (
            <p className="text-xs text-gray-400 px-2 py-2">No sessions match "{search}"</p>
          )}
          {filteredSessions.map(session => (
            <div
              key={session.sessionId}
              className="group relative flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-200 cursor-pointer"
              onClick={() => navigate(`/session/${session.sessionId}`)}
            >
              <div className="flex-1 min-w-0">
                {renaming === session.sessionId ? (
                  <input
                    type="text"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename(session.sessionId);
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    onBlur={() => handleRename(session.sessionId)}
                    onClick={e => e.stopPropagation()}
                    className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
                    autoFocus
                  />
                ) : (
                  <>
                    <p className="text-xs font-medium text-gray-700 truncate">
                      {session.name || 'Unnamed session'}
                    </p>
                    <p className="text-[10px] text-gray-400">{formatDate(session.startTime || session.endTime)}</p>
                  </>
                )}
              </div>

              {/* Analyzed indicator */}
              {session.hasAnalysis && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" title="Analyzed" />
              )}

              {/* ... menu */}
              <button
                onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === session.sessionId ? null : session.sessionId); }}
                className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-300 flex-shrink-0"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
                  <circle cx="8" cy="3" r="1.5" />
                  <circle cx="8" cy="8" r="1.5" />
                  <circle cx="8" cy="13" r="1.5" />
                </svg>
              </button>

              {/* Context menu */}
              {menuOpen === session.sessionId && (
                <div
                  ref={menuRef}
                  className="absolute right-0 top-8 z-50 w-36 bg-white border border-gray-200 rounded-md shadow-lg py-1"
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    onClick={() => { setRenaming(session.sessionId); setRenameValue(session.name || ''); setMenuOpen(null); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => handleExport(session)}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                  >
                    Export JSON
                  </button>
                  <button
                    onClick={() => { setConfirmDelete(session.sessionId); setMenuOpen(null); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              )}

              {/* Delete confirmation */}
              {confirmDelete === session.sessionId && (
                <div
                  className="absolute right-0 top-8 z-50 w-48 bg-white border border-gray-200 rounded-md shadow-lg p-3"
                  onClick={e => e.stopPropagation()}
                >
                  <p className="text-xs text-gray-600 mb-2">Delete this session?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDelete(session.sessionId)}
                      className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Settings Section */}
      <div className="border-t border-gray-200 px-3 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1 mb-2">Settings</h3>
        <nav className="space-y-0.5">
          <NavLink
            to="/settings/knowledge-base"
            className={({ isActive }) =>
              `block px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                isActive ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
              }`
            }
          >
            Knowledge Base
          </NavLink>
          <NavLink
            to="/settings/preferences"
            className={({ isActive }) =>
              `block px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                isActive ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
              }`
            }
          >
            Preferences
          </NavLink>
          <NavLink
            to="/settings/ai-models"
            className={({ isActive }) =>
              `block px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                isActive ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
              }`
            }
          >
            AI Models
          </NavLink>
          <span className="block px-3 py-1.5 text-xs text-gray-300 cursor-not-allowed">
            Integrations <span className="text-[10px]">(coming soon)</span>
          </span>
          <span className="block px-3 py-1.5 text-xs text-gray-300 cursor-not-allowed">
            Automations <span className="text-[10px]">(coming soon)</span>
          </span>
        </nav>
      </div>

      {/* Connection Status */}
      <div className="border-t border-gray-200 px-4 py-2.5 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${
          connectionStatus === 'connected' ? 'bg-green-400' :
          connectionStatus === 'listening' ? 'bg-green-400 animate-pulse' :
          'bg-gray-300'
        }`} />
        <span className="text-[10px] text-gray-400">
          {connectionStatus === 'connected' && 'AI connected'}
          {connectionStatus === 'listening' && 'Listening...'}
          {connectionStatus === 'disconnected' && 'Not configured'}
          {connectionStatus === 'unknown' && 'Checking...'}
        </span>
      </div>
    </aside>
  );
}
