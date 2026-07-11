import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import SessionSummary from '../components/SessionSummary';

export default function Session() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/session/${sessionId}`)
      .then(res => {
        if (!res.ok) throw new Error('Session not found');
        return res.json();
      })
      .then(data => {
        setSession(data);
        if (data.analysis) setAnalysis(data.analysis);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, [sessionId]);

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/session/${sessionId}/analyze`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const data = await res.json();
      setAnalysis(data);
    } catch (e) {
      setError(e.message);
    }
    setAnalyzing(false);
  }

  if (loading) return <div className="p-6 text-gray-500 dark:text-gray-400">Loading...</div>;
  if (error) return <div className="p-6 text-red-600 dark:text-red-400">Error: {error}</div>;
  if (!session) return <div className="p-6 text-gray-500 dark:text-gray-400">Session not found</div>;

  return (
    <SessionSummary
      session={session}
      analysis={analysis}
      onAnalyze={handleAnalyze}
      analyzing={analyzing}
    />
  );
}
