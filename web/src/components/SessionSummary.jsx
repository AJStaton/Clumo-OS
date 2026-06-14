import { useState } from 'react';
import { Link } from 'react-router-dom';
import MeddpiccTracker from './MeddpiccTracker';

function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}

function formatCrmText(crmUpdate, methodologyLabel) {
  const fields = crmUpdate.meddpicc || crmUpdate.bant || {};
  let text = `${methodologyLabel} Update\n\n`;
  for (const [key, value] of Object.entries(fields)) {
    text += `${key}: ${value}\n`;
  }
  if (crmUpdate.nextSteps) {
    text += `\nNext Steps: ${crmUpdate.nextSteps}`;
  }
  return text;
}

function formatFollowUpText(followUpEmail) {
  return `Subject: ${followUpEmail.subject}\n\n${followUpEmail.body}`;
}

export default function SessionSummary({ session, analysis, badge, onAnalyze, analyzing }) {
  const methodology = analysis?.crmUpdate?.methodology || 'meddpicc';
  const methodologyLabel = methodology === 'bant' ? 'BANT' : 'MEDDPICC';
  const crmFields = analysis?.crmUpdate?.meddpicc || analysis?.crmUpdate?.bant;

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/session" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">&larr; Back</Link>
          <div className="flex items-center gap-2 mt-1">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{session.name || 'Unnamed session'}</h1>
            {badge && (
              <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] font-medium rounded-full">{badge}</span>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {session.startTime && new Date(session.startTime).toLocaleString()} ({session.totalSuggestions || 0} suggestions)
          </p>
        </div>
        {onAnalyze && session.status === 'completed' && !analysis && (
          <button
            onClick={onAnalyze}
            disabled={analyzing}
            className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
          >
            {analyzing ? 'Analyzing...' : 'Generate Analysis'}
          </button>
        )}
      </div>

      <div className="space-y-6">
        {/* Row 1: MEDDPICC + Session Notes side-by-side */}
        <div className="grid grid-cols-3 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <MeddpiccTracker meddpicc={session.meddpicc} methodology={methodology} />
          </div>

          {analysis?.callNotes?.length > 0 && (
            <div className="col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Session Notes</h2>
                <CopyButton text={analysis.callNotes.join('\n')} label="Copy" />
              </div>
              <ul className="p-4 space-y-2">
                {analysis.callNotes.map((note, i) => (
                  <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex gap-2">
                    <span className="text-gray-400 dark:text-gray-500">-</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Suggestions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Suggestions ({(session.suggestions || []).length})
            </h2>
          </div>
          <div className="p-4">
            {(session.suggestions || []).length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 text-sm">No suggestions were surfaced</p>
            ) : (
              <div className="space-y-2">
                {(session.suggestions || []).map((s, i) => {
                  const ts = s.suggestion?.triggeredAt || s.timestamp;
                  const trigger = s.suggestion?.trigger || s.trigger;
                  const triggerTip = trigger ? `Trigger: "${trigger}"` : undefined;
                  return (
                  <div key={i} className="text-sm p-3 bg-gray-50 dark:bg-gray-700 rounded-md" title={triggerTip}>
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {s.type === 'case_study' && `Case Study: ${s.suggestion?.company}${s.suggestion?.headline ? `, ${s.suggestion.headline}` : ''}`}
                      {s.type === 'discovery' && `Discovery: ${s.suggestion?.question}`}
                      {s.type === 'proof_point' && `Proof Point: ${s.suggestion?.stat}`}
                      {s.type === 'product_truth' && `Product Truth: ${s.suggestion?.fact}`}
                    </span>
                    {ts && (
                      <span className="text-gray-400 dark:text-gray-500 text-xs ml-2">
                        {new Date(ts).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Analysis sections */}
        {analysis && (
          <>
            {/* CRM Update */}
            {analysis.crmUpdate && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    CRM Update: {methodologyLabel}
                  </h2>
                  <CopyButton text={formatCrmText(analysis.crmUpdate, methodologyLabel)} label="Copy" />
                </div>
                <div className="p-4">
                  {crmFields ? (
                    <div className="space-y-2">
                      {Object.entries(crmFields).map(([key, value]) => (
                        <div key={key} className="flex gap-3 text-sm">
                          <span className="font-mono font-semibold text-gray-900 dark:text-gray-100 w-8 shrink-0">{key}</span>
                          <span className={value === 'Not discussed in this call' ? 'text-gray-400 dark:text-gray-500 italic' : 'text-gray-700 dark:text-gray-300'}>
                            {value}
                          </span>
                        </div>
                      ))}
                      {analysis.crmUpdate.nextSteps && (
                        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Next Steps</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{analysis.crmUpdate.nextSteps}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans">
                      {typeof analysis.crmUpdate === 'string' ? analysis.crmUpdate : JSON.stringify(analysis.crmUpdate, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )}

            {/* Next Meeting Prep */}
            {analysis.nextMeeting && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Next Meeting Prep</h2>
                </div>
                <div className="p-4 space-y-3">
                  {(analysis.nextMeeting.gaps || analysis.nextMeeting.meddpiccGaps)?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Gaps to Address</p>
                      <div className="flex gap-2 flex-wrap">
                        {(analysis.nextMeeting.gaps || analysis.nextMeeting.meddpiccGaps).map(gap => (
                          <span key={gap} className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 rounded text-xs font-mono font-medium">
                            {gap}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {analysis.nextMeeting.suggestedTopics?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Suggested Topics</p>
                      <ul className="space-y-1">
                        {analysis.nextMeeting.suggestedTopics.map((topic, i) => (
                          <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex gap-2">
                            <span className="text-gray-400 dark:text-gray-500">•</span>
                            <span>{topic}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Follow-up Email */}
            {analysis.followUpEmail && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Follow-up</h2>
                  <CopyButton text={formatFollowUpText(analysis.followUpEmail)} label="Copy" />
                </div>
                <div className="p-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Subject: {analysis.followUpEmail.subject}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                    {analysis.followUpEmail.body}
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Transcript — at the bottom */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Transcript</h2>
          </div>
          <div className="p-4 max-h-96 overflow-y-auto space-y-2">
            {(session.fullTranscript || []).map((entry, i) => (
              <div key={i} className="text-sm">
                <span className="text-gray-400 dark:text-gray-500 text-xs mr-2">
                  {entry.timestamp && new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span className="text-gray-700 dark:text-gray-300">{entry.text}</span>
              </div>
            ))}
            {(!session.fullTranscript || session.fullTranscript.length === 0) && (
              <p className="text-gray-400 dark:text-gray-500 text-sm">No transcript data</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
