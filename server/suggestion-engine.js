// Suggestion Engine for Clumo
// Analyzes transcripts and finds relevant suggestions from knowledge base

const { getKnowledgeBase } = require('./knowledge-base');

// --- Tunable pipeline constants (Realtime overhaul) ---------------------------
// Frequency: evaluate often, but suppress with a short cooldown rather than the
// old 60s hard gate. Strong items may re-surface after a longer window.
const SUGGESTION_COOLDOWN_MS = 15000;       // min gap between any two suggestions
const RESURFACE_COOLDOWN_MS = 240000;       // same item can re-surface after 4 min
// Retrieval: dynamic relative threshold instead of a fixed 0.3 cutoff.
const RETRIEVAL_FLOOR = 0.28;               // absolute minimum cosine score to consider
const MIN_CANDIDATES = 4;                   // don't starve the LLM of choice
const MAX_CANDIDATES = 12;                  // fused shortlist cap sent to the LLM
// Variety: per-type seats in the shortlist so a single linguistically-dominant
// type (discovery questions embed closest to customer statements) can't crowd out
// evidence. Sums to MAX_CANDIDATES. The LLM still chooses FREELY across whatever
// is seated — no routing, no forced pick.
const TYPE_QUOTAS = {
  discovery: 4,
  case_study: 3,
  proof_point: 2,
  product_truth: 3
};
// Hybrid retrieval: blend the curated per-item trigger phrases into the score so
// literal mentions ("AWS", "Gartner", "SLA", "data residency") lift the matching
// evidence out of the semantic basement. Bounded so keywords can't win alone.
const TRIGGER_BONUS_WEIGHT = 0.04;          // score added per matched trigger phrase
const TRIGGER_BONUS_MAX_HITS = 3;           // cap on counted hits (max +0.12)
// Anti-monotony: gently de-emphasise the most-recently surfaced type during
// selection so the engine rotates types instead of repeating one. Soft, not a ban.
const ANTI_MONOTONY_PENALTY = 0.03;
const RECENT_TYPE_WINDOW = 3;               // how many recent suggestion types to track
// Fast path: surface the top match without an LLM round-trip when it dominates.
const FAST_PATH_MIN_SCORE = 0.62;
const FAST_PATH_GAP = 0.12;
// Speculative pre-fire: kick the decision LLM mid-utterance on a strong trigger.
const SPECULATIVE_MIN_SCORE = 0.5;
// Decision: confidence required to actually surface a suggestion.
const CONFIDENCE_THRESHOLD = 0.75;
// Minimum words for an utterance to be worth evaluating at all.
const MIN_UTTERANCE_WORDS = 4;

// Decision LLM system prompt. The LLM decides FREELY across a fused, multi-type
// candidate set — no intent classification or type routing. It picks by id.
const DECISION_SYSTEM = `You are a surgical sales coach - you speak rarely but with high precision and impact.

You are given the customer's most recent statement, recent conversation, a running call brief, and a shortlist of candidate suggestions (discovery questions, case studies, proof points, product truths). Decide whether to surface ONE candidate to the salesperson right now.

ONLY suggest when ALL of these are true:
1. The customer just said something that DIRECTLY relates to a candidate
2. This is a PIVOTAL moment - an objection, question, pain point, requirement, named competitor, or decision point
3. The salesperson would clearly benefit from this RIGHT NOW
4. It would feel natural and helpful, not intrusive

Do NOT suggest for small talk, when the rep is already handling it well, when a topic was only mentioned in passing, or when you are not highly confident. When in doubt, return {"suggest": false, "confidence": 0}. A great coach speaks 2-3 times per 30-minute call.

Choose the single best candidate by its id - any type is allowed; pick whatever fits the moment.

PICKING THE RIGHT TYPE (guidance, not rules - you still choose freely):
- Lean to EVIDENCE (case study, proof point, product truth) when the customer is skeptical, asks for proof, names a competitor or alternative, states a concrete requirement, or asks a product / security / pricing question.
- Lean to a DISCOVERY QUESTION to open a new topic or when key information is missing.
- You will be shown the types surfaced most recently; avoid repeating the same type back-to-back unless it is clearly the best choice.

Respond ONLY with valid JSON:
{"suggest": true, "confidence": 0.0-1.0, "id": "candidate id", "trigger": "the exact words the CUSTOMER said that prompted this", "reasoning": "brief"}
or
{"suggest": false, "confidence": 0}

The "trigger" must be the customer's actual spoken words (e.g. "we're looking at AI Foundry"), NOT the suggestion text.`;

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// Lightweight, dependency-free speaker heuristic. We only have a single
// transcription channel, so we cannot truly diarise — but customer statements
// (needs, pains, questions) have recognisable shapes. Used to decide whether an
// utterance is "meaningful" enough to evaluate eagerly vs. require a stronger
// local match. Never blocks; only nudges the retrieval floor.
const CUSTOMER_CUES = [
  'we need', 'we are', "we're", 'we have', 'we want', 'our team', 'our company',
  'our current', 'right now we', 'today we', 'the problem', 'the challenge',
  'struggling', 'concerned', 'worried', 'how do you', 'how does', 'can you',
  'what about', 'do you support', 'is it possible', 'currently', 'at the moment',
  'looking for', 'looking at', 'evaluating', 'comparing', 'how much', 'pricing'
];

function looksLikeCustomerStatement(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (lower.includes('?')) return true;
  return CUSTOMER_CUES.some(cue => lower.includes(cue));
}

// Extract the pivotal recent utterance (last sentence / clause) for retrieval.
// Retrieval should embed "what was just said", not the whole rolling buffer.
function extractPivotal(text) {
  if (!text) return '';
  const trimmed = text.trim();
  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length === 0) return trimmed;
  const last = sentences[sentences.length - 1].trim();
  // If the final sentence is very short, blend the previous one for context.
  if (last.split(/\s+/).length < 5 && sentences.length >= 2) {
    return `${sentences[sentences.length - 2].trim()} ${last}`.trim();
  }
  return last;
}


class SuggestionEngine {
  constructor(provider, sessionId = null, embeddingProvider = null) {
    // Accept either a provider object or a raw OpenAI client for backward compatibility
    if (provider && typeof provider.chatCompletion === 'function') {
      this.provider = provider;
      this.openai = provider.getClient();
    } else {
      this.provider = null;
      this.openai = provider;
    }
    // Optional separate embedding provider
    this.embeddingProvider = embeddingProvider || this.provider;
    this.sessionId = sessionId || this.generateSessionId();
    this.sessionStartTime = new Date();
    this.recentTranscript = '';
    this.lastSuggestionTime = 0;
    // id -> timestamp of last time we surfaced it. Replaces the permanent
    // suggestedIds Set so strong items can re-surface after RESURFACE_COOLDOWN_MS.
    this.suggestedAt = new Map();
    this.sessionHistory = []; // Full history of suggestions with timestamps and triggers
    this.knowledgeBase = null; // Loaded async via init()
    // Recent suggestion kinds (most-recent last) for anti-monotony rotation.
    this.recentTypes = [];

    // Turn-by-turn transcript window (pivotal context for the decision LLM).
    this.turns = [];

    // Warm speculative state: pivotal embedding + fused candidates computed
    // during speech so they are ready the instant the customer pauses.
    this._warm = { text: '', embedding: null, candidates: null };
    this._speculative = null; // { text, promise } in-flight decision pre-fire
    this._evalSeq = 0;        // latest-wins token for cancel-in-flight

    // Running call brief (cheaply maintained alongside MEDDPICC).
    this.callBrief = {
      industry: '',
      goals: [],
      requirements: [],
      competitors: [],
      pains: []
    };

    // Full transcript for post-call analysis
    this.fullTranscript = [];

    // Live MEDDPICC tracking
    this.meddpicc = {
      M: { label: 'Metrics', status: 'none', evidence: [] },
      E: { label: 'Economic Buyer', status: 'none', evidence: [] },
      D1: { label: 'Decision Criteria', status: 'none', evidence: [] },
      D2: { label: 'Decision Process', status: 'none', evidence: [] },
      P: { label: 'Paper Process', status: 'none', evidence: [] },
      I: { label: 'Identified Pain', status: 'none', evidence: [] },
      C1: { label: 'Champion', status: 'none', evidence: [] },
      C2: { label: 'Competition', status: 'none', evidence: [] }
    };
    this.meddpiccWordCount = 0; // Track words since last MEDDPICC analysis
    this.isMeddpiccAnalyzing = false;
  }

  // Load the knowledge base for a specific user (call after construction)
  async init(userId) {
    this.userId = userId;
    this.knowledgeBase = await getKnowledgeBase();
    return this;
  }

  // Reload the knowledge base (e.g. after user retrains)
  async reloadKnowledgeBase() {
    const newKb = await getKnowledgeBase(this.userId);
    if (newKb) {
      this.knowledgeBase = newKb;
      console.log(`🔄 Knowledge base reloaded for session ${this.sessionId}`);
    }
  }

  // Generate a unique session ID
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // Get session ID
  getSessionId() {
    return this.sessionId;
  }

  // Get full session history
  getSessionHistory() {
    return {
      sessionId: this.sessionId,
      startTime: this.sessionStartTime,
      endTime: new Date(),
      totalSuggestions: this.sessionHistory.length,
      suggestions: this.sessionHistory,
      meddpicc: this.meddpicc,
      fullTranscript: this.fullTranscript
    };
  }

  // Record a suggestion to session history
  recordSuggestion(suggestion, itemId) {
    this.sessionHistory.push({
      id: itemId,
      timestamp: new Date(),
      type: suggestion.type,
      suggestion: { ...suggestion },
      trigger: suggestion.trigger
    });
  }

  // Add new transcript text. `speaker` ('you' | 'customer') is optional and,
  // when present, labels the turn so downstream context knows who spoke.
  addTranscript(text, speaker = null) {
    const label = speaker === 'you' ? 'You' : speaker === 'customer' ? 'Customer' : null;
    const labelled = label ? `${label}: ${text}` : text;
    this.recentTranscript += ' ' + labelled;
    // Keep only last ~500 words for context
    const words = this.recentTranscript.split(/\s+/);
    if (words.length > 500) {
      this.recentTranscript = words.slice(-500).join(' ');
    }

    // Maintain a turn window for layered decision context (last N turns).
    this.turns.push({ text: text.trim(), speaker: speaker || undefined, timestamp: new Date().toISOString() });
    if (this.turns.length > 12) this.turns = this.turns.slice(-12);

    // Accumulate full transcript
    this.fullTranscript.push({ text, speaker: speaker || undefined, timestamp: new Date().toISOString() });

    // Track words for MEDDPICC analysis (every ~200 words)
    this.meddpiccWordCount += text.split(/\s+/).length;
    if (this.meddpiccWordCount >= 200 && !this.isMeddpiccAnalyzing) {
      this.meddpiccWordCount = 0;
      this.analyzeMeddpicc().catch(err => {
        console.error('MEDDPICC analysis error:', err);
      });
    }
  }

  // Analyze transcript for MEDDPICC evidence using GPT
  async analyzeMeddpicc() {
    this.isMeddpiccAnalyzing = true;
    try {
      const transcriptText = this.fullTranscript.map(t => t.text).join(' ');
      // Use last ~2000 words for context
      const words = transcriptText.split(/\s+/);
      const context = words.slice(-2000).join(' ');

      const response = await this.openai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are a MEDDPICC sales methodology analyst. Analyze the sales call transcript and extract evidence for each MEDDPICC criterion, plus a short running call brief.

For each criterion, determine its status:
- "none": No evidence found
- "partial": Some indication but not confirmed
- "confirmed": Clear, explicit evidence

Return ONLY valid JSON in this exact format:
{
  "M": { "status": "none|partial|confirmed", "evidence": ["brief evidence snippet"] },
  "E": { "status": "none|partial|confirmed", "evidence": ["brief evidence snippet"] },
  "D1": { "status": "none|partial|confirmed", "evidence": ["brief evidence snippet"] },
  "D2": { "status": "none|partial|confirmed", "evidence": ["brief evidence snippet"] },
  "P": { "status": "none|partial|confirmed", "evidence": ["brief evidence snippet"] },
  "I": { "status": "none|partial|confirmed", "evidence": ["brief evidence snippet"] },
  "C1": { "status": "none|partial|confirmed", "evidence": ["brief evidence snippet"] },
  "C2": { "status": "none|partial|confirmed", "evidence": ["brief evidence snippet"] },
  "brief": {
    "industry": "one short phrase or empty string",
    "goals": ["stated goal"],
    "requirements": ["stated requirement or must-have"],
    "competitors": ["named competitor or incumbent"],
    "pains": ["core pain point"]
  }
}

Criteria definitions:
M = Metrics: Quantifiable measures of success the buyer cares about
E = Economic Buyer: The person with final budget authority
D1 = Decision Criteria: Technical/business requirements for the solution
D2 = Decision Process: Steps, timeline, and people involved in the decision
P = Paper Process: Legal, procurement, security review processes
I = Identified Pain: The core business problem or challenge
C1 = Champion: An internal advocate who is actively selling on your behalf
C2 = Competition: Other solutions being evaluated

Keep evidence snippets to 1 short sentence each. Brief arrays should hold at most 4 short items each. Only include things actually found in the transcript.`
          },
          {
            role: 'user',
            content: `SALES CALL TRANSCRIPT:\n"${context}"\n\nAnalyze this transcript for MEDDPICC evidence.`
          }
        ],
        temperature: 0.1,
        max_tokens: 800
      });

      let content = response.choices[0].message.content.trim();
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      let result;
      try {
        result = JSON.parse(content);
      } catch (e) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          throw e;
        }
      }

      // Update MEDDPICC state
      for (const key of ['M', 'E', 'D1', 'D2', 'P', 'I', 'C1', 'C2']) {
        if (result[key]) {
          this.meddpicc[key].status = result[key].status || 'none';
          this.meddpicc[key].evidence = result[key].evidence || [];
        }
      }

      // Update the running call brief (reused as decision context).
      if (result.brief && typeof result.brief === 'object') {
        const b = result.brief;
        const clean = (arr) => Array.isArray(arr)
          ? arr.filter(x => typeof x === 'string' && x.trim()).slice(0, 4)
          : [];
        this.callBrief = {
          industry: typeof b.industry === 'string' ? b.industry.trim() : this.callBrief.industry,
          goals: clean(b.goals),
          requirements: clean(b.requirements),
          competitors: clean(b.competitors),
          pains: clean(b.pains)
        };
      }
    } catch (error) {
      console.error('Error in MEDDPICC analysis:', error.message);
    } finally {
      this.isMeddpiccAnalyzing = false;
    }
  }

  // Frequency gate: short cooldown between any two suggestions (was a 60s hard
  // gate). We evaluate often and rely on this + the decision LLM for restraint.
  canSuggest() {
    return Date.now() - this.lastSuggestionTime >= SUGGESTION_COOLDOWN_MS;
  }

  // Per-item re-surface cooldown. Replaces the permanent suggestedIds dedup so a
  // strong item can come back later in the call if it becomes relevant again.
  isOnCooldown(id) {
    const last = this.suggestedAt.get(id);
    return last !== undefined && (Date.now() - last) < RESURFACE_COOLDOWN_MS;
  }

  // KB groups in a uniform shape so candidate building is type-agnostic.
  _kbGroups() {
    return [
      { kind: 'discovery', list: this.knowledgeBase.discoveryQuestions || [] },
      { kind: 'case_study', list: this.knowledgeBase.caseStudies || [] },
      { kind: 'proof_point', list: this.knowledgeBase.proofPoints || [] },
      { kind: 'product_truth', list: this.knowledgeBase.productTruths || [] }
    ];
  }

  _hasEmbeddings() {
    return !!(this.embeddingProvider &&
      typeof this.embeddingProvider.generateEmbedding === 'function' &&
      (this.knowledgeBase.discoveryQuestions || []).some(dq => dq.embedding));
  }

  // Count how many of an item's curated trigger phrases appear in the utterance.
  _triggerHits(item, lowerText) {
    const triggers = item.triggers || [];
    let hits = 0;
    for (const tr of triggers) {
      if (tr && lowerText.includes(tr.toLowerCase())) hits++;
    }
    return hits;
  }

  // Trigger-word fallback (used only when embeddings are unavailable). Returns a
  // single fused, scored candidate list rather than per-type buckets.
  _triggerCandidates(text) {
    const lowerText = (text || '').toLowerCase();
    const out = [];
    for (const { kind, list } of this._kbGroups()) {
      for (const item of list) {
        if (this.isOnCooldown(item.id)) continue;
        const matchCount = this._triggerHits(item, lowerText);
        if (matchCount >= 2) out.push({ kind, id: item.id, score: matchCount, item });
      }
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, MAX_CANDIDATES);
  }

  // --- Candidate selection (fused, hybrid, per-type quotas) ------------------

  // Score the whole KB against an embedding. Hybrid: cosine similarity blended
  // with a bounded bonus for curated trigger phrases the customer literally said,
  // so evidence isn't buried by discovery-question phrasing. Returns a fused,
  // sorted list (highest blended score first).
  async _semanticCandidates(text, precomputedEmbedding = null) {
    const embedding = precomputedEmbedding ||
      await this.embeddingProvider.generateEmbedding(text);
    const lowerText = (text || '').toLowerCase();
    const scored = [];
    for (const { kind, list } of this._kbGroups()) {
      for (const item of list) {
        if (!item.embedding) continue;
        const semantic = cosineSimilarity(embedding, item.embedding);
        const hits = this._triggerHits(item, lowerText);
        const bonus = Math.min(hits, TRIGGER_BONUS_MAX_HITS) * TRIGGER_BONUS_WEIGHT;
        scored.push({ kind, id: item.id, score: semantic + bonus, semantic, hits, item });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return { embedding, scored };
  }

  // Per-type quota selection: give each type up to TYPE_QUOTAS[type] seats from
  // the fused list (>= floor, not on cooldown), so the LLM always sees a
  // multi-type shortlist. A soft anti-monotony penalty de-emphasises the most
  // recently surfaced type. Falls back to MIN_CANDIDATES top items if quotas
  // under-fill, and never pads with junk below the floor.
  _selectCandidates(scored) {
    const recentType = this.recentTypes[this.recentTypes.length - 1];
    const eligible = scored
      .filter(c => !this.isOnCooldown(c.id) && c.score >= RETRIEVAL_FLOOR)
      .map(c => ({
        ...c,
        rankScore: c.score - (c.kind === recentType ? ANTI_MONOTONY_PENALTY : 0)
      }))
      .sort((a, b) => b.rankScore - a.rankScore);
    if (!eligible.length) return [];

    const taken = { discovery: 0, case_study: 0, proof_point: 0, product_truth: 0 };
    const selected = [];
    for (const c of eligible) {
      const quota = TYPE_QUOTAS[c.kind] || 0;
      if (taken[c.kind] < quota) {
        selected.push(c);
        taken[c.kind]++;
      }
      if (selected.length >= MAX_CANDIDATES) break;
    }

    // Under-filled quotas (few types relevant): top up by rank so the LLM still
    // has at least MIN_CANDIDATES to choose from when the KB supports it.
    if (selected.length < MIN_CANDIDATES) {
      for (const c of eligible) {
        if (selected.includes(c)) continue;
        selected.push(c);
        if (selected.length >= MIN_CANDIDATES) break;
      }
    }

    selected.sort((a, b) => b.rankScore - a.rankScore);
    return selected.slice(0, MAX_CANDIDATES);
  }

  // Fast path: surface the top match directly (no LLM) when it clearly dominates.
  _fastPathItem(candidates) {
    if (!candidates.length) return null;
    const top = candidates[0];
    const second = candidates[1];
    const gap = second ? top.score - second.score : top.score;
    if (top.score >= FAST_PATH_MIN_SCORE && gap >= FAST_PATH_GAP) return top;
    return null;
  }

  _candidateById(candidates, id) {
    return candidates.find(c => c.id === id) || null;
  }

  // --- Warm / speculative pipeline -------------------------------------------

  // Called on partial transcript deltas during speech. Computes the pivotal
  // embedding + candidate set ahead of the pause, and may speculatively pre-fire
  // the decision LLM on a strong trigger (confirmed/discarded at finalize).
  async warmUtterance(text) {
    if (!this._hasEmbeddings()) return;
    const pivotal = extractPivotal((text || '').trim());
    if (!pivotal || pivotal.split(/\s+/).filter(Boolean).length < MIN_UTTERANCE_WORDS) return;
    if (this._warm && this._warm.text === pivotal && this._warm.embedding) return;
    try {
      const { embedding, scored } = await this._semanticCandidates(pivotal);
      this._warm = { text: pivotal, embedding, scored, ts: Date.now() };

      const candidates = this._selectCandidates(scored);
      const strong = candidates.length &&
        candidates[0].score >= SPECULATIVE_MIN_SCORE &&
        !this._fastPathItem(candidates);
      if (this.canSuggest() && strong) {
        // Bounded speculative pre-fire. Cost is capped by the strong-trigger gate
        // + the fact that we only keep the latest pivotal's promise.
        this._speculative = {
          text: pivotal,
          candidates,
          promise: this._runDecisionLLM(pivotal, candidates).catch(() => null)
        };
      }
    } catch (e) {
      // Warm failures are non-fatal; the pause path will recompute.
    }
  }

  // --- Main decision entry point ---------------------------------------------

  // Evaluate the current (final) utterance and return a suggestion or null.
  // `transcript` is treated as the latest utterance/segment, not a 50-word buffer.
  async getBestSuggestion(transcript, opts = {}) {
    const t = { start: Date.now() };
    if (!this.canSuggest()) return null;

    const utterance = (opts.utterance || transcript || '').trim();
    if (utterance.split(/\s+/).filter(Boolean).length < MIN_UTTERANCE_WORDS) return null;

    const seq = ++this._evalSeq; // latest-wins token (cancel-in-flight)
    const pivotal = extractPivotal(utterance);
    const hasEmbeddings = this._hasEmbeddings();

    let candidates;
    if (hasEmbeddings) {
      let scored;
      if (this._warm && this._warm.embedding && this._warm.text === pivotal && this._warm.scored) {
        scored = this._warm.scored; // reuse warm embedding computed during speech
      } else {
        ({ scored } = await this._semanticCandidates(pivotal));
      }
      t.embedDone = Date.now();
      candidates = this._selectCandidates(scored);
    } else {
      candidates = this._triggerCandidates(utterance);
      t.embedDone = Date.now();
    }
    t.matchDone = Date.now();

    if (this._evalSeq !== seq) return null;       // superseded by a newer utterance
    if (!candidates.length) { this._logLatency(t, 'no-candidates'); return null; }

    // Speaker heuristic: utterances that don't look like a customer statement
    // need a stronger local lead before we bother the rep.
    if (hasEmbeddings && !looksLikeCustomerStatement(utterance) &&
        candidates[0].score < RETRIEVAL_FLOOR + 0.06) {
      this._logLatency(t, 'weak-non-customer');
      return null;
    }

    // Fast path: dominant local winner -> skip the LLM round-trip.
    const fast = hasEmbeddings ? this._fastPathItem(candidates) : null;
    if (fast) {
      const suggestion = this._materialize(fast.kind, fast.id, pivotal);
      if (suggestion && this._evalSeq === seq) {
        this._stampTriggerTime(suggestion, opts);
        this._commitSuggestion(suggestion, fast.id);
        t.llmStart = t.llmDone = Date.now();
        this._logLatency(t, `fast-path ${fast.kind} ${fast.score.toFixed(2)}`);
        return suggestion;
      }
    }

    // Decision LLM. Reuse a speculative pre-fire if it targeted this pivotal.
    t.llmStart = Date.now();
    let decision;
    try {
      if (this._speculative && this._speculative.text === pivotal && this._speculative.promise) {
        decision = await this._speculative.promise;
        if (this._speculative.candidates) candidates = this._speculative.candidates;
      } else {
        decision = await this._runDecisionLLM(pivotal, candidates);
      }
    } catch (e) {
      console.error('[Suggestion] Decision LLM error:', e.message);
      this._speculative = null;
      return null;
    }
    this._speculative = null;
    t.llmDone = Date.now();

    if (this._evalSeq !== seq) return null;       // a newer utterance won
    if (!decision || !decision.suggest) { this._logLatency(t, 'llm-declined'); return null; }

    const confidence = decision.confidence || 0;
    if (confidence < CONFIDENCE_THRESHOLD) {
      this._logLatency(t, `low-conf ${confidence}`);
      return null;
    }

    const chosen = this._candidateById(candidates, decision.id);
    if (!chosen) { this._logLatency(t, `unknown-id ${decision.id}`); return null; }

    const suggestion = this._materialize(chosen.kind, chosen.id, this._groundTrigger(decision.trigger, pivotal));
    if (!suggestion) return null;
    this._stampTriggerTime(suggestion, opts);
    this._commitSuggestion(suggestion, chosen.id);
    this._logLatency(t, `llm ${chosen.kind} conf=${confidence}`);
    return suggestion;
  }

  // Run the decision LLM with json_object mode, a trimmed prompt, and low tokens.
  async _runDecisionLLM(pivotal, candidates) {
    const prompt = this.buildDecisionPrompt(pivotal, candidates);
    const response = await this.openai.chat.completions.create({
      messages: [
        { role: 'system', content: DECISION_SYSTEM },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 120,
      response_format: { type: 'json_object' }
    });
    return this._parseDecision(response.choices[0].message.content || '');
  }

  _parseDecision(content) {
    let c = (content || '').trim();
    if (c.startsWith('```')) {
      c = c.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    try {
      return JSON.parse(c);
    } catch (e) {
      const m = c.match(/\{[\s\S]*\}/);
      if (m) {
        try { return JSON.parse(m[0]); } catch (_) { /* fall through */ }
      }
      console.error('[Suggestion] Failed to parse decision JSON:', c.slice(0, 120));
      return null;
    }
  }

  // Turn a chosen candidate into the wire-format suggestion the client expects.
  _materialize(kind, id, trigger) {
    if (kind === 'discovery') {
      const item = (this.knowledgeBase.discoveryQuestions || []).find(x => x.id === id);
      if (!item) return null;
      return { type: 'discovery', question: item.question, context: item.context, trigger };
    }
    if (kind === 'case_study') {
      const item = (this.knowledgeBase.caseStudies || []).find(x => x.id === id);
      if (!item) return null;
      return { type: 'case_study', company: item.company, headline: item.headline, result: item.result, link: item.link, trigger };
    }
    if (kind === 'proof_point') {
      const item = (this.knowledgeBase.proofPoints || []).find(x => x.id === id);
      if (!item) return null;
      return { type: 'proof_point', stat: item.stat, source: item.source, link: item.link, trigger };
    }
    if (kind === 'product_truth') {
      const item = (this.knowledgeBase.productTruths || []).find(x => x.id === id);
      if (!item) return null;
      return { type: 'product_truth', fact: item.fact, category: item.category, link: item.link, trigger };
    }
    return null;
  }

  // Stamp the suggestion with when the customer spoke the triggering statement.
  // opts.triggeredAt (epoch ms, from the WS layer) is preferred; fall back to now.
  _stampTriggerTime(suggestion, opts = {}) {
    const ms = Number(opts.triggeredAt) || Date.now();
    suggestion.triggeredAt = new Date(ms).toISOString();
  }

  // Guarantee the surfaced trigger is something the customer verifiably said.
  // Accept the LLM-provided trigger only if it's a case-insensitive substring of
  // the recent transcript; otherwise fall back to the verbatim pivotal utterance.
  _groundTrigger(llmTrigger, pivotal) {
    const t = (llmTrigger || '').trim();
    if (!t) return pivotal;
    const haystack = `${this.recentTranscript || ''} ${pivotal || ''}`.toLowerCase();
    if (haystack.includes(t.toLowerCase())) return t;
    return pivotal;
  }

  _commitSuggestion(suggestion, id) {
    this.lastSuggestionTime = Date.now();
    this.suggestedAt.set(id, Date.now());
    if (suggestion && suggestion.type) {
      this.recentTypes.push(suggestion.type);
      if (this.recentTypes.length > RECENT_TYPE_WINDOW) {
        this.recentTypes = this.recentTypes.slice(-RECENT_TYPE_WINDOW);
      }
    }
    this.recordSuggestion(suggestion, id);
  }

  _logLatency(t, label) {
    const end = Date.now();
    const total = end - t.start;
    const embed = (t.embedDone || t.start) - t.start;
    const match = (t.matchDone || t.embedDone || t.start) - (t.embedDone || t.start);
    const llm = (t.llmStart && t.llmDone) ? (t.llmDone - t.llmStart) : 0;
    console.log(`[Suggestion] statement->decision ${total}ms (embed ${embed}ms, match ${match}ms, llm ${llm}ms) :: ${label}`);
  }

  // Mark a surfaced suggestion as used by the rep.
  markSuggestionUsed(id) {
    const entry = [...this.sessionHistory].reverse().find(s => s.id === id);
    if (entry) entry.used = true;
  }

  // Mark a surfaced suggestion as dismissed; keep it on cooldown so it doesn't
  // immediately re-surface, but don't ban it permanently.
  markSuggestionDismissed(id) {
    const entry = [...this.sessionHistory].reverse().find(s => s.id === id);
    if (entry) entry.dismissed = true;
    this.suggestedAt.set(id, Date.now());
  }

  _formatBrief() {
    const b = this.callBrief || {};
    const parts = [];
    if (b.industry) parts.push(`Industry: ${b.industry}`);
    if (b.pains && b.pains.length) parts.push(`Pains: ${b.pains.join('; ')}`);
    if (b.goals && b.goals.length) parts.push(`Goals: ${b.goals.join('; ')}`);
    if (b.requirements && b.requirements.length) parts.push(`Requirements: ${b.requirements.join('; ')}`);
    if (b.competitors && b.competitors.length) parts.push(`Competitors: ${b.competitors.join('; ')}`);
    const md = Object.values(this.meddpicc || {})
      .filter(v => v.status && v.status !== 'none')
      .map(v => `${v.label}=${v.status}`);
    if (md.length) parts.push(`MEDDPICC: ${md.join(', ')}`);
    return parts.join('\n');
  }

  _describeCandidate(c) {
    switch (c.kind) {
      case 'discovery':
        return `[discovery question] "${c.item.question}" (context: ${c.item.context || ''})`;
      case 'case_study':
        return `[case study] ${c.item.company}: ${c.item.headline} - ${c.item.result}`;
      case 'proof_point':
        return `[proof point] ${c.item.stat} (source: ${c.item.source || ''})`;
      case 'product_truth':
        return `[product truth] ${c.item.fact} (category: ${c.item.category || ''})`;
      default:
        return '';
    }
  }

  // Layered decision context: pivotal line, recent turns, running brief, shortlist.
  buildDecisionPrompt(pivotal, candidates) {
    const recent = this.turns.slice(-6).map(x => x.text).filter(Boolean).join(' ');
    const brief = this._formatBrief();
    let prompt = `WHAT JUST HAPPENED (most important):\n"${pivotal}"\n\n`;
    if (recent) prompt += `RECENT CONVERSATION:\n"${recent.slice(-1200)}"\n\n`;
    if (brief) prompt += `CALL BRIEF:\n${brief}\n\n`;
    if (this.recentTypes.length) {
      const labels = { discovery: 'discovery question', case_study: 'case study', proof_point: 'proof point', product_truth: 'product truth' };
      const shown = this.recentTypes.map(t => labels[t] || t).join(', ');
      prompt += `RECENTLY SHOWN (avoid repeating the same type unless clearly best): ${shown}\n\n`;
    }
    prompt += `CANDIDATE SUGGESTIONS (choose at most one, by id):\n`;
    candidates.forEach(c => { prompt += `- id: ${c.id} | ${this._describeCandidate(c)}\n`; });
    prompt += `\nShould the rep be shown one of these RIGHT NOW? Respond with the JSON schema.`;
    return prompt;
  }

  // Reset for new session (returns the final session data before resetting)
  reset() {
    const finalSession = this.getSessionHistory();
    this.recentTranscript = '';
    this.lastSuggestionTime = 0;
    this.suggestedAt.clear();
    this.sessionHistory = [];
    this.turns = [];
    this.recentTypes = [];
    this._warm = { text: '', embedding: null, candidates: null };
    this._speculative = null;
    this._evalSeq = 0;
    this.callBrief = { industry: '', goals: [], requirements: [], competitors: [], pains: [] };
    this.sessionId = this.generateSessionId();
    this.sessionStartTime = new Date();
    this.fullTranscript = [];
    this.meddpicc = {
      M: { label: 'Metrics', status: 'none', evidence: [] },
      E: { label: 'Economic Buyer', status: 'none', evidence: [] },
      D1: { label: 'Decision Criteria', status: 'none', evidence: [] },
      D2: { label: 'Decision Process', status: 'none', evidence: [] },
      P: { label: 'Paper Process', status: 'none', evidence: [] },
      I: { label: 'Identified Pain', status: 'none', evidence: [] },
      C1: { label: 'Champion', status: 'none', evidence: [] },
      C2: { label: 'Competition', status: 'none', evidence: [] }
    };
    this.meddpiccWordCount = 0;
    this.isMeddpiccAnalyzing = false;
    return finalSession;
  }
}

module.exports = SuggestionEngine;
