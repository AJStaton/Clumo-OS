import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Landing from './pages/Landing';
import Setup from './pages/Setup';
import Call from './pages/Call';
import Sessions from './pages/Sessions';
import Session from './pages/Session';
import KB from './pages/KB';
import Settings from './pages/Settings';
import AiModelsSettings from './pages/AiModelsSettings';
import IntegrationsSettings from './pages/IntegrationsSettings';
import AutomationSettings from './pages/AutomationSettings';
import Nav from './components/Nav';

export default function App() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold tracking-tight mb-2">Clumo</div>
          <div className="text-gray-500">Loading...</div>
        </div>
      </div>
    );
  }

  // If setup isn't complete, show setup wizard
  const needsSetup = !status?.setupComplete;

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
      {!needsSetup && <Nav />}
      <main className="flex-1 w-full">
      <Routes>
        <Route path="/" element={needsSetup ? <Landing /> : <Navigate to="/session" />} />
        <Route path="/setup" element={<Setup onComplete={() => {
          fetch('/api/status').then(r => r.json()).then(setStatus);
        }} />} />
        <Route path="/session" element={needsSetup ? <Navigate to="/" /> : <Call />} />
        <Route path="/history" element={needsSetup ? <Navigate to="/" /> : <Sessions />} />
        <Route path="/session/:sessionId" element={needsSetup ? <Navigate to="/" /> : <Session />} />
        <Route path="/kb" element={needsSetup ? <Navigate to="/" /> : <KB />} />
        <Route path="/settings" element={needsSetup ? <Navigate to="/" /> : <Settings />}>
          <Route path="ai-models" element={<AiModelsSettings />} />
          <Route path="integrations" element={<IntegrationsSettings />} />
          <Route path="automation" element={<AutomationSettings />} />
        </Route>
        <Route path="/call" element={<Navigate to="/session" />} />
        <Route path="/sessions" element={<Navigate to="/history" />} />
        <Route path="*" element={<Navigate to={needsSetup ? "/" : "/session"} />} />
      </Routes>
      </main>
      </div>
    </BrowserRouter>
  );
}
