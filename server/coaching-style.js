// Coaching style for Clumo — the rep's "how I want to be coached" preferences.
//
// Where the playbook (playbook.js) captures WHAT the rep sells (product, market,
// competitors), the coaching style captures HOW the rep wants the coach to behave:
// tone, assertiveness, phrasing rules, and hard "never say" lines. It is a single
// bounded free-text field the rep edits, injected as a clearly-marked block into
// the SLOW (strategic) coaching lane only. It is append-only context — it can never
// delete core prompt logic or the JSON output contract the slow lane depends on.
//
// Design notes:
//  - Rendering is pure and deterministic (no LLM) so it is fast, testable, and the
//    rep sees exactly what will be injected via the live preview.
//  - Bounded length so a hand-edited style can never bloat the coaching prompt.
//  - renderCoachingStyle() returns '' when empty, so an unset style costs nothing
//    and never pads the prompt with blanks.

const MAX_STYLE = 1500; // hard ceiling on the coaching-style free text

// The default coaching style, used until the rep saves their own (or explicitly
// clears it). Applied server-side so the UI prefill, the live preview, and live
// coaching all agree.
const DEFAULT_STYLE = 'The coach is consultative and value lead in conversations. It strikes a balance between empathy and the ability to constructively challenge the customer where required. It communicates in a concise, executive tone.';

// Normalise incoming coaching-style text: coerce to string, trim, and cap length.
function normalizeStyle(input) {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, MAX_STYLE);
}

// Resolve the effective style from a raw stored value. A null/undefined value means
// "never set" -> fall back to the default. An empty string means the rep explicitly
// cleared it -> honour that (no default).
function resolveStyle(raw) {
  if (raw === null || raw === undefined) return DEFAULT_STYLE;
  return normalizeStyle(raw);
}

// Render the coaching style as a compact, clearly-marked prompt block for the slow
// lane. Returns '' when there is nothing useful to add.
function renderCoachingStyle(style) {
  const text = normalizeStyle(style);
  if (!text) return '';
  return `REP'S COACHING PREFERENCES — how THIS rep wants to be coached (tone, style, phrasing, and hard rules). Honour these unless they conflict with honesty or would coach a manipulative move:
${text}`;
}

module.exports = { MAX_STYLE, DEFAULT_STYLE, normalizeStyle, resolveStyle, renderCoachingStyle };
