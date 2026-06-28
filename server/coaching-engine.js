// Coaching Engine for Clumo (experimental / flag-gated).
//
// Runs alongside the knowledge SuggestionEngine. Where the suggestion engine
// retrieves curated knowledge, the coaching engine generates judgment: the
// killer-instinct question, the reframe, the pivot, at the right moment. It is
// "a world-class SE / AE / negotiator in the call with you".
//
// Design (co-designed in plan.md):
//  - Single expert coach per moment, routed to one persona. No parallel panel.
//  - Stateful: a bounded coachingState revised in place (flat token cost).
//  - Two-tier: a cheap heuristic moment-gate decides "coachable?" before any
//    rich LLM call fires. Strategic pass runs on a slower cadence.
//  - Shared "what's missing" brain feeds both live strategic nudges and the
//    MEDDPICC killer-question tooltips, so they never contradict.
//  - v1 display-only: one nudge at a time, no accept/dismiss learning.

const { PERSONAS, getPersona, MOVES } = require('./coaching-personas');

// --- Tunable constants --------------------------------------------------------
const COACH_COOLDOWN_MS = 18000;         // min gap between any two coaching nudges
const COACH_CONFIDENCE_THRESHOLD = 0.7;  // confidence required to surface a nudge
const MIN_UTTERANCE_WORDS = 4;           // ignore tiny utterances
const STRATEGIC_WORD_INTERVAL = 180;     // run strategic pass roughly every N words
const MOVES_GIVEN_CAP = 8;               // de-dup memory of recent nudges
const STATE_LIST_CAP = 5;                // cap on facts / threads / risks

const MEDDPICC_KEYS = ['M', 'E', 'D1', 'D2', 'P', 'I', 'C1', 'C2'];

// Heuristic moment-gate. Cheap (no LLM): scans the utterance for persona triggers
// and a few generic objection/buying-signal cues. Returns the routed persona and
// a coarse moment type, or null when nothing looks coachable. Rich generation
// only runs when this returns non-null, and the rich call can still decline.
function detectMoment(utterance) {
  const text = (utterance || '').toLowerCase();
  if (!text.trim()) return null;

  // Score each persona by how many of its trigger phrases appear.
  let best = null;
  for (const persona of PERSONAS) {
    let hits = 0;
    let matched = '';
    for (const trig of persona.triggers) {
      if (text.includes(trig)) {
        hits++;
        if (!matched) matched = trig.trim();
      }
    }
    if (hits > 0 && (!best || hits > best.hits)) {
      best = { personaId: persona.id, hits, matched };
    }
  }

  if (!best) return null;
  return { coachable: true, personaId: best.personaId, cue: best.matched };
}

class CoachingEngine {
  constructor(provider) {
    // provider exposes chatCompletion(messages, options) and injects the model
    // for Azure / OpenAI / managed alike (BYOK + managed safe).
    this.provider = provider;

    this.lastCoachAt = 0;
    this.strategicWordCount = 0;
    this.isGenerating = false;
    this.isStrategizing = false;

    // Bounded coaching state, revised in place by the strategic pass.
    this.coachingState = {
      objective: '',
      stage: 'discovery', // discovery | demo | objection | closing | smalltalk
      establishedFacts: [],
      openThreads: [],
      risks: [],
      movesGiven: [] // { type, headline, at } — de-dup only, no rep feedback in v1
    };

    // Latest per-criterion killer questions from the shared gap brain.
    this.meddpiccQuestions = {};
  }

  // Accumulate words and report whether a strategic pass is due.
  noteWords(text) {
    this.strategicWordCount += (text || '').split(/\s+/).filter(Boolean).length;
    if (this.strategicWordCount >= STRATEGIC_WORD_INTERVAL && !this.isStrategizing) {
      this.strategicWordCount = 0;
      return true;
    }
    return false;
  }

  _onCooldown() {
    return Date.now() - this.lastCoachAt < COACH_COOLDOWN_MS;
  }

  _recordMove(nudge) {
    this.lastCoachAt = Date.now();
    this.coachingState.movesGiven.push({
      type: nudge.type,
      headline: nudge.headline,
      at: new Date().toISOString()
    });
    if (this.coachingState.movesGiven.length > MOVES_GIVEN_CAP) {
      this.coachingState.movesGiven = this.coachingState.movesGiven.slice(-MOVES_GIVEN_CAP);
    }
  }

  _recentHeadlines() {
    return this.coachingState.movesGiven.map(m => `- ${m.headline}`).join('\n') || '(none yet)';
  }

  _stateSummary() {
    const s = this.coachingState;
    const parts = [];
    if (s.objective) parts.push(`Objective: ${s.objective}`);
    parts.push(`Stage: ${s.stage}`);
    if (s.establishedFacts.length) parts.push(`Established: ${s.establishedFacts.join('; ')}`);
    if (s.openThreads.length) parts.push(`Open threads: ${s.openThreads.join('; ')}`);
    if (s.risks.length) parts.push(`Risks: ${s.risks.join('; ')}`);
    return parts.join('\n');
  }

  _briefSummary(callBrief, meddpicc) {
    const b = callBrief || {};
    const parts = [];
    if (b.industry) parts.push(`Industry: ${b.industry}`);
    if (b.pains && b.pains.length) parts.push(`Pains: ${b.pains.join('; ')}`);
    if (b.goals && b.goals.length) parts.push(`Goals: ${b.goals.join('; ')}`);
    if (b.requirements && b.requirements.length) parts.push(`Requirements: ${b.requirements.join('; ')}`);
    if (b.competitors && b.competitors.length) parts.push(`Competitors: ${b.competitors.join('; ')}`);
    const md = MEDDPICC_KEYS
      .map(k => meddpicc && meddpicc[k] ? `${meddpicc[k].label}=${meddpicc[k].status}` : null)
      .filter(Boolean);
    if (md.length) parts.push(`MEDDPICC: ${md.join(', ')}`);
    return parts.join('\n') || '(nothing established yet)';
  }

  // --- Reactive path: one finalized utterance -> at most one nudge ------------
  async evaluate(utterance, context = {}) {
    const words = (utterance || '').split(/\s+/).filter(Boolean);
    if (words.length < MIN_UTTERANCE_WORDS) return null;
    if (this._onCooldown() || this.isGenerating) return null;

    const moment = detectMoment(utterance);
    if (!moment || !moment.coachable) return null;

    this.isGenerating = true;
    try {
      const nudge = await this._generateMove(moment, utterance, context);
      if (!nudge) return null;
      if (!nudge.coach || (nudge.confidence || 0) < COACH_CONFIDENCE_THRESHOLD) return null;
      if (this._onCooldown()) return null; // a strategic nudge may have fired meanwhile
      this._recordMove(nudge);
      return nudge;
    } catch (err) {
      console.error('[Coaching] evaluate error:', err.message);
      return null;
    } finally {
      this.isGenerating = false;
    }
  }

  async _generateMove(moment, utterance, context) {
    const persona = getPersona(moment.personaId);
    const moveList = persona.moves.map(m => `${m}: ${MOVES[m]}`).join('\n');
    const recentTurns = (context.turns || []).slice(-6).map(t => t.text).join('\n');

    const system = `${persona.systemPrompt}

You speak rarely but with high precision. A great coach nudges 2-3 times per 30-minute call. Stay silent unless the rep would clearly benefit RIGHT NOW.

Choose exactly one move from your set:
${moveList}

Return ONLY valid JSON:
{"coach": true|false, "confidence": 0.0-1.0, "move": "<one move name>", "headline": "imperative, max 8 words", "why": "one short line", "say": "optional exact words the rep can use, else empty string"}

Set coach=false (confidence 0) for small talk, when the rep is already handling it well, when a topic was only mentioned in passing, or when you are not highly confident. Never repeat a nudge already given.`;

    const user = `CALL STATE:
${this._stateSummary()}

CALL BRIEF:
${this._briefSummary(context.callBrief, context.meddpicc)}

RECENT CONVERSATION:
${recentTurns}

CUSTOMER JUST SAID:
"${utterance}"

NUDGES ALREADY GIVEN (do not repeat):
${this._recentHeadlines()}

Decide whether to coach the salesperson right now.`;

    const parsed = await this._chatJSON(system, user, 160);
    if (!parsed) return null;
    return {
      coach: parsed.coach === true,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      headline: (parsed.headline || '').trim(),
      why: (parsed.why || '').trim(),
      say: (parsed.say || '').trim() || null,
      type: persona.moves.includes(parsed.move) ? parsed.move : persona.moves[0],
      persona: persona.id,
      personaLabel: persona.label,
      urgency: 'now',
      triggeredAt: Date.now()
    };
  }

  // --- Strategic path: shared "what's missing" brain (AE-voiced) --------------
  // One call that (a) refreshes coachingState, (b) produces per-criterion killer
  // questions for the MEDDPICC tooltips, and (c) returns the single highest
  // priority strategic nudge (or none). Feeds both the live nudge and tooltips.
  async strategic(context = {}) {
    if (this.isStrategizing) return null;
    this.isStrategizing = true;
    try {
      const ae = getPersona('ae');
      const system = `${ae.systemPrompt}

You are running a strategic check on a live sales call. Look at what has and has NOT been established, and decide the single most valuable strategic move right now (a pivot, a gap to fill, a stakeholder to reach). Also produce 2-3 sharp "killer questions" the rep could ask to fill each MEDDPICC criterion that is not yet confirmed.

Return ONLY valid JSON:
{
  "state": {
    "objective": "short inferred objective or empty",
    "stage": "discovery|demo|objection|closing|smalltalk",
    "establishedFacts": ["short fact", ...],
    "openThreads": ["unresolved item", ...],
    "risks": ["deal risk", ...]
  },
  "questions": { "M": ["q","q"], "E": [...], "D1": [...], "D2": [...], "P": [...], "I": [...], "C1": [...], "C2": [...] },
  "nudge": { "coach": true|false, "confidence": 0.0-1.0, "move": "MultiThread|Advance|NextStep|Dig|Sharpen", "headline": "imperative, max 8 words", "why": "one short line", "say": "optional words or empty" }
}

Only include "questions" entries for criteria NOT already confirmed. Keep every array to at most 3 short items. Set nudge.coach=false unless there is a genuinely high-value strategic move the rep is missing right now. Do not repeat nudges already given.`;

      const user = `CALL STATE:
${this._stateSummary()}

CALL BRIEF:
${this._briefSummary(context.callBrief, context.meddpicc)}

RECENT CONVERSATION:
${(context.turns || []).slice(-8).map(t => t.text).join('\n')}

NUDGES ALREADY GIVEN (do not repeat):
${this._recentHeadlines()}

MEDDPICC criteria definitions: M=Metrics, E=Economic Buyer, D1=Decision Criteria, D2=Decision Process, P=Paper Process, I=Identified Pain, C1=Champion, C2=Competition.`;

      const parsed = await this._chatJSON(system, user, 600);
      if (!parsed) return null;

      // (a) Refresh bounded state in place.
      if (parsed.state && typeof parsed.state === 'object') {
        const st = parsed.state;
        const cap = (arr) => Array.isArray(arr)
          ? arr.filter(x => typeof x === 'string' && x.trim()).slice(0, STATE_LIST_CAP)
          : [];
        this.coachingState.objective = typeof st.objective === 'string' && st.objective.trim()
          ? st.objective.trim() : this.coachingState.objective;
        if (typeof st.stage === 'string' && st.stage.trim()) this.coachingState.stage = st.stage.trim();
        this.coachingState.establishedFacts = cap(st.establishedFacts);
        this.coachingState.openThreads = cap(st.openThreads);
        this.coachingState.risks = cap(st.risks);
      }

      // (b) Cache per-criterion killer questions for the tooltips.
      if (parsed.questions && typeof parsed.questions === 'object') {
        const q = {};
        for (const k of MEDDPICC_KEYS) {
          if (Array.isArray(parsed.questions[k])) {
            const items = parsed.questions[k].filter(x => typeof x === 'string' && x.trim()).slice(0, 3);
            if (items.length) q[k] = items;
          }
        }
        this.meddpiccQuestions = q;
      }

      // (c) Optional strategic nudge, gated like the reactive path.
      let nudge = null;
      const n = parsed.nudge;
      if (n && n.coach === true && (n.confidence || 0) >= COACH_CONFIDENCE_THRESHOLD
          && !this._onCooldown()) {
        const move = ['MultiThread', 'Advance', 'NextStep', 'Dig', 'Sharpen'].includes(n.move)
          ? n.move : 'NextStep';
        nudge = {
          coach: true,
          confidence: n.confidence,
          headline: (n.headline || '').trim(),
          why: (n.why || '').trim(),
          say: (n.say || '').trim() || null,
          type: move,
          persona: ae.id,
          personaLabel: ae.label,
          urgency: 'soon',
          triggeredAt: Date.now()
        };
        if (nudge.headline) this._recordMove(nudge);
        else nudge = null;
      }

      return { questions: this.meddpiccQuestions, nudge };
    } catch (err) {
      console.error('[Coaching] strategic error:', err.message);
      return null;
    } finally {
      this.isStrategizing = false;
    }
  }

  async _chatJSON(system, user, maxTokens) {
    const response = await this.provider.chatCompletion(
      [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      { temperature: 0.3, max_tokens: maxTokens, response_format: { type: 'json_object' } }
    );
    let content = (response.choices?.[0]?.message?.content || '').trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    try {
      return JSON.parse(content);
    } catch (e) {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        try { return JSON.parse(m[0]); } catch (_) { /* fall through */ }
      }
      console.error('[Coaching] Failed to parse JSON:', content.slice(0, 120));
      return null;
    }
  }

  // Final coaching data for the post-call session record.
  getSessionData() {
    return {
      coachingState: this.coachingState,
      meddpiccQuestions: this.meddpiccQuestions
    };
  }
}

module.exports = CoachingEngine;
module.exports.detectMoment = detectMoment;
module.exports.CoachingEngine = CoachingEngine;
