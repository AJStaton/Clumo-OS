// Coaching Engine for Clumo (experimental / flag-gated).
//
// Coaching is the STRATEGIC brain of the call. Where the knowledge SuggestionEngine
// reacts on every utterance with retrieved facts, the coach speaks rarely and with
// intent: the right question or directional steer at the right moment, grounded in
// the call state, the rep's goals, and MEDDPICC gaps.
//
// Design (strategic-only, two-lane, co-designed in plan.md):
//  - HOT lane — nudge(): ONE lean LLM call (output: just the nudge) that decides
//    the single most valuable coaching move right now (or stays silent) and adopts
//    the most relevant LENS (Solution Engineer / Account Executive / Closer).
//    Lean output keeps it ~2s, so it feels timely. Runs on a word-count CADENCE,
//    or EARLY when a rare high-signal "key moment" (detectMoment) fires — the
//    moment only decides TIMING, never the advice.
//  - SLOW lane — refresh(): ONE heavier LLM call (output: call state + per-criterion
//    MEDDPICC killer questions) that runs OFF the hot path on a slow cadence
//    (~3 min). This context moves slowly and only needs to be fresh, not instant;
//    the ~8s cost stays away from the live nudge. Key moments never trigger it.
//  - Stateful: a bounded coachingState revised in place by the slow lane and read
//    by the hot lane (flat token cost).
//  - v1 display-only: one nudge at a time, no accept/dismiss learning.

const { PERSONAS, getPersona, MOVES } = require('./coaching-personas');
const { renderPlaybook } = require('./playbook');

// --- Tunable constants --------------------------------------------------------
// --- Hot lane (nudge) ---------------------------------------------------------
const NUDGE_WORD_INTERVAL = 150;         // cadence floor: consider a nudge every N words
const NUDGE_COOLDOWN_MS = 15000;         // min gap between nudge calls (bounds cost + spam)
const NUDGE_MAX_TOKENS = 220;            // lean output -> ~2s call
// --- Slow lane (state + MEDDPICC questions) -----------------------------------
const REFRESH_INTERVAL_MS = 3 * 60 * 1000; // refresh call state + tooltip questions every 3 min
const REFRESH_FIRST_MIN_WORDS = 40;        // but seed the first refresh after a little conversation
const REFRESH_MAX_TOKENS = 700;            // heavy output -> ~8s call (kept off the hot path)
// --- Shared -------------------------------------------------------------------
const COACH_CONFIDENCE_THRESHOLD = 0.7;  // confidence required to surface a nudge
const MOVES_GIVEN_CAP = 8;               // de-dup memory of recent nudges
const STATE_LIST_CAP = 5;                // cap on facts / threads / risks
const COACH_CONTEXT_MS = 5 * 60 * 1000;  // conversation window fed to the coach (5 min)
const COACH_CONTEXT_WORD_CAP = 900;      // hard ceiling on that window (bounds tokens)

const MEDDPICC_KEYS = ['M', 'E', 'D1', 'D2', 'P', 'I', 'C1', 'C2'];
const MOVE_NAMES = Object.keys(MOVES);

// High-signal "key moments". Deliberately small and rare — these are the lines
// where a world-class coach leans in. A match does NOT dictate the advice; it only
// tells the strategic brain to run NOW (instead of waiting for the cadence) and
// pressure-test the approach, passing the detected cue as a hint. Kept tiny on
// purpose so it fires rarely and feels timely rather than noisy. A few synonyms
// per category broaden recall without bloating the list.
const KEY_MOMENTS = [
  { category: 'competitor',    hint: 'se',     phrases: ['competitor', 'alternative', 'incumbent', 'another vendor', 'already using'] },
  // Technical moments — these are where the Solution Engineer lens leans in.
  { category: 'integration',   hint: 'se',     phrases: ['integration', 'integrate', 'api', 'apis', 'webhook', 'connect to', 'sdk'] },
  { category: 'security',      hint: 'se',     phrases: ['security', 'secure', 'encryption', 'compliance', 'compliant', 'soc 2', 'soc2', 'iso 27001', 'gdpr', 'hipaa', 'penetration test', 'data residency', 'sso', 'saml', 'audit'] },
  { category: 'architecture',  hint: 'se',     phrases: ['architecture', 'infrastructure', 'deployment', 'on-prem', 'on prem', 'on-premise', 'cloud', 'self-hosted', 'self hosted', 'tenant', 'multi-tenant'] },
  { category: 'scalability',   hint: 'se',     phrases: ['scale', 'scalability', 'scalable', 'throughput', 'latency', 'performance', 'load', 'concurrent', 'uptime', 'sla', 'availability'] },
  { category: 'data',          hint: 'se',     phrases: ['data model', 'data migration', 'migrate', 'migration', 'schema', 'data pipeline', 'etl', 'export', 'import'] },
  { category: 'technical_risk',hint: 'se',     phrases: ['does it support', 'can it handle', 'is it possible to', 'how does it work', 'under the hood', 'technically', 'limitation', 'edge case'] },
  { category: 'goals',         hint: 'ae',     phrases: ['our goal', 'objective', 'the outcome', 'top priority', 'trying to achieve'] },
  { category: 'process',       hint: 'ae',     phrases: ['decision process', 'approval', 'procurement', 'sign-off', 'sign off'] },
  { category: 'budget',        hint: 'ae',     phrases: ['budget', 'funding', 'allocated', 'set aside', 'money for'] },
  { category: 'impact',        hint: 'ae',     phrases: ['impact', 'costing us', 'affecting', 'consequence', 'knock-on'] },
  { category: 'expensive',     hint: 'closer', phrases: ['expensive', 'too much', 'pricey', 'costly', 'out of our range'] },
  { category: 'disappointing', hint: 'closer', phrases: ['disappointing', 'frustrating', 'let down', 'underwhelming', 'not happy'] },
  { category: 'timeline',      hint: 'ae',     phrases: ['timeline', 'deadline', 'go live', 'timeframe', 'by when'] }
];

// Word-boundary-aware phrase match (avoids 'api' -> "therapist" style false hits).
function phraseHit(text, phrase) {
  const p = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${p}([^a-z0-9]|$)`, 'i').test(text);
}

// Format a millisecond age as a "-m:ss" relative timestamp (how long ago it was said).
function fmtAgo(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `-${m}:${ss}`;
}

// Tiny, rare, high-signal moment gate. Returns the first (highest-priority) key
// moment found, or null. Used only to decide whether to run the strategic pass
// early — not what it says.
function detectMoment(utterance) {
  const text = (utterance || '').toLowerCase();
  if (!text.trim()) return null;
  for (const m of KEY_MOMENTS) {
    for (const phrase of m.phrases) {
      if (phraseHit(text, phrase)) {
        return { coachable: true, category: m.category, cue: phrase, personaHint: m.hint };
      }
    }
  }
  return null;
}

class CoachingEngine {
  constructor(provider) {
    // provider exposes chatCompletion(messages, options) and injects the model
    // for Azure / OpenAI (BYOK).
    this.provider = provider;

    this.lastNudgeAt = 0;       // last hot nudge call (cooldown anchor)
    this.nudgeWordCount = 0;    // words accrued toward the nudge cadence
    this.isNudging = false;     // hot-lane re-entry guard
    this.lastRefreshAt = 0;     // last slow state/questions refresh
    this.isRefreshing = false;  // slow-lane re-entry guard

    // Rolling, timestamped transcript window (last COACH_CONTEXT_MS, word-capped).
    // This is the coach's "recent arc" — independent of the 12-turn Knowledge
    // window — and is pruned by both time and word budget so it stays bounded.
    this.transcriptWindow = []; // { text, at }

    // Bounded coaching state, revised in place by the strategic pass.
    this.coachingState = {
      objective: '',
      stage: 'discovery', // discovery | demo | objection | closing | smalltalk
      establishedFacts: [],
      openThreads: [],
      risks: [],
      movesGiven: [] // { type, headline, at } — de-dup only, no rep feedback in v1
    };

    // Latest per-criterion killer questions from the strategic pass.
    this.meddpiccQuestions = {};
  }

  _wordCount(t) {
    return (t || '').split(/\s+/).filter(Boolean).length;
  }

  // Append an utterance to the rolling window and prune by time then word budget.
  _appendToWindow(text, now, speaker = null) {
    const clean = (text || '').trim();
    if (clean) this.transcriptWindow.push({ text: clean, at: now, speaker: speaker || undefined });
    const cutoff = now - COACH_CONTEXT_MS;
    this.transcriptWindow = this.transcriptWindow.filter(e => e.at >= cutoff);
    let total = this.transcriptWindow.reduce((n, e) => n + this._wordCount(e.text), 0);
    while (total > COACH_CONTEXT_WORD_CAP && this.transcriptWindow.length > 1) {
      total -= this._wordCount(this.transcriptWindow.shift().text);
    }
  }

  // Render the window as timestamped lines, e.g. "[-2:18] You: ...", newest last.
  _renderConversation(now = Date.now()) {
    if (!this.transcriptWindow.length) return '(no recent conversation yet)';
    return this.transcriptWindow
      .map(e => {
        const who = e.speaker === 'you' ? 'You: ' : e.speaker === 'customer' ? 'Customer: ' : '';
        return `[${fmtAgo(now - e.at)}] ${who}${e.text}`;
      })
      .join('\n');
  }

  // Hot-lane gate. Appends the utterance to the rolling window, then decides
  // whether to make a nudge call now: on a word-count CADENCE, or EARLY when a
  // rare key moment is detected — never more often than the cooldown allows
  // (bounds LLM cost). Returns a trigger descriptor or null.
  maybeNudge(text, speaker = null) {
    const now = Date.now();
    this._appendToWindow(text, now, speaker);
    this.nudgeWordCount += this._wordCount(text);
    if (this.isNudging || (now - this.lastNudgeAt < NUDGE_COOLDOWN_MS)) return null;

    const moment = detectMoment(text);
    const cadenceDue = this.nudgeWordCount >= NUDGE_WORD_INTERVAL;
    if (!moment && !cadenceDue) return null;

    this.nudgeWordCount = 0;
    return {
      reason: moment ? 'moment' : 'cadence',
      cue: moment ? moment.cue : null,
      category: moment ? moment.category : null,
      personaHint: moment ? moment.personaHint : null
    };
  }

  _windowWordCount() {
    return this.transcriptWindow.reduce((n, e) => n + this._wordCount(e.text), 0);
  }

  // Slow-lane gate. True when call state + MEDDPICC questions are due to refresh:
  // shortly after the call warms up (so tooltips populate), then on a slow timer.
  // Key moments do NOT trigger this lane — they only fire the fast nudge.
  maybeRefresh() {
    if (this.isRefreshing || !this.transcriptWindow.length) return false;
    if (this.lastRefreshAt === 0) return this._windowWordCount() >= REFRESH_FIRST_MIN_WORDS;
    return Date.now() - this.lastRefreshAt >= REFRESH_INTERVAL_MS;
  }

  _recordMove(nudge) {
    this.coachingState.movesGiven.push({
      type: nudge.type,
      persona: nudge.persona,
      headline: nudge.headline,
      at: new Date().toISOString()
    });
    if (this.coachingState.movesGiven.length > MOVES_GIVEN_CAP) {
      this.coachingState.movesGiven = this.coachingState.movesGiven.slice(-MOVES_GIVEN_CAP);
    }
  }

  // Render recent nudges as "move (persona): headline" so the coach can SEE when it
  // is about to repeat a move or theme (headline-only was too easy to rephrase past).
  _recentHeadlines() {
    return this.coachingState.movesGiven
      .map(m => `- ${m.type || 'move'}${m.persona ? ` (${m.persona})` : ''}: ${m.headline}`)
      .join('\n') || '(none yet)';
  }

  // Unconfirmed MEDDPICC criteria, tagged with the lens that owns each, so the coach
  // has a menu to ROTATE across instead of fixating on the same gap (e.g. economic
  // buyer / stakeholders) every cadence. Technical criteria are flagged for the SE.
  _underservedCriteria(meddpicc) {
    if (!meddpicc) return '(MEDDPICC not yet established)';
    const TECHNICAL = new Set(['M', 'D1', 'I', 'C2']);
    const rows = MEDDPICC_KEYS
      .map(k => {
        const c = meddpicc[k];
        if (!c || c.status === 'confirmed') return null;
        const lens = TECHNICAL.has(k) ? 'SE-ownable' : 'AE';
        return `- ${c.label} [${k}] — ${c.status || 'missing'} (${lens})`;
      })
      .filter(Boolean);
    return rows.length ? rows.join('\n') : '(all criteria confirmed)';
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

  // --- Hot lane: the nudge brain (lean output, ~2s) --------------------------
  // ONE small LLM call. Decides the single most valuable coaching move right now
  // (or stays silent) and adopts the most relevant lens (SE / AE / Closer). The
  // output is JUST the nudge, which keeps the call ~2s so it feels timely. Reads
  // the slowly-refreshed call state plus the live 5-minute conversation window.
  // `trigger` (from maybeNudge) is optional context: when it carries a key-moment
  // cue, the coach is told to pressure-test that specific moment. Returns the
  // nudge object (or null when the coach stays silent).
  async nudge(context = {}, trigger = null) {
    if (this.isNudging) return null;
    this.isNudging = true;
    this.lastNudgeAt = Date.now();
    try {
      // Inject each persona's FULL expert judgment (not just a one-line lens) so the
      // coach reasons with real SE/AE/Closer depth. Prompt size grows but adds no
      // material latency (see scripts/coaching-latency-bench.js); output stays lean.
      const lensCatalogue = PERSONAS
        .map(p => `### ${p.label} (${p.id}) — moves: ${p.moves.join(', ')}\n${p.systemPrompt}`)
        .join('\n\n');

      // The rep's editable playbook (who they are, what they sell, how they win),
      // rendered to a compact block. Empty when no playbook is set, adding nothing.
      const playbookBlock = renderPlaybook(context.playbook);

      const meddpiccLenses = `MEDDPICC is MULTI-LENS, not purely commercial. Every criterion has a technical dimension the Solution Engineer owns as much as the Account Executive owns the commercial one — so a MEDDPICC gap is NOT automatically an AE nudge:
- M (Metrics): technical KPIs — latency, uptime, throughput, error rate, time-to-value (SE) as well as business ROI (AE).
- E (Economic Buyer): commercial (AE).
- D1 (Decision Criteria): technical evaluation criteria, requirements, must-haves, POC success criteria (SE) as well as commercial criteria (AE).
- D2 (Decision Process): commercial/process (AE).
- P (Paper Process): commercial (AE).
- I (Identified Pain): technical pain — integration burden, tech debt, scaling limits, security exposure (SE) — as well as business pain (AE).
- C1 (Champion): commercial (AE).
- C2 (Competition): technical differentiation versus the incumbent/alternative (SE) as well as commercial positioning (AE).
When the gap is a technical criterion, coach it through the Solution Engineer lens.`;

      const system = `You are an elite real-time sales coach sitting silently alongside the salesperson on a live call — a world-class solution engineer, account executive and negotiator rolled into one.
${playbookBlock ? `\n${playbookBlock}\n` : ''}
You carry three lenses. For each moment, adopt the SINGLE most valuable one, apply that persona's FULL judgment below, and tag it:

${lensCatalogue}

Choosing the lens (this matters — do not default to one):
- Solution Engineer (se): the customer is in technical territory — integration, APIs, architecture, security/compliance, scalability, performance, data/migration, deployment, or any "does it support / can it handle / how does it work" question. Technical curiosity, doubt, or objection is an SE moment.
- Account Executive (ae): purely commercial qualification — economic buyer, decision process, budget, timeline, next steps.
- Closer (closer): objections, hesitation, pricing pushback, or emotional friction that needs tactical empathy.
Weigh the ACTUAL conversation, not just MEDDPICC gaps. If the rep and customer are deep in a technical discussion, the SE lens almost always beats a generic qualification nudge.

${meddpiccLenses}

How you coach:
- Be proactive and directional. Guide the conversation: the right question or the right steer at exactly the right time.
- Ground every move in the call state, the rep's goals, and the specific MEDDPICC gap — commercial OR technical — that matters next. Not generic advice.
- Do not fixate. If you have already pushed a theme or move (see NUDGES ALREADY GIVEN), either go DEEPER with new specificity or SWITCH to an under-served criterion or lens. Never restate a nudge already given.
- You speak rarely — 2-4 times in a 30-minute call. Silence beats noise. If there is no genuinely high-value move right now, set coach=false.
- Never sound scripted or manipulative.

Return ONLY valid JSON, nothing else:
{
  "nudge": {
    "coach": true|false,
    "confidence": 0.0-1.0,
    "persona": "se|ae|closer",
    "move": "<one move name>",
    "signal": "the customer sentiment or cue that triggered this, short phrase e.g. 'questioning value of the technology'",
    "headline": "imperative, max 8 words",
    "why": "one short line",
    "say": "optional exact words the rep can use, else empty string",
    "urgency": "now|soon"
  }
}`;

      const hintLabel = trigger && trigger.personaHint
        ? (getPersona(trigger.personaHint).label)
        : null;
      const triggerLine = trigger && trigger.cue
        ? `A key moment was just detected (cue: "${trigger.cue}", type: ${trigger.category}).${hintLabel ? ` This looks like a ${hintLabel} moment — strongly consider that lens, but use your own judgment.` : ''} Pressure-test the approach and decide the best move — or stay silent if the rep is already handling it well.`
        : `Routine strategic check. Decide if there is a high-value steer the rep is missing right now.`;

      const user = `${triggerLine}

CALL STATE:
${this._stateSummary()}

CALL BRIEF:
${this._briefSummary(context.callBrief, context.meddpicc)}

RECENT CONVERSATION (last 5 min):
${this._renderConversation()}

NUDGES ALREADY GIVEN (do not repeat — go deeper or switch focus):
${this._recentHeadlines()}

UNDER-SERVED CRITERIA (rotate across these — do not fixate on one; prefer SE-ownable ones when the conversation is technical):
${this._underservedCriteria(context.meddpicc)}

MEDDPICC criteria definitions: M=Metrics, E=Economic Buyer, D1=Decision Criteria, D2=Decision Process, P=Paper Process, I=Identified Pain, C1=Champion, C2=Competition.`;

      const parsed = await this._chatJSON(system, user, NUDGE_MAX_TOKENS);
      if (!parsed) return null;

      const n = parsed.nudge;
      if (!n || n.coach !== true || (n.confidence || 0) < COACH_CONFIDENCE_THRESHOLD) return null;
      const persona = getPersona(n.persona);
      const move = MOVE_NAMES.includes(n.move) ? n.move : (persona.moves[0] || 'NextStep');
      const headline = (n.headline || '').trim();
      if (!headline) return null;
      const nudge = {
        coach: true,
        confidence: n.confidence,
        headline,
        why: (n.why || '').trim(),
        say: (n.say || '').trim() || null,
        signal: (n.signal || '').trim() || (trigger && trigger.cue ? String(trigger.cue).trim() : null) || null,
        type: move,
        persona: persona.id,
        personaLabel: persona.label,
        urgency: n.urgency === 'now' ? 'now' : 'soon',
        triggeredAt: Date.now()
      };
      this._recordMove(nudge);
      return nudge;
    } catch (err) {
      console.error('[Coaching] nudge error:', err.message);
      return null;
    } finally {
      this.isNudging = false;
    }
  }

  // --- Slow lane: call state + MEDDPICC questions (heavy output, ~8s) ---------
  // ONE larger LLM call, kept OFF the hot path. Refreshes the bounded call state
  // (read by the hot lane) and regenerates the per-criterion MEDDPICC killer
  // questions that back the tooltips. Runs on a slow cadence (~3 min) because
  // this context moves slowly and the questions only need to be fresh, not
  // instant. Returns the questions map for the client (or null).
  async refresh(context = {}) {
    if (this.isRefreshing) return null;
    this.isRefreshing = true;
    this.lastRefreshAt = Date.now();
    try {
      const system = `You maintain the working memory of a live sales call for a coaching assistant. You do two things: (1) keep a short, accurate call state, and (2) produce 2-3 sharp "killer questions" the rep could ask to fill each MEDDPICC criterion that is NOT yet confirmed.

Return ONLY valid JSON:
{
  "state": {
    "objective": "short inferred objective or empty",
    "stage": "discovery|demo|objection|closing|smalltalk",
    "establishedFacts": ["short fact", ...],
    "openThreads": ["unresolved item", ...],
    "risks": ["deal risk", ...]
  },
  "questions": { "M": ["q","q"], "E": [...], "D1": [...], "D2": [...], "P": [...], "I": [...], "C1": [...], "C2": [...] }
}

Only include "questions" entries for criteria NOT already confirmed. Keep every array to at most 3 short items. Keep each state list to at most ${STATE_LIST_CAP} short items.`;

      const user = `Update the call state and MEDDPICC killer questions from the conversation so far.
${renderPlaybook(context.playbook) ? `\n${renderPlaybook(context.playbook)}\n` : ''}
CALL STATE (current):
${this._stateSummary()}

CALL BRIEF:
${this._briefSummary(context.callBrief, context.meddpicc)}

RECENT CONVERSATION (last 5 min):
${this._renderConversation()}

MEDDPICC criteria definitions: M=Metrics, E=Economic Buyer, D1=Decision Criteria, D2=Decision Process, P=Paper Process, I=Identified Pain, C1=Champion, C2=Competition.`;

      const parsed = await this._chatJSON(system, user, REFRESH_MAX_TOKENS);
      if (!parsed) return null;

      // Refresh bounded state in place (read by the hot nudge lane).
      if (parsed.state && typeof parsed.state === 'object') {
        const st = parsed.state;
        const cap = (arr) => Array.isArray(arr)
          ? arr.filter(x => typeof x === 'string' && x.trim()).slice(0, STATE_LIST_CAP)
          : [];
        if (typeof st.objective === 'string' && st.objective.trim()) this.coachingState.objective = st.objective.trim();
        if (typeof st.stage === 'string' && st.stage.trim()) this.coachingState.stage = st.stage.trim();
        this.coachingState.establishedFacts = cap(st.establishedFacts);
        this.coachingState.openThreads = cap(st.openThreads);
        this.coachingState.risks = cap(st.risks);
      }

      // Cache per-criterion killer questions for the tooltips.
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

      return Object.keys(this.meddpiccQuestions).length ? this.meddpiccQuestions : null;
    } catch (err) {
      console.error('[Coaching] refresh error:', err.message);
      return null;
    } finally {
      this.isRefreshing = false;
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
module.exports.KEY_MOMENTS = KEY_MOMENTS;
