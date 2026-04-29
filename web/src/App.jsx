import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Landing from './pages/Landing';
import Setup from './pages/Setup';
import Call from './pages/Call';
import Sessions from './pages/Sessions';
import Session from './pages/Session';
import KB from './pages/KB';
import Settings from './pages/Settings';
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
        <Route path="/" element={needsSetup ? <Landing /> : <Navigate to="/call" />} />
        <Route path="/setup" element={<Setup onComplete={() => {
          fetch('/api/status').then(r => r.json()).then(setStatus);
        }} />} />
        <Route path="/call" element={needsSetup ? <Navigate to="/" /> : <Call />} />
        <Route path="/sessions" element={needsSetup ? <Navigate to="/" /> : <Sessions />} />
        <Route path="/session/:sessionId" element={needsSetup ? <Navigate to="/" /> : <Session />} />
        <Route path="/kb" element={needsSetup ? <Navigate to="/" /> : <KB />} />
        <Route path="/settings" element={needsSetup ? <Navigate to="/" /> : <Settings />} />
        <Route path="*" element={<Navigate to={needsSetup ? "/" : "/call"} />} />
      </Routes>
      </main>
      </div>
    </BrowserRouter>
  );
}
