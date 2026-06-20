// CRM note formatting for Clumo
//
// Pure, dependency-free helpers for composing a CRM note from a session's
// analysis and appending it into the MSX opportunity comments fields. Kept
// separate from the provider so it is trivially unit-testable.

// Match MSX's stored timestamp rendering, e.g. "6/20/2026, 2:48:00 PM".
function formatModifiedOn(date = new Date()) {
  let hours = date.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}, ${hours}:${mm}:${ss} ${ampm}`;
}

// MSX stores the userId as an upper-cased, brace-wrapped GUID.
function braceGuid(id) {
  return `{${String(id || '').replace(/[{}]/g, '').toUpperCase()}}`;
}

// Build a default note body from a session analysis. The UI shows this in an
// editable preview before anything is written — never synced silently.
function composeNote(analysis) {
  if (!analysis) return '';
  const parts = [];

  const notes = Array.isArray(analysis.callNotes) ? analysis.callNotes : [];
  if (notes.length) {
    parts.push(notes.map(n => `- ${n}`).join('\n'));
  }

  const nextSteps = analysis.crmUpdate && analysis.crmUpdate.nextSteps;
  if (nextSteps) {
    parts.push(`Next steps: ${nextSteps}`);
  }

  return parts.join('\n\n').trim();
}

// Append a comment into the MSX comments structure.
// Returns the new values for both the JSON field (the UI "Comments" cards) and
// the legacy plain-text mirror, without mutating the inputs.
function appendComment({ existingJson, existingText, userId, comment, now = new Date() }) {
  let arr = [];
  if (existingJson) {
    try {
      const parsed = JSON.parse(existingJson);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      arr = [];
    }
  }

  const entry = {
    userId: braceGuid(userId),
    modifiedOn: formatModifiedOn(now),
    comment: String(comment || '')
  };
  const nextArr = [...arr, entry];
  const jsonValue = JSON.stringify(nextArr);

  const line = entry.comment;
  const textValue = existingText ? `${existingText}\n${line}` : line;

  return { jsonValue, textValue, entry };
}

module.exports = { formatModifiedOn, braceGuid, composeNote, appendComment };
