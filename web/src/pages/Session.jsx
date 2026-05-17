import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import MeddpiccTracker from '../components/MeddpiccTracker';

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

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!session) return <div className="p-6 text-gray-500">Session not found</div>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/history" className="text-sm text-gray-500 hover:text-gray-700">&larr; History</Link>
          <h1 className="text-xl font-bold mt-1">{session.name || sessionId.slice(0, 20)}</h1>
          <p className="text-sm text-gray-500">
            {session.startTime && new Date(session.startTime).toLocaleString()} — {session.totalSuggestions || 0} suggestions
          </p>
        </div>
        {session.status === 'completed' && !analysis && (
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {analyzing ? 'Analyzing...' : 'Generate Analysis'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Transcript */}
        <div className="col-span-2 bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Transcript</h2>
          </div>
          <div className="p-4 max-h-96 overflow-y-auto space-y-2">
            {(session.fullTranscript || []).map((entry, i) => (
              <div key={i} className="text-sm">
                <span className="text-gray-400 text-xs mr-2">
                  {entry.timestamp && new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span>{entry.text}</span>
              </div>
            ))}
            {(!session.fullTranscript || session.fullTranscript.length === 0) && (
              <p className="text-gray-400 text-sm">No transcript data</p>
            )}
          </div>
        </div>

        {/* MEDDPICC */}
        <div className="bg-white rounded-lg border border-gray-200">
          <MeddpiccTracker meddpicc={session.meddpicc} />
        </div>

        {/* Suggestions used */}
        <div className="col-span-3 bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">
              Suggestions ({(session.suggestions || []).length})
            </h2>
          </div>
          <div className="p-4">
            {(session.suggestions || []).length === 0 ? (
              <p className="text-gray-400 text-sm">No suggestions were surfaced</p>
            ) : (
              <div className="space-y-2">
                {session.suggestions.map((s, i) => (
                  <div key={i} className="text-sm p-3 bg-gray-50 rounded-md">
                    <span className="font-medium text-gray-700">
                      {s.type === 'case_study' && `Case Study: ${s.suggestion?.company}`}
                      {s.type === 'discovery' && `Discovery: ${s.suggestion?.question}`}
                      {s.type === 'proof_point' && `Proof Point: ${s.suggestion?.stat}`}
                      {s.type === 'product_truth' && `Product Truth: ${s.suggestion?.fact}`}
                    </span>
                    {s.timestamp && (
                      <span className="text-gray-400 text-xs ml-2">
                        {new Date(s.timestamp).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Analysis */}
        {analysis && (
          <>
            <div className="col-span-3 bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Session Notes</h2>
              </div>
              <ul className="p-4 space-y-2">
                {(analysis.callNotes || []).map((note, i) => (
                  <li key={i} className="text-sm text-gray-700 flex gap-2">
                    <span className="text-gray-400">-</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="col-span-3 bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">CRM Update — MEDDPICC</h2>
              </div>
              <div className="p-4">
                {analysis.crmUpdate?.meddpicc ? (
                  <div className="space-y-2">
                    {Object.entries(analysis.crmUpdate.meddpicc).map(([key, value]) => (
                      <div key={key} className="flex gap-3 text-sm">
                        <span className="font-mono font-semibold text-gray-900 w-8 shrink-0">{key}</span>
                        <span className={value === 'Not discussed in this call' ? 'text-gray-400 italic' : 'text-gray-700'}>
                          {value}
                        </span>
                      </div>
                    ))}
                    {analysis.crmUpdate.nextSteps && (
                      <div className="mt-4 pt-3 border-t border-gray-100">
                        <p className="text-sm font-medium text-gray-700 mb-1">Next Steps</p>
                        <p className="text-sm text-gray-600">{analysis.crmUpdate.nextSteps}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                    {typeof analysis.crmUpdate === 'string' ? analysis.crmUpdate : JSON.stringify(analysis.crmUpdate, null, 2)}
                  </pre>
                )}
              </div>
            </div>

            {analysis.followUpEmail && (
              <div className="col-span-3 bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-700">Follow-up Email</h2>
                </div>
                <div className="p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Subject: {analysis.followUpEmail.subject}
                  </p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {analysis.followUpEmail.body}
                  </p>
                </div>
              </div>
            )}

            {analysis.nextMeeting && (
              <div className="col-span-3 bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-700">Next Meeting Prep</h2>
                </div>
                <div className="p-4 space-y-3">
                  {analysis.nextMeeting.meddpiccGaps?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">MEDDPICC Gaps to Address</p>
                      <div className="flex gap-2 flex-wrap">
                        {analysis.nextMeeting.meddpiccGaps.map(gap => (
                          <span key={gap} className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-mono font-medium">
                            {gap}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {analysis.nextMeeting.suggestedTopics?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Suggested Topics</p>
                      <ul className="space-y-1">
                        {analysis.nextMeeting.suggestedTopics.map((topic, i) => (
                          <li key={i} className="text-sm text-gray-700 flex gap-2">
                            <span className="text-gray-400">•</span>
                            <span>{topic}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
