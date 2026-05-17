// Shared analysis module for Clumo
// Generates post-call analysis with MEDDPICC focus

const storage = require('./storage');

/**
 * Generate post-call analysis for a completed session.
 * Returns the analysis object or null on failure.
 */
async function generateAnalysis(sessionId, sessionData, provider) {
  const transcriptText = (sessionData.fullTranscript || []).map(t => t.text).join(' ').trim();
  if (!transcriptText) {
    return null;
  }

  const suggestionsSummary = (sessionData.suggestions || []).map(s => {
    if (s.type === 'discovery') return `Discovery: ${s.suggestion.question}`;
    if (s.type === 'case_study') return `Case Study: ${s.suggestion.company} - ${s.suggestion.headline}`;
    if (s.type === 'proof_point') return `Proof Point: ${s.suggestion.stat}`;
    if (s.type === 'product_truth') return `Product Truth: ${s.suggestion.fact}`;
    return '';
  }).filter(Boolean).join('\n');

  // Build MEDDPICC evidence from live tracking
  let meddpiccContext = '';
  if (sessionData.meddpicc) {
    meddpiccContext = '\nMEDDPICC EVIDENCE FROM LIVE TRACKING:\n';
    for (const [key, data] of Object.entries(sessionData.meddpicc)) {
      if (data.status !== 'none' && data.evidence && data.evidence.length > 0) {
        meddpiccContext += `${key} (${data.label}): ${data.status} - ${data.evidence.join('; ')}\n`;
      }
    }
  }

  const response = await provider.chatCompletion([
    {
      role: 'system',
      content: `You are a sales call analyst specializing in MEDDPICC methodology. Given a sales call transcript, MEDDPICC evidence tracked during the call, and suggestions that were surfaced, generate a comprehensive post-call analysis.

Return ONLY valid JSON with this exact structure:

{
  "sessionMeta": {
    "customer": "Company or person name (extracted from transcript)",
    "topic": "Brief topic summary (3-5 words)"
  },
  "callNotes": ["bullet 1", "bullet 2", ...],
  "crmUpdate": {
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
    "meddpiccGaps": ["D2", "P", "C1"],
    "suggestedTopics": ["Understand their internal approval process", "Identify the champion", "Map the paper/legal process"]
  }
}

Guidelines:
- sessionMeta: Extract customer/company name and call topic from the transcript. If unclear, use "Unknown" for customer and summarize the main discussion topic.
- callNotes: 5-8 key discussion points, objections, commitments, and decisions made
- crmUpdate.meddpicc: ALL 8 criteria shown every time. For discussed criteria, provide a one-line summary of what was learned. For undiscussed criteria, use exactly "Not discussed in this call"
- crmUpdate.nextSteps: What was agreed as follow-up, with timeline if mentioned
- followUpEmail: Written as salesperson to prospect. Lead with value discussed, reference specific topics, end with next steps. Keep concise.
- nextMeeting.meddpiccGaps: List the MEDDPICC criteria keys that were NOT discussed (those marked "Not discussed in this call")
- nextMeeting.suggestedTopics: 2-4 concrete questions or agenda items for the next call that would fill the identified gaps`
    },
    {
      role: 'user',
      content: `CALL TRANSCRIPT:\n"${transcriptText.slice(-8000)}"\n\n${meddpiccContext}${suggestionsSummary ? `\nSUGGESTIONS SURFACED:\n${suggestionsSummary}\n\n` : ''}Generate the post-call analysis.`
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
 * Returns formatted name like "Acme Corp - Platform Demo - 14:30 - 17th May"
 * or null if extraction fails.
 */
function formatSessionName(analysis, sessionStartTime) {
  try {
    const meta = analysis.sessionMeta;
    if (!meta || !meta.customer || meta.customer === 'Unknown') return null;

    const customer = meta.customer;
    const topic = meta.topic || 'Call';

    const date = new Date(sessionStartTime);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const time = `${hours}:${minutes}`;

    const day = date.getDate();
    const suffix = getDaySuffix(day);
    const month = date.toLocaleString('en-US', { month: 'long' });

    return `${customer} - ${topic} - ${time} - ${day}${suffix} ${month}`;
  } catch (e) {
    return null;
  }
}

function getDaySuffix(day) {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

module.exports = { generateAnalysis, formatSessionName };
