// Shared analysis module for Clumo
// Generates post-call analysis with MEDDPICC or BANT focus

const storage = require('./storage');
const db = require('./db');

const BANT_PROMPT = `You are a sales call analyst specializing in BANT methodology. Given a sales call transcript and suggestions that were surfaced, generate a comprehensive post-call analysis.

Return ONLY valid JSON with this exact structure:

{
  "sessionMeta": {
    "customer": "Company or person name (extracted from transcript)",
    "topic": "Exactly 3 words summarising the call (e.g. 'Platform demo discussion')"
  },
  "callNotes": ["bullet 1", "bullet 2", ...],
  "crmUpdate": {
    "methodology": "bant",
    "bant": {
      "B": "One-line update on Budget or 'Not discussed in this call'",
      "A": "One-line update on Authority or 'Not discussed in this call'",
      "N": "One-line update on Need or 'Not discussed in this call'",
      "T": "One-line update on Timeline or 'Not discussed in this call'"
    },
    "nextSteps": "2-3 sentences of agreed next steps and timeline"
  },
  "followUpEmail": {
    "subject": "Subject line",
    "body": "Clear, concise, action-oriented email text"
  },
  "nextMeeting": {
    "gaps": ["B", "T"],
    "suggestedTopics": ["Understand their budget constraints", "Clarify decision timeline"]
  }
}

Guidelines:
- sessionMeta: Extract customer/company name and call topic. If unclear, use "Unknown" for customer.
- callNotes: 5-8 key discussion points, objections, commitments, and decisions
- crmUpdate.bant: ALL 4 criteria shown. For discussed criteria, provide a one-line summary. For undiscussed, use "Not discussed in this call"
- followUpEmail: Written as salesperson to prospect. Lead with value, reference topics, end with next steps.
- nextMeeting.gaps: List BANT keys NOT discussed
- nextMeeting.suggestedTopics: 2-4 concrete questions for next call to fill gaps`;

const MEDDPICC_PROMPT = `You are a sales call analyst specializing in MEDDPICC methodology. Given a sales call transcript, MEDDPICC evidence tracked during the call, and suggestions that were surfaced, generate a comprehensive post-call analysis.

Return ONLY valid JSON with this exact structure:

{
  "sessionMeta": {
    "customer": "Company or person name (extracted from transcript)",
    "topic": "Exactly 3 words summarising the call (e.g. 'Platform demo discussion')"
  },
  "callNotes": ["bullet 1", "bullet 2", ...],
  "crmUpdate": {
    "methodology": "meddpicc",
    "meddpicc": {
      "M": "One-line update or 'Not discussed in this call'",
      "E": "One-line update or 'Not discussed in this call'",
      "D1": "One-line update or 'Not discussed in this call'",
      "D2": "One-line update or 'Not discussed in this call'",
      "P": "One-line update or 'Not discussed in this call'",
      "I": "One-line update or 'Not discussed in this call'",
      "C1": "One-line update or 'Not discussed in this call'",
      "C2": "One-line update or 'Not discussed in this call'"
    },
    "nextSteps": "2-3 sentences of agreed next steps and timeline"
  },
  "followUpEmail": {
    "subject": "Subject line",
    "body": "Clear, concise, action-oriented email text"
  },
  "nextMeeting": {
    "gaps": ["D2", "P", "C1"],
    "suggestedTopics": ["Understand their internal approval process", "Identify the champion", "Map the paper/legal process"]
  }
}

Guidelines:
- sessionMeta: Extract customer/company name and call topic from the transcript. If unclear, use "Unknown" for customer and summarize the main discussion topic.
- callNotes: 5-8 key discussion points, objections, commitments, and decisions made
- crmUpdate.meddpicc: ALL 8 criteria shown every time. For discussed criteria, provide a one-line summary of what was learned. For undiscussed criteria, use exactly "Not discussed in this call"
- crmUpdate.nextSteps: What was agreed as follow-up, with timeline if mentioned
- followUpEmail: Written as salesperson to prospect. Lead with value discussed, reference specific topics, end with next steps. Keep concise.
- nextMeeting.gaps: List the MEDDPICC criteria keys that were NOT discussed (those marked "Not discussed in this call")
- nextMeeting.suggestedTopics: 2-4 concrete questions or agenda items for the next call that would fill the identified gaps`;

/**
 * Generate post-call analysis for a completed session.
 * Reads methodology preference from DB. Returns the analysis object or null on failure.
 */
async function generateAnalysis(sessionId, sessionData, provider) {
  const transcriptText = (sessionData.fullTranscript || []).map(t => t.text).join(' ').trim();
  if (!transcriptText) {
    return null;
  }

  const methodology = db.getConfig('methodology') || 'meddpicc';

  const suggestionsSummary = (sessionData.suggestions || []).map(s => {
    if (s.type === 'discovery') return `Discovery: ${s.suggestion.question}`;
    if (s.type === 'case_study') return `Case Study: ${s.suggestion.company} - ${s.suggestion.headline}`;
    if (s.type === 'proof_point') return `Proof Point: ${s.suggestion.stat}`;
    if (s.type === 'product_truth') return `Product Truth: ${s.suggestion.fact}`;
    return '';
  }).filter(Boolean).join('\n');

  let methodologyContext = '';
  if (sessionData.meddpicc) {
    const label = methodology === 'bant' ? 'BANT' : 'MEDDPICC';
    methodologyContext = `\n${label} EVIDENCE FROM LIVE TRACKING:\n`;
    for (const [key, data] of Object.entries(sessionData.meddpicc)) {
      if (data.status !== 'none' && data.evidence && data.evidence.length > 0) {
        methodologyContext += `${key} (${data.label}): ${data.status} - ${data.evidence.join('; ')}\n`;
      }
    }
  }

  const systemPrompt = methodology === 'bant' ? BANT_PROMPT : MEDDPICC_PROMPT;

  const response = await provider.chatCompletion([
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `CALL TRANSCRIPT:\n"${transcriptText.slice(-8000)}"\n\n${methodologyContext}${suggestionsSummary ? `\nSUGGESTIONS SURFACED:\n${suggestionsSummary}\n\n` : ''}Generate the post-call analysis.`
    }
  ], { temperature: 0.3, max_tokens: 2500 });

  let content = response.choices[0].message.content.trim();
  if (content.startsWith('```')) {
    content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  let analysis;
  try {
    analysis = JSON.parse(content);
  } catch (parseErr) {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      analysis = JSON.parse(jsonMatch[0]);
    } else {
      throw parseErr;
    }
  }

  return analysis;
}

/**
 * Format a session name from analysis meta data.
 * Produces "{3-word summary} dd/mm" (e.g. "Legora platform demo 06/06").
 * Returns null only if no topic can be extracted at all.
 */
function formatSessionName(analysis, sessionStartTime) {
  try {
    const meta = analysis && analysis.sessionMeta;
    if (!meta) return null;

    const rawTopic = (meta.topic || '').trim();
    const customer = (meta.customer || '').trim();

    // Prefer a topic-based summary; fall back to customer if topic is empty
    let summary = rawTopic || customer;
    if (!summary || summary.toLowerCase() === 'unknown') return null;

    // Constrain to exactly 3 words
    const words = summary.split(/\s+/).filter(Boolean).slice(0, 3);
    if (words.length === 0) return null;
    summary = words.join(' ');

    const date = new Date(sessionStartTime);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');

    return `${summary} ${dd}/${mm}`;
  } catch {
    return null;
  }
}

function formatDefaultSessionName(sessionStartTime) {
  const date = new Date(sessionStartTime || Date.now());
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `Live sales call ${dd}/${mm}`;
}

module.exports = { generateAnalysis, formatSessionName, formatDefaultSessionName };
