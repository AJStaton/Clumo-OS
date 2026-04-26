// Knowledge Generator for Clumo Onboarding
// Uses GPT-4o to generate discovery questions, case studies, and proof points
// from extracted website and document content

const storage = require('./storage');

class KnowledgeGenerator {
  constructor(provider, embeddingProvider = null) {
    // Accept either a provider object (with chatCompletion + generateEmbedding)
    // or a raw OpenAI client for backward compatibility
    if (provider && typeof provider.chatCompletion === 'function') {
      this.provider = provider;
      this.openai = provider.getClient();
    } else {
      this.provider = null;
      this.openai = provider;
    }
    // Optional separate embedding provider (e.g. managed mode)
    this.embeddingProvider = embeddingProvider || this.provider;
  }

  // Main generation pipeline
  async generate(websiteContent, documentContents, onProgress, options = {}) {
    const { merge = false, userId = null } = options;

    // Combine all content
    let allContent = '';
    let extractedCaseStudies = null;

    if (websiteContent && websiteContent.pages) {
      allContent += '=== WEBSITE CONTENT ===\n';
      for (const page of websiteContent.pages) {
        allContent += `\n--- ${page.title} (${page.url}) ---\n`;
        allContent += page.content + '\n';
      }

      // Keep extracted case studies as structured data (not in content string)
      if (websiteContent.extractedCaseStudies && websiteContent.extractedCaseStudies.length > 0) {
        extractedCaseStudies = websiteContent.extractedCaseStudies;
        console.log(`[Knowledge Generator] ${extractedCaseStudies.length} extracted case studies available`);
      } else {
        console.log('[Knowledge Generator] No extracted case studies available');
      }
    }

    if (documentContents && documentContents.length > 0) {
      allContent += '\n=== UPLOADED DOCUMENTS ===\n';
      for (const doc of documentContents) {
        allContent += `\n--- ${doc.filename} ---\n`;
        allContent += doc.content + '\n';
        console.log(`[Knowledge Generator] Document "${doc.filename}": ${doc.content.length} chars extracted`);
      }
    }

    // Truncate to ~300k chars to fit in context window
    if (allContent.length > 300000) {
      allContent = allContent.substring(0, 300000) + '\n[Content truncated]';
      console.log(`[Knowledge Generator] Content truncated from ${allContent.length} to 300000 chars`);
    }
    console.log(`[Knowledge Generator] Total content: ${allContent.length} chars, merge mode: ${merge}`);

    // Phase 1: Company Analysis
    if (onProgress) onProgress({ stage: 'analyzing', message: 'Analyzing your company and products...' });
    const companyAnalysis = await this.analyzeCompany(allContent);

    // Phase 2: Generate Discovery Questions
    if (onProgress) onProgress({ stage: 'discovery_questions', message: merge ? 'Extracting new discovery questions...' : 'Generating discovery questions...' });
    const discoveryQuestions = await this.generateDiscoveryQuestions(allContent, companyAnalysis, merge);
    console.log(`[Knowledge Generator] LLM returned ${discoveryQuestions.length} discovery questions`);

    // Phase 3: Generate Case Studies
    if (onProgress) onProgress({ stage: 'case_studies', message: merge ? 'Extracting new case studies...' : 'Creating case studies...' });
    const caseStudies = await this.generateCaseStudies(allContent, companyAnalysis, merge, extractedCaseStudies);
    console.log(`[Knowledge Generator] LLM returned ${caseStudies.length} case studies`);

    // Phase 4: Generate Proof Points
    if (onProgress) onProgress({ stage: 'proof_points', message: merge ? 'Extracting new proof points...' : 'Building proof points...' });
    const proofPoints = await this.generateProofPoints(allContent, companyAnalysis, merge);
    console.log(`[Knowledge Generator] LLM returned ${proofPoints.length} proof points`);

    // Phase 5: Generate embeddings for all KB items
    if (this.embeddingProvider && typeof this.embeddingProvider.generateEmbedding === 'function') {
      if (onProgress) onProgress({ stage: 'embeddings', message: 'Generating embeddings...' });
      await this.generateEmbeddings(discoveryQuestions, caseStudies, proofPoints);
      console.log(`[Knowledge Generator] Embeddings generated for ${discoveryQuestions.length} DQs, ${caseStudies.length} CSs, ${proofPoints.length} PPs`);
    }

    let knowledgeBase = {
      companyName: companyAnalysis.companyName || 'Unknown',
      companyProfile: {
        productDescription: companyAnalysis.productDescription || '',
        targetMarket: companyAnalysis.targetMarket || '',
        industry: companyAnalysis.industry || '',
        valuePropositions: companyAnalysis.valuePropositions || [],
        painPointsSolved: companyAnalysis.painPointsSolved || [],
        differentiators: companyAnalysis.differentiators || []
      },
      generatedAt: new Date().toISOString(),
      caseStudies,
      discoveryQuestions,
      proofPoints
    };

    // If not merging, delete existing KB first
    if (!merge) {
      try {
        storage.deleteKB();
        console.log('[Knowledge Generator] Deleted existing KB before regeneration');
      } catch (e) {
        console.warn('[Knowledge Generator] Could not delete existing KB:', e.message);
      }
    }

    // If merge mode, combine with existing KB
    if (merge) {
      const beforeMerge = {
        dq: knowledgeBase.discoveryQuestions.length,
        cs: knowledgeBase.caseStudies.length,
        pp: knowledgeBase.proofPoints.length
      };
      knowledgeBase = await this.mergeWithExisting(knowledgeBase, userId);
      console.log(`[Knowledge Generator] Before merge: ${beforeMerge.dq} DQs, ${beforeMerge.cs} CSs, ${beforeMerge.pp} PPs`);
      console.log(`[Knowledge Generator] After merge+dedup: ${knowledgeBase.discoveryQuestions.length} DQs, ${knowledgeBase.caseStudies.length} CSs, ${knowledgeBase.proofPoints.length} PPs`);
    }

    // Save to local storage
    storage.saveKB(knowledgeBase);

    if (onProgress) onProgress({
      stage: 'complete',
      message: 'Knowledge base generated successfully!',
      counts: {
        discoveryQuestions: knowledgeBase.discoveryQuestions.length,
        caseStudies: knowledgeBase.caseStudies.length,
        proofPoints: knowledgeBase.proofPoints.length
      }
    });

    return {
      counts: {
        discoveryQuestions: knowledgeBase.discoveryQuestions.length,
        caseStudies: knowledgeBase.caseStudies.length,
        proofPoints: knowledgeBase.proofPoints.length
      }
    };
  }

  // Phase 1: Analyze the company from extracted content
  async analyzeCompany(content) {
    const response = await this.openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a business analyst. Analyze the provided website and document content to understand the company. Return a JSON object with:
{
  "companyName": "the company name",
  "productDescription": "what the company sells/offers (2-3 sentences)",
  "targetMarket": "who their ideal customers are",
  "valuePropositions": ["key value prop 1", "key value prop 2", ...],
  "painPointsSolved": ["pain point 1", "pain point 2", ...],
  "differentiators": ["differentiator 1", "differentiator 2", ...],
  "customerStories": ["any customer names or testimonials found"],
  "keyStats": ["any statistics, metrics, or proof points found"],
  "industry": "primary industry/vertical"
}
Return ONLY valid JSON, no markdown formatting.`
        },
        {
          role: 'user',
          content: `Analyze this company:\n\n${content.substring(0, 30000)}`
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    try {
      return JSON.parse(response.choices[0].message.content.trim());
    } catch (e) {
      // Try to extract JSON from the response
      const match = response.choices[0].message.content.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
      return { companyName: 'Unknown', productDescription: '', targetMarket: '', valuePropositions: [], painPointsSolved: [], differentiators: [], customerStories: [], keyStats: [], industry: '' };
    }
  }

  // Phase 2: Generate discovery questions
  async generateDiscoveryQuestions(content, analysis, isAdditional = false) {
    const quantityInstruction = isAdditional
      ? `Generate discovery questions that are DIRECTLY supported by specific content in the documents provided. Extract every question that the content supports — including questions inspired by third-party research, industry insights, analyst findings, or market data found in the documents. These are valuable because they let a salesperson reference credible external sources during discovery. Do NOT invent questions beyond what the content supports, but DO be thorough in extracting all questions the content can ground.`
      : `Generate Challenger-style discovery questions that are DIRECTLY grounded in the provided content. Every question must be clearly supported by specific product capabilities, pain points, or value propositions found in the source material. Do NOT pad with generic or filler questions — quality over quantity.

Aim for a minimum of 30 discovery questions covering all three categories below:

Category 1 — Product-Specific Pain Point Questions:
Questions that uncover pain points the product directly solves, challenge prospect assumptions about their current approach, create urgency around the problems, and guide conversations toward the product's strengths.

Category 2 — Strategic 'Big Picture' Discovery Questions:
Questions that explore the prospect's broader business strategy, long-term goals, organizational priorities, and how the problem area fits into their wider transformation or growth initiatives.

Category 3 — MEDDIC-Style Discovery Questions:
Questions focused on key metrics (how they measure success), economic impact (cost of inaction, ROI expectations), decision process (who is involved, approval steps), decision timeline (urgency, deadlines), pain points today (current challenges and workarounds), and potential competition (other solutions being evaluated).`;

    const response = await this.openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are an expert sales coach specializing in the Challenger Sale methodology. Generate discovery questions that a salesperson selling ${analysis.companyName}'s product would ask prospects.

The company: ${analysis.productDescription}
Target market: ${analysis.targetMarket}
Pain points solved: ${analysis.painPointsSolved?.join(', ')}
Value propositions: ${analysis.valuePropositions?.join(', ')}

${quantityInstruction}

For each question, generate 15-20 trigger keywords - individual words and short phrases a PROSPECT might say during a sales call that would make this question relevant.

TRIGGER RULES (follow strictly):
- MOSTLY single words: "hiring", "retention", "skills", "analytics", "onboarding", "recruiting", "attrition", "automation"
- Include synonyms and related terms: e.g. for "data" → "metrics", "analytics", "reporting", "insights", "tracking", "visibility"
- Occasionally 2-word phrases are fine but keep them short and natural: "talent pipeline", "skills gap", "time to hire"
- Include acronyms and common shorthand: "ATS", "HCM", "ROI", "KPI", "AI", "ML"
- Cover the full semantic space: the problem, the solution, the outcome, and how prospects describe it informally
- AVOID generic filler like "HR technology solutions", "data-driven decisions", "strategic planning" — be specific

GOOD TRIGGER EXAMPLE: ["hiring", "attrition", "retention", "turnover", "skills", "gap", "upskilling", "reskilling", "talent", "pipeline", "ATS", "sourcing", "recruiting", "onboarding", "mobility"]
BAD TRIGGER EXAMPLE: ["talent acquisition strategy", "skills-based approach", "HR technology solutions", "data-driven decisions", "workforce optimization"]

Return ONLY a JSON array (no markdown):
[
  {
    "id": "dq1",
    "question": "the question text",
    "context": "why this question is valuable and what it uncovers",
    "triggers": ["keyword1", "keyword2", "phrase variation", "related term", "synonym", ...]
  }
]`
        },
        {
          role: 'user',
          content: `Generate discovery questions based on this company content:\n\n${content.substring(0, 20000)}`
        }
      ],
      temperature: 0.5,
      max_tokens: 8000
    });

    return this.parseJsonArray(response.choices[0].message.content, 'dq');
  }

  // Phase 3: Generate case studies
  async generateCaseStudies(content, analysis, isAdditional = false, extractedCaseStudies = null) {
    // Use pre-extracted case studies from hybrid scraper if available
    if (extractedCaseStudies && extractedCaseStudies.length > 0) {
      console.log(`[Knowledge Generator] Using ${extractedCaseStudies.length} extracted case studies (hybrid scraper)`);
      return this.processExtractedCaseStudies(extractedCaseStudies);
    }
    console.log('[Knowledge Generator] No extracted case studies found, falling back to inference');

    const quantityInstruction = isAdditional
      ? `Generate case studies that are DIRECTLY supported by specific customer stories, metrics, or use cases found in the documents provided. Do NOT fabricate or infer case studies that aren't clearly described in the content. Every case study must be grounded in the provided content. Do NOT create duplicate entries for companies that already exist in the knowledge base.`
      : `Generate case study entries that are DIRECTLY grounded in the provided content. Use REAL customer stories, testimonials, and use cases found in the content. Do NOT fabricate case studies or invent customer scenarios that aren't supported by the source material. Every case study must be traceable back to something in the provided content. Quality over quantity. Aim for a minimum of 15 case studies.`;

    const response = await this.openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a sales content specialist. Generate case study entries for ${analysis.companyName}'s sales team.

The company: ${analysis.productDescription}
Known customers/stories: ${analysis.customerStories?.join(', ')}

${quantityInstruction}

CRITICAL RULES:
1. "company" MUST be the company/organization name (e.g. "Salesforce", "Wells Fargo", "Hilti"). NEVER use a person's name. If the content mentions "John Smith at Acme Corp", the company is "Acme Corp".
2. Each company should appear ONLY ONCE. If you find multiple quotes or stories from the same company, combine them into one case study entry.
3. "solution" MUST reference specific products, features, or capabilities by name (e.g. "Implemented Beamery's Talent CRM with AI-powered skills matching" not "Used the platform to improve hiring").
4. "result" MUST include specific metrics, numbers, or quantifiable outcomes (e.g. "700% increase in military job seekers", "25% faster performance milestones", "$260M projected savings"). If the content provides a metric, use it. If no specific metric exists, describe a concrete measurable outcome.
5. "link" CRITICAL - Look for URLs in the "CASE STUDY LINKS FOUND" section. Match company names to URLs by searching for the company name (or slug version) in the URL path. For example:
   - For "Salesforce" → look for URLs containing "salesforce" like "https://beamery.com/.../salesforce-success-story"
   - For "Wells Fargo" → look for URLs containing "wells-fargo" or "wellsfargo"
   - For "Hilti" → look for URLs containing "hilti"
   If you find a matching URL, use the FULL URL. Only use empty string "" if absolutely no matching URL exists.
6. "headline" should be short and compelling, leading with a metric or outcome when possible (e.g. "Media Agency Reduces Insights Time by 90%").

TRIGGER KEYWORD RULES:
- Triggers should be mostly SINGLE words that a prospect might say on a call
- E.g Prefer: "hiring", "retention", "skills", "analytics", "onboarding", "recruiting"
- E.g Avoid: "skills-based hiring strategy", "talent acquisition process", "HR technology solutions"
- Include industry terms, pain point words, product names, and simple synonyms
- 15-20 triggers per case study, mostly 1 word, occasionally 2 words max

GOOD TRIGGER EXAMPLE: ["media", "advertising", "marketing", "agency", "analytics", "insights", "reporting", "campaign", "copilot", "forecasting", "budget"]
BAD TRIGGER EXAMPLE: ["talent acquisition strategy", "skills-based approach", "HR technology solutions", "data-driven decisions", "workforce optimization"]

Return ONLY a JSON array (no markdown):
[
  {
    "id": "cs1",
    "company": "Customer Company Name",
    "headline": "Short Compelling Headline with Metric",
    "problem": "Specific problem/challenge they faced with concrete details",
    "solution": "How ${analysis.companyName}'s specific products/features helped — name the products",
    "result": "Specific quantifiable outcome (numbers, percentages, dollar amounts)",
    "link": "https://full-url-if-available or empty string",
    "triggers": ["single", "word", "triggers", "mostly", ...]
  }
]`
        },
        {
          role: 'user',
          content: `Generate case studies from this content:\n\n${content.substring(0, 40000)}`
        }
      ],
      temperature: 0.5,
      max_tokens: 8000
    });

    return this.parseJsonArray(response.choices[0].message.content, 'cs');
  }

  // Phase 4: Generate proof points
  async generateProofPoints(content, analysis, isAdditional = false) {
    const quantityInstruction = isAdditional
      ? `Extract ALL proof points that are DIRECTLY supported by specific statistics, metrics, research findings, analyst insights, awards, or verifiable claims found in the documents provided. This includes:
- Industry research and analyst reports (e.g. IDC, Gartner, Forrester, McKinsey) — these are HIGH-VALUE proof points for sales conversations
- Third-party statistics about market trends, challenges, or opportunities relevant to ${analysis.companyName}'s market
- Any quantified claims, percentages, dollar amounts, or survey findings
- Awards, rankings, or analyst recognitions

Do NOT fabricate or infer proof points that aren't explicitly stated in the content. But DO extract every legitimate statistic, finding, or data point — even if it comes from a third-party source rather than ${analysis.companyName} directly. Third-party validation is extremely valuable in sales.`
      : `Generate proof points that are DIRECTLY supported by specific claims found in the provided content. Only include:
- Statistics and metrics explicitly stated in the content
- Awards, analyst mentions, certifications actually referenced
- Customer count, uptime, performance claims that are verifiable from the source
- Industry recognition or rankings specifically mentioned
- Quantifiable achievements directly cited

Do NOT fabricate or infer proof points that aren't explicitly stated in the content. Quality over quantity. Aim for a minimum of 10 proof points.`;

    const response = await this.openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a sales enablement specialist. Generate proof point entries for ${analysis.companyName}'s sales team.

The company: ${analysis.productDescription}
Known stats/metrics: ${analysis.keyStats?.join(', ')}
Differentiators: ${analysis.differentiators?.join(', ')}

${quantityInstruction}

For each proof point, generate 15-20 trigger keywords - words/phrases a PROSPECT might say when they need validation or evidence.

TRIGGER EXAMPLES (match this style):
- Skepticism: "how do I know", "prove it", "evidence", "show me", "proof"
- Comparisons: "versus", "vs", "compared to", "compare", "better than", "why you"
- Topic keywords: "ai", "gartner", "leader", "analyst", "customers", "trust"
- Validation needs: "reliable", "proven", "track record", "references", "case study"
- Mix of all types for 15-20 comprehensive triggers

Return ONLY a JSON array (no markdown):
[
  {
    "id": "pp1",
    "stat": "the statistic or proof point statement",
    "source": "where this data comes from",
    "link": "",
    "triggers": ["skepticism phrase", "comparison", "topic keyword", "validation need", "variation", ...]
  }
]`
        },
        {
          role: 'user',
          content: `Generate proof points from this content:\n\n${content.substring(0, 20000)}`
        }
      ],
      temperature: 0.4,
      max_tokens: 4000
    });

    return this.parseJsonArray(response.choices[0].message.content, 'pp');
  }

  // Process pre-extracted case studies from the hybrid scraper
  processExtractedCaseStudies(extractedCaseStudies) {
    try {
      if (!Array.isArray(extractedCaseStudies)) return [];

      return extractedCaseStudies.map((cs, i) => ({
        id: cs.id || `cs${i + 1}`,
        company: cs.company || 'Unknown',
        headline: cs.headline || '',
        problem: cs.problem || '',
        solution: cs.solution || '',
        result: cs.result || '',
        link: cs.link || '',
        triggers: cs.triggers || []
      }));
    } catch (e) {
      console.error('[Knowledge Generator] Failed to process extracted case studies:', e.message);
      return [];
    }
  }

  // Generate embeddings for all KB items using the provider
  async generateEmbeddings(discoveryQuestions, caseStudies, proofPoints) {
    // Build semantic text for each item type
    const dqTexts = discoveryQuestions.map(dq =>
      `${dq.question} ${dq.context || ''}`
    );
    const csTexts = caseStudies.map(cs =>
      `${cs.company} ${cs.headline} ${cs.problem} ${cs.solution} ${cs.result}`
    );
    const ppTexts = proofPoints.map(pp =>
      `${pp.stat} ${pp.source}`
    );

    // Batch embed each type (OpenAI supports array input)
    const embedder = this.embeddingProvider;
    if (dqTexts.length > 0) {
      const embeddings = await embedder.generateEmbedding(dqTexts);
      for (let i = 0; i < discoveryQuestions.length; i++) {
        discoveryQuestions[i].embedding = embeddings[i];
      }
    }

    if (csTexts.length > 0) {
      const embeddings = await embedder.generateEmbedding(csTexts);
      for (let i = 0; i < caseStudies.length; i++) {
        caseStudies[i].embedding = embeddings[i];
      }
    }

    if (ppTexts.length > 0) {
      const embeddings = await embedder.generateEmbedding(ppTexts);
      for (let i = 0; i < proofPoints.length; i++) {
        proofPoints[i].embedding = embeddings[i];
      }
    }
  }

  // Parse a JSON array from GPT response, handling markdown code blocks
  parseJsonArray(content, idPrefix) {
    let cleaned = content.trim();

    // Remove markdown code blocks if present
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        // Ensure IDs are properly set
        return parsed.map((item, i) => ({
          ...item,
          id: item.id || `${idPrefix}${i + 1}`
        }));
      }
      return [];
    } catch (e) {
      // Try to extract array from the content
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          return parsed.map((item, i) => ({
            ...item,
            id: item.id || `${idPrefix}${i + 1}`
          }));
        } catch (e2) {
          console.error(`Failed to parse ${idPrefix} response:`, cleaned.substring(0, 200));
          return [];
        }
      }
      console.error(`Failed to parse ${idPrefix} response:`, cleaned.substring(0, 200));
      return [];
    }
  }

  // Merge new KB items with existing KB (for additional uploads)
  async mergeWithExisting(newKb, userId) {
    try {
      const existing = storage.loadKB();
      if (!existing) return newKb;

      // Find max IDs from existing KB
      const maxDqId = this.getMaxId(existing.discoveryQuestions, 'dq');
      const maxCsId = this.getMaxId(existing.caseStudies, 'cs');
      const maxPpId = this.getMaxId(existing.proofPoints, 'pp');

      // Re-number new items to avoid ID conflicts
      const newDqs = newKb.discoveryQuestions.map((dq, i) => ({
        ...dq,
        id: `dq${maxDqId + i + 1}`
      }));

      const newCs = newKb.caseStudies.map((cs, i) => ({
        ...cs,
        id: `cs${maxCsId + i + 1}`
      }));

      const newPp = newKb.proofPoints.map((pp, i) => ({
        ...pp,
        id: `pp${maxPpId + i + 1}`
      }));

      return this.deduplicate({
        companyName: existing.companyName || newKb.companyName,
        companyProfile: existing.companyProfile || newKb.companyProfile || {},
        generatedAt: new Date().toISOString(),
        discoveryQuestions: [...existing.discoveryQuestions, ...newDqs],
        caseStudies: [...existing.caseStudies, ...newCs],
        proofPoints: [...existing.proofPoints, ...newPp]
      });
    } catch (e) {
      return newKb;
    }
  }

  // Deduplicate all knowledge base sections
  deduplicate(kb) {
    kb.discoveryQuestions = this.deduplicateItems(
      kb.discoveryQuestions,
      'dq',
      (item) => item.question.toLowerCase().trim()
    );

    kb.caseStudies = this.deduplicateItems(
      kb.caseStudies,
      'cs',
      (item) => item.company.toLowerCase().trim()
    );

    kb.proofPoints = this.deduplicateItems(
      kb.proofPoints,
      'pp',
      (item) => item.stat.toLowerCase().trim()
    );

    console.log(`[Knowledge Generator] After dedup: ${kb.discoveryQuestions.length} questions, ${kb.caseStudies.length} case studies, ${kb.proofPoints.length} proof points`);
    return kb;
  }

  // Deduplicate an array of items by a key function, keeping the most complete entry
  deduplicateItems(items, prefix, keyFn) {
    const seen = new Map();

    for (const item of items) {
      const key = keyFn(item);
      const existing = seen.get(key);

      if (!existing) {
        seen.set(key, item);
      } else {
        // Keep whichever has more non-empty fields
        const existingScore = this.itemCompleteness(existing);
        const newScore = this.itemCompleteness(item);
        if (newScore > existingScore) {
          seen.set(key, item);
        }
      }
    }

    // Re-number IDs sequentially
    return Array.from(seen.values()).map((item, i) => ({
      ...item,
      id: `${prefix}${i + 1}`
    }));
  }

  // Score how many non-empty fields an item has
  itemCompleteness(item) {
    let score = 0;
    for (const [key, val] of Object.entries(item)) {
      if (key === 'id' || key === 'triggers') continue;
      if (typeof val === 'string' && val.trim().length > 0) score += 1;
    }
    // Bonus for having triggers
    if (item.triggers && item.triggers.length > 5) score += 1;
    // Bonus for having a link
    if (item.link && item.link.trim().length > 0) score += 2;
    return score;
  }

  // Get the highest numeric ID from an array of items
  getMaxId(items, prefix) {
    if (!items || items.length === 0) return 0;
    return Math.max(...items.map(item => {
      const num = parseInt(item.id.replace(prefix, ''), 10);
      return isNaN(num) ? 0 : num;
    }));
  }
}

module.exports = KnowledgeGenerator;
