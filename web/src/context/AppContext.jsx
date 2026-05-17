import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [sessions, setSessions] = useState([]);
  const [preferences, setPreferences] = useState({ methodology: 'meddpicc' });
  const [connectionStatus, setConnectionStatus] = useState('unknown'); // unknown, connected, disconnected, listening
  const [activeSessionId, setActiveSessionId] = useState(null);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (e) {
      console.error('[AppContext] Failed to fetch sessions:', e);
    }
  }, []);

  const refreshPreferences = useCallback(async () => {
    try {
      const res = await fetch('/api/preferences');
      if (res.ok) {
        const data = await res.json();
        setPreferences(data);
      }
    } catch (e) {
      console.error('[AppContext] Failed to fetch preferences:', e);
    }
  }, []);

  const updatePreferences = useCallback(async (updates) => {
    try {
      const res = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const data = await res.json();
        setPreferences(data);
      }
    } catch (e) {
      console.error('[AppContext] Failed to update preferences:', e);
    }
  }, []);

  useEffect(() => {
    refreshSessions();
    refreshPreferences();
  }, [refreshSessions, refreshPreferences]);

  // Check connection status by testing settings endpoint
  useEffect(() => {
    async function checkConnection() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setConnectionStatus(data.configured ? 'connected' : 'disconnected');
        } else {
          setConnectionStatus('disconnected');
        }
      } catch {
        setConnectionStatus('disconnected');
      }
    }
    checkConnection();
  }, []);

  const value = {
    sessions,
    preferences,
    connectionStatus,
    setConnectionStatus,
    activeSessionId,
    setActiveSessionId,
    refreshSessions,
    refreshPreferences,
    updatePreferences
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
