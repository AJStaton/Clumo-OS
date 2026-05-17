import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AppProvider } from './context/AppContext';
import Landing from './pages/Landing';
import Setup from './pages/Setup';
import Call from './pages/Call';
import Session from './pages/Session';
import ExampleSession from './pages/ExampleSession';
import KB from './pages/KB';
import Settings from './pages/Settings';
import AiModelsSettings from './pages/AiModelsSettings';
import PreferencesSettings from './pages/PreferencesSettings';
import Sidebar from './components/Sidebar';

export default function App() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        setStatus(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center">
          <div className="text-2xl font-bold tracking-tight mb-2 text-gray-900 dark:text-gray-100">Clumo</div>
          <div className="text-gray-500 dark:text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  const needsSetup = !status?.setupComplete;

  return (
    <AppProvider>
      <BrowserRouter>
        {needsSetup ? (
          <div className="min-h-screen flex flex-col">
            <main className="flex-1 w-full">
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/setup" element={<Setup onComplete={() => {
                  fetch('/api/status').then(r => r.json()).then(setStatus);
                }} />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </main>
          </div>
        ) : (
          <div className="h-screen flex overflow-hidden bg-white dark:bg-gray-800">
            <Sidebar
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            />
            <main className="flex-1 overflow-y-auto">
              <Routes>
                <Route path="/" element={<Navigate to="/session" />} />
                <Route path="/session" element={<Call onListeningChange={(listening) => {
                  if (listening) setSidebarCollapsed(true);
                }} />} />
                <Route path="/session/example" element={<ExampleSession />} />
                <Route path="/session/:sessionId" element={<Session />} />
                <Route path="/settings" element={<Settings />}>
                  <Route index element={<Navigate to="/settings/ai-models" replace />} />
                  <Route path="ai-models" element={<AiModelsSettings />} />
                  <Route path="knowledge-base" element={<KB />} />
                  <Route path="preferences" element={<PreferencesSettings />} />
                  <Route path="integrations" element={<Navigate to="/settings/ai-models" replace />} />
                  <Route path="automation" element={<Navigate to="/settings/ai-models" replace />} />
                </Route>
                <Route path="/kb" element={<Navigate to="/settings/knowledge-base" replace />} />
                <Route path="/history" element={<Navigate to="/session" replace />} />
                <Route path="/call" element={<Navigate to="/session" replace />} />
                <Route path="/sessions" element={<Navigate to="/session" replace />} />
                <Route path="*" element={<Navigate to="/session" />} />
              </Routes>
            </main>
          </div>
        )}
      </BrowserRouter>
    </AppProvider>
  );
}
