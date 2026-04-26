// Suggestion Engine for Clumo
// Analyzes transcripts and finds relevant suggestions from knowledge base

const { getKnowledgeBase } = require('./knowledge-base');

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

class SuggestionEngine {
  constructor(provider, sessionId = null) {
    // Accept either a provider object or a raw OpenAI client for backward compatibility
    if (provider && typeof provider.chatCompletion === 'function') {
      this.provider = provider;
      this.openai = provider.getClient();
    } else {
      this.provider = null;
      this.openai = provider;
    }
    this.sessionId = sessionId || this.generateSessionId();
    this.sessionStartTime = new Date();
    this.recentTranscript = '';
    this.lastSuggestionTime = 0;
    this.suggestedIds = new Set(); // Track what we've already suggested
    this.sessionHistory = []; // Full history of suggestions with timestamps and triggers
    this.minTimeBetweenSuggestions = 60000; // 60 seconds minimum between suggestions
    this.knowledgeBase = null; // Loaded async via init()

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

  // Add new transcript text
  addTranscript(text) {
    this.recentTranscript += ' ' + text;
    // Keep only last ~500 words for context
    const words = this.recentTranscript.split(/\s+/);
    if (words.length > 500) {
      this.recentTranscript = words.slice(-500).join(' ');
    }

    // Accumulate full transcript
    this.fullTranscript.push({ text, timestamp: new Date().toISOString() });

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
            content: `You are a MEDDPICC sales methodology analyst. Analyze the sales call transcript and extract evidence for each MEDDPICC criterion.

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
  "C2": { "status": "none|partial|confirmed", "evidence": ["brief evidence snippet"] }
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

Keep evidence snippets to 1 short sentence each. Only include evidence actually found in the transcript.`
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
    } catch (error) {
      console.error('Error in MEDDPICC analysis:', error.message);
    } finally {
      this.isMeddpiccAnalyzing = false;
    }
  }

  // Check if enough time has passed for a new suggestion
  canSuggest() {
    return Date.now() - this.lastSuggestionTime >= this.minTimeBetweenSuggestions;
  }

  // Find matching items based on trigger words (fallback when embeddings unavailable)
  findTriggerMatches(text) {
    const lowerText = text.toLowerCase();
    const matches = {
      caseStudies: [],
      discoveryQuestions: [],
      proofPoints: []
    };

    for (const cs of this.knowledgeBase.caseStudies) {
      if (this.suggestedIds.has(cs.id)) continue;
      const matchCount = cs.triggers.filter(t => lowerText.includes(t.toLowerCase())).length;
      if (matchCount >= 2) {
        matches.caseStudies.push({ ...cs, matchCount });
      }
    }

    for (const dq of this.knowledgeBase.discoveryQuestions) {
      if (this.suggestedIds.has(dq.id)) continue;
      const matchCount = dq.triggers.filter(t => lowerText.includes(t.toLowerCase())).length;
      if (matchCount >= 2) {
        matches.discoveryQuestions.push({ ...dq, matchCount });
      }
    }

    for (const pp of this.knowledgeBase.proofPoints) {
      if (this.suggestedIds.has(pp.id)) continue;
      const matchCount = pp.triggers.filter(t => lowerText.includes(t.toLowerCase())).length;
      if (matchCount >= 2) {
        matches.proofPoints.push({ ...pp, matchCount });
      }
    }

    matches.caseStudies.sort((a, b) => b.matchCount - a.matchCount);
    matches.discoveryQuestions.sort((a, b) => b.matchCount - a.matchCount);
    matches.proofPoints.sort((a, b) => b.matchCount - a.matchCount);

    return matches;
  }

  // Find matching items using embedding-based cosine similarity
  async findSemanticMatches(text) {
    const SIMILARITY_THRESHOLD = 0.3;
    const textEmbedding = await this.provider.generateEmbedding(text);

    const matches = {
      caseStudies: [],
      discoveryQuestions: [],
      proofPoints: []
    };

    for (const cs of this.knowledgeBase.caseStudies) {
      if (this.suggestedIds.has(cs.id) || !cs.embedding) continue;
      const similarity = cosineSimilarity(textEmbedding, cs.embedding);
      if (similarity >= SIMILARITY_THRESHOLD) {
        matches.caseStudies.push({ ...cs, similarity });
      }
    }

    for (const dq of this.knowledgeBase.discoveryQuestions) {
      if (this.suggestedIds.has(dq.id) || !dq.embedding) continue;
      const similarity = cosineSimilarity(textEmbedding, dq.embedding);
      if (similarity >= SIMILARITY_THRESHOLD) {
        matches.discoveryQuestions.push({ ...dq, similarity });
      }
    }

    for (const pp of this.knowledgeBase.proofPoints) {
      if (this.suggestedIds.has(pp.id) || !pp.embedding) continue;
      const similarity = cosineSimilarity(textEmbedding, pp.embedding);
      if (similarity >= SIMILARITY_THRESHOLD) {
        matches.proofPoints.push({ ...pp, similarity });
      }
    }

    // Sort by similarity descending, keep top 3 per type
    matches.caseStudies.sort((a, b) => b.similarity - a.similarity);
    matches.caseStudies = matches.caseStudies.slice(0, 3);
    matches.discoveryQuestions.sort((a, b) => b.similarity - a.similarity);
    matches.discoveryQuestions = matches.discoveryQuestions.slice(0, 3);
    matches.proofPoints.sort((a, b) => b.similarity - a.similarity);
    matches.proofPoints = matches.proofPoints.slice(0, 3);

    console.log(`[Suggestion] Semantic matches: ${matches.discoveryQuestions.length} DQs, ${matches.caseStudies.length} CSs, ${matches.proofPoints.length} PPs`);

    return matches;
  }

  // Use GPT to decide the best suggestion for the current context
  async getBestSuggestion(transcript) {
    if (!this.canSuggest()) {
      return null;
    }

    // Use semantic matching if provider supports embeddings and KB has embeddings
    const hasEmbeddings = this.provider &&
      typeof this.provider.generateEmbedding === 'function' &&
      this.knowledgeBase.discoveryQuestions.some(dq => dq.embedding);

    let matches;
    if (hasEmbeddings) {
      matches = await this.findSemanticMatches(transcript);
    } else {
      matches = this.findTriggerMatches(transcript);
    }
    
    // If no matches, nothing to suggest
    const hasMatches = 
      matches.caseStudies.length > 0 || 
      matches.discoveryQuestions.length > 0 || 
      matches.proofPoints.length > 0;
    
    if (!hasMatches) {
      return null;
    }

    try {
      // Build context for GPT
      const prompt = this.buildPrompt(transcript, matches);
      
      // Note: With Azure OpenAI, the model/deployment is configured in the client
      // The deployment name was set when initializing the AzureOpenAI client
      const response = await this.openai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are a surgical sales coach - you speak rarely but with high precision and impact.

ONLY suggest when ALL of these conditions are true:
1. The customer just said something that DIRECTLY relates to the suggestion
2. This is a PIVOTAL moment - an objection, question, pain point, or decision point
3. The salesperson would clearly benefit from this information RIGHT NOW
4. The suggestion would feel natural and helpful, not intrusive

Signs you should NOT suggest:
- General conversation or small talk
- The salesperson is already handling the situation well
- The topic was mentioned in passing, not as a main focus
- It would interrupt a productive flow
- You're not highly confident this is the right moment

Be extremely conservative. When in doubt, respond {"suggest": false, "confidence": 0}.
A great sales coach speaks 2-3 times per 30-minute call, not every minute.

PRIORITIES:
- Discovery questions: When the customer reveals a need, challenge, or goal
- Case studies: When discussing specific use cases, challenges, or comparing solutions
- Proof points: When the customer expresses skepticism, asks for evidence, or needs validation

Respond ONLY with valid JSON:
{"suggest": true, "confidence": 0.85, "type": "discovery|case_study|proof_point", "id": "the_item_id", "trigger": "the specific words/phrase from the CUSTOMER'S conversation that matched - NOT the question or suggestion text", "reasoning": "brief explanation"}
or
{"suggest": false, "confidence": 0}

IMPORTANT: The "trigger" field must contain the actual words spoken in the conversation that prompted this suggestion (e.g., "we're looking at AI Foundry" or "our data pipelines are slow"). Do NOT put the suggestion text or question in the trigger field.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 200
      });

      const content = response.choices[0].message.content.trim();
      
      // Parse the JSON response
      let decision;
      try {
        decision = JSON.parse(content);
      } catch (e) {
        console.error('Failed to parse GPT response:', content);
        return null;
      }

      if (!decision.suggest) {
        return null;
      }

      // Require high confidence (0.80+) to show suggestion
      const confidence = decision.confidence || 0;
      if (confidence < 0.80) {
        console.log(`Suggestion rejected: confidence ${confidence} below 0.80 threshold`);
        return null;
      }

      // Find the suggested item
      let suggestion = null;
      if (decision.type === 'discovery') {
        suggestion = this.knowledgeBase.discoveryQuestions.find(dq => dq.id === decision.id);
        if (suggestion) {
          suggestion = {
            type: 'discovery',
            question: suggestion.question,
            context: suggestion.context,
            trigger: decision.trigger
          };
        }
      } else if (decision.type === 'case_study') {
        suggestion = this.knowledgeBase.caseStudies.find(cs => cs.id === decision.id);
        if (suggestion) {
          suggestion = {
            type: 'case_study',
            company: suggestion.company,
            headline: suggestion.headline,
            result: suggestion.result,
            link: suggestion.link,
            trigger: decision.trigger
          };
        }
      } else if (decision.type === 'proof_point') {
        suggestion = this.knowledgeBase.proofPoints.find(pp => pp.id === decision.id);
        if (suggestion) {
          suggestion = {
            type: 'proof_point',
            stat: suggestion.stat,
            source: suggestion.source,
            link: suggestion.link,
            trigger: decision.trigger
          };
        }
      }

      if (suggestion) {
        this.lastSuggestionTime = Date.now();
        this.suggestedIds.add(decision.id);
        // Record to session history
        this.recordSuggestion(suggestion, decision.id);
      }

      return suggestion;

    } catch (error) {
      console.error('Error getting suggestion from Azure OpenAI:', error);
      return null;
    }
  }

  buildPrompt(transcript, matches) {
    let prompt = `RECENT CONVERSATION:\n"${transcript.slice(-1000)}"\n\n`;
    prompt += `AVAILABLE SUGGESTIONS:\n\n`;

    if (matches.discoveryQuestions.length > 0) {
      prompt += `DISCOVERY QUESTIONS:\n`;
      matches.discoveryQuestions.slice(0, 3).forEach(dq => {
        prompt += `- ID: ${dq.id} | "${dq.question}" (context: ${dq.context})\n`;
      });
      prompt += '\n';
    }

    if (matches.caseStudies.length > 0) {
      prompt += `CASE STUDIES:\n`;
      matches.caseStudies.slice(0, 3).forEach(cs => {
        prompt += `- ID: ${cs.id} | ${cs.company}: ${cs.headline} - Result: ${cs.result}\n`;
      });
      prompt += '\n';
    }

    if (matches.proofPoints.length > 0) {
      prompt += `PROOF POINTS:\n`;
      matches.proofPoints.slice(0, 3).forEach(pp => {
        prompt += `- ID: ${pp.id} | ${pp.stat} (Source: ${pp.source})\n`;
      });
      prompt += '\n';
    }

    prompt += `Based on the conversation, should I show a suggestion to the salesperson? If yes, which one is most relevant RIGHT NOW?`;

    return prompt;
  }

  // Reset for new session (returns the final session data before resetting)
  reset() {
    const finalSession = this.getSessionHistory();
    this.recentTranscript = '';
    this.lastSuggestionTime = 0;
    this.suggestedIds.clear();
    this.sessionHistory = [];
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
