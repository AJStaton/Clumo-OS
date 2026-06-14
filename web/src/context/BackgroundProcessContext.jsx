import { createContext, useContext, useState, useRef, useCallback } from 'react';

const BackgroundProcessContext = createContext(null);

/**
 * Manages background SSE processes that should survive navigation.
 * Keeps EventSource connections alive and accumulates messages
 * even when the originating component is unmounted.
 */
export function BackgroundProcessProvider({ children }) {
  // Each process: { id, status, messages, counts, eventSource }
  const [processes, setProcesses] = useState({});
  const eventSourcesRef = useRef({});

  const updateProcess = useCallback((id, updates) => {
    setProcesses(prev => ({
      ...prev,
      [id]: { ...prev[id], ...updates }
    }));
  }, []);

  const startProcess = useCallback((id, { sseToken, onComplete }) => {
    // Clean up any existing process with same id
    if (eventSourcesRef.current[id]) {
      eventSourcesRef.current[id].close();
    }

    setProcesses(prev => ({
      ...prev,
      [id]: { id, status: 'running', messages: [], counts: null }
    }));

    const streamUrl = `/api/onboarding/stream?token=${sseToken}`;
    const eventSource = new EventSource(streamUrl);
    eventSourcesRef.current[id] = eventSource;

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setProcesses(prev => ({
        ...prev,
        [id]: {
          ...prev[id],
          messages: [...(prev[id]?.messages || []), data.message]
        }
      }));
    });

    eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      setProcesses(prev => ({
        ...prev,
        [id]: { ...prev[id], status: 'complete', counts: data.counts, coverage: data.coverage || null }
      }));
      eventSource.close();
      delete eventSourcesRef.current[id];
      if (onComplete) onComplete(data);
    });

    eventSource.addEventListener('error', (e) => {
      let errorMsg;
      try {
        const data = JSON.parse(e.data);
        errorMsg = `Error: ${data.message}`;
      } catch {
        errorMsg = 'AI provider not configured or connection failed. Go to Settings → AI Models to configure your provider.';
      }
      setProcesses(prev => ({
        ...prev,
        [id]: {
          ...prev[id],
          status: 'error',
          messages: [...(prev[id]?.messages || []), errorMsg]
        }
      }));
      eventSource.close();
      delete eventSourcesRef.current[id];
    });

    // Handle native connection errors
    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) return;
      setProcesses(prev => ({
        ...prev,
        [id]: {
          ...prev[id],
          status: 'error',
          messages: [...(prev[id]?.messages || []), 'Error: Connection to server lost.']
        }
      }));
      eventSource.close();
      delete eventSourcesRef.current[id];
    };
  }, []);

  const clearProcess = useCallback((id) => {
    if (eventSourcesRef.current[id]) {
      eventSourcesRef.current[id].close();
      delete eventSourcesRef.current[id];
    }
    setProcesses(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const value = {
    processes,
    startProcess,
    updateProcess,
    clearProcess
  };

  return (
    <BackgroundProcessContext.Provider value={value}>
      {children}
    </BackgroundProcessContext.Provider>
  );
}

export function useBackgroundProcess() {
  const context = useContext(BackgroundProcessContext);
  if (!context) throw new Error('useBackgroundProcess must be used within BackgroundProcessProvider');
  return context;
}
