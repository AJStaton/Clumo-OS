// Knowledge Generator for Clumo Onboarding
// Uses GPT-4o to generate discovery questions, case studies, and proof points
// from extracted website and document content

const storage = require('./storage');
const { caseStudyKey } = require('./case-study-identity');

// Quality-dependent volume targets. These are CEILINGS the gathered content may or may not fill —
// the generators are instructed never to pad or fabricate to reach them. Overridable per-run via
// generate({ targets }) (wired from config in routes/api.js).
const DEFAULT_TARGETS = {
  discoveryQuestions: 100,
  caseStudies: 30,        // inference fallback only; the primary path is harvested/extracted stories
  proofPoints: 50,
  productTruths: 100
};
// Per-pass output token ceiling. 8000 is proven-safe across the providers we support (gpt-4o /
// gpt-4o-mini allow 16k, but some Azure deployments cap lower). Volume comes from MULTI-PASS, not
// from one huge response — so we keep each call within a safe ceiling and run continuation passes.
const GEN_MAX_TOKENS = 8000;
const GEN_INPUT_CHARS = 48000;   // per-pass input grounding budget (was 20k — see plan)
const GEN_MAX_PASSES = 3;        // continuation passes per type (bounded for runtime/cost)

class KnowledgeGenerator {
  constructor(provider, embeddingProvider = null) {
    // Accept either a provider object (with chatCompletion + generateEmbedding)
    // or a raw OpenAI client for backward compatibility
    if (provider && typeof provider.chatCompletion === 'function') {
      this.provider = provider;
      // Create a wrapped client that always includes the model
      const rawClient = provider.getClient();
      const chatModel = provider.chatModel || provider.chatDeployment || 'gpt-4o-mini';
      this.openai = {
        chat: {
          completions: {
            create: (params) => rawClient.chat.completions.create({ model: chatModel, ...params })
          }
        }
      };
    } else {
      // Raw OpenAI client passed directly (backward compat)
      this.provider = {
        chatCompletion: (messages, options) => provider.chat.completions.create({ messages, ...options }),
        getClient: () => provider
      };
      this.openai = provider;
    }
    // Optional separate embedding provider (e.g. managed mode)
    this.embeddingProvider = embeddingProvider || this.provider;
  }

  // Main generation pipeline
  async generate(websiteContent, documentContents, onProgress, options = {}) {
    const { merge = false, userId = null, sources = null, profile = null, targets: targetOverrides = {} } = options;
    const targets = { ...DEFAULT_TARGETS, ...(targetOverrides || {}) };

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

    // Type-routed sources (from the new tiered fetch/discovery pipeline). When present,
    // each generator gets its own targeted content bundle instead of one shared blob.
    if (sources) {
      if (sources.extractedCaseStudies && sources.extractedCaseStudies.length > 0) {
        extractedCaseStudies = sources.extractedCaseStudies;
        console.log(`[Knowledge Generator] ${extractedCaseStudies.length} case studies from type-routed sources`);
      }
      // Seed the shared blob from the company bundle so the fallback path still has content.
      if (sources.bundles && sources.bundles.company) {
        allContent += (allContent ? '\n' : '') + '=== WEBSITE CONTENT ===\n' + sources.bundles.company + '\n';
      }
    }

    let documentText = '';
    if (documentContents && documentContents.length > 0) {
      documentText += '\n=== UPLOADED DOCUMENTS ===\n';
      for (const doc of documentContents) {
        documentText += `\n--- ${doc.filename} ---\n`;
        documentText += doc.content + '\n';
        console.log(`[Knowledge Generator] Document "${doc.filename}": ${doc.content.length} chars extracted`);
      }
      allContent += documentText;
    }

    // Truncate to ~300k chars to fit in context window
    if (allContent.length > 300000) {
      allContent = allContent.substring(0, 300000) + '\n[Content truncated]';
      console.log(`[Knowledge Generator] Content truncated from ${allContent.length} to 300000 chars`);
    }
    console.log(`[Knowledge Generator] Total content: ${allContent.length} chars, merge mode: ${merge}, type-routed: ${!!sources}`);

    // Per-type content selection: prefer the targeted bundle, fall back to the shared blob.
    // Uploaded documents are high-trust and augment every type.
    const bundles = (sources && sources.bundles) || {};
    const pick = (bundle) => {
      const base = bundle && bundle.length > 200 ? bundle : allContent;
      return documentText ? `${base}\n${documentText}` : base;
    };
    const discoveryContent = pick(bundles.discovery);
    const proofContent = pick(bundles.proof);
    const productTruthContent = pick(bundles.productTruth);
    const caseStudyContent = pick(bundles.company);
    const profileCtx = this.buildProfileContext(profile);

    // Track which source path each type used, for telemetry/warnings.
    const typePaths = {};

    // Phase 1: Company Analysis
    if (onProgress) onProgress({ stage: 'analyzing', message: 'Analyzing your company and products...' });
    const companyAnalysis = await this.analyzeCompany(allContent, profileCtx);

    // Phase 2: Generate Discovery Questions
    if (onProgress) onProgress({ stage: 'discovery_questions', message: merge ? 'Extracting new discovery questions...' : 'Generating discovery questions...' });
    typePaths.discoveryQuestions = bundles.discovery && bundles.discovery.length > 200 ? 'primary' : 'fallback';
    const discoveryQuestions = await this.generateDiscoveryQuestions(discoveryContent, companyAnalysis, merge, profileCtx, targets.discoveryQuestions);
    console.log(`[Knowledge Generator] LLM returned ${discoveryQuestions.length} discovery questions`);

    // Phase 3: Generate Case Studies
    if (onProgress) onProgress({ stage: 'case_studies', message: merge ? 'Extracting new case studies...' : 'Creating case studies...' });
    typePaths.caseStudies = (extractedCaseStudies && extractedCaseStudies.length > 0) ? 'primary' : 'fallback';
    const caseStudies = await this.generateCaseStudies(caseStudyContent, companyAnalysis, merge, extractedCaseStudies, profileCtx, targets.caseStudies);
    console.log(`[Knowledge Generator] LLM returned ${caseStudies.length} case studies`);

    // Phase 4: Generate Proof Points
    if (onProgress) onProgress({ stage: 'proof_points', message: merge ? 'Extracting new proof points...' : 'Building proof points...' });
    typePaths.proofPoints = bundles.proof && bundles.proof.length > 200 ? 'primary' : 'fallback';
    const proofPoints = await this.generateProofPoints(proofContent, companyAnalysis, merge, profileCtx, targets.proofPoints);
    console.log(`[Knowledge Generator] LLM returned ${proofPoints.length} proof points`);

    // Phase 4b: Generate Product Truths
    if (onProgress) onProgress({ stage: 'product_truths', message: merge ? 'Extracting new product truths...' : 'Building product truths...' });
    typePaths.productTruths = bundles.productTruth && bundles.productTruth.length > 200 ? 'primary' : 'fallback';
    const productTruths = await this.generateProductTruths(productTruthContent, companyAnalysis, merge, profileCtx, targets.productTruths);
    console.log(`[Knowledge Generator] LLM returned ${productTruths.length} product truths`);

    // Phase 5: Generate embeddings for all KB items
    if (this.embeddingProvider && typeof this.embeddingProvider.generateEmbedding === 'function') {
      if (onProgress) onProgress({ stage: 'embeddings', message: 'Generating embeddings...' });
      await this.generateEmbeddings(discoveryQuestions, caseStudies, proofPoints, productTruths);
      console.log(`[Knowledge Generator] Embeddings generated for ${discoveryQuestions.length} DQs, ${caseStudies.length} CSs, ${proofPoints.length} PPs, ${productTruths.length} PTs`);
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
      proofPoints,
      productTruths
    };

    // Persist completeness metadata so the KB page can show source coverage + warnings.
    const completeness = {
      generatedAt: knowledgeBase.generatedAt,
      typePaths,
      coverage: (sources && sources.coverage) || null,
      profile: profile || null
    };
    knowledgeBase.meta = Object.assign({}, knowledgeBase.meta, { completeness });

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
        pp: knowledgeBase.proofPoints.length,
        pt: knowledgeBase.productTruths.length
      };
      knowledgeBase = await this.mergeWithExisting(knowledgeBase, userId);
      console.log(`[Knowledge Generator] Before merge: ${beforeMerge.dq} DQs, ${beforeMerge.cs} CSs, ${beforeMerge.pp} PPs, ${beforeMerge.pt} PTs`);
      console.log(`[Knowledge Generator] After merge+dedup: ${knowledgeBase.discoveryQuestions.length} DQs, ${knowledgeBase.caseStudies.length} CSs, ${knowledgeBase.proofPoints.length} PPs, ${(knowledgeBase.productTruths || []).length} PTs`);
    }

    // Save to local storage
    storage.saveKB(knowledgeBase);

    if (onProgress) onProgress({
      stage: 'complete',
      message: 'Knowledge base generated successfully!',
      counts: {
        discoveryQuestions: knowledgeBase.discoveryQuestions.length,
        caseStudies: knowledgeBase.caseStudies.length,
        proofPoints: knowledgeBase.proofPoints.length,
        productTruths: knowledgeBase.productTruths.length
      },
      coverage: (sources && sources.coverage) || null,
      typePaths
    });

    return {
      counts: {
        discoveryQuestions: knowledgeBase.discoveryQuestions.length,
        caseStudies: knowledgeBase.caseStudies.length,
        proofPoints: knowledgeBase.proofPoints.length,
        productTruths: knowledgeBase.productTruths.length
      },
      coverage: (sources && sources.coverage) || null,
      typePaths
    };
  }

  // Build a compact "who you sell to" context block from the optional onboarding profile.
  // Threaded into company analysis + each generator so questions/proof points are tuned
  // to the seller's personas, ICP, and competitive set.
  buildProfileContext(profile) {
    if (!profile || typeof profile !== 'object') return '';
    const lines = [];
    const personas = Array.isArray(profile.personas) ? profile.personas.filter(Boolean) : [];
    const competitors = Array.isArray(profile.competitors) ? profile.competitors.filter(Boolean) : [];
    const focusProducts = Array.isArray(profile.focusProducts) ? profile.focusProducts.filter(Boolean) : [];
    const focusIndustries = Array.isArray(profile.focusIndustries) ? profile.focusIndustries.filter(Boolean) : [];
    const companySize = Array.isArray(profile.companySize) ? profile.companySize.filter(Boolean) : [];
    const priorities = Array.isArray(profile.priorities) ? profile.priorities.filter(Boolean) : [];
    if (profile.role) lines.push(`Seller's role: ${profile.role}`);
    if (focusProducts.length) lines.push(`Products they sell / focus on: ${focusProducts.join(', ')}`);
    if (priorities.length) lines.push(`Prioritised product/solution areas for this knowledge base: ${priorities.join(', ')}`);
    if (personas.length) lines.push(`Target buyer personas: ${personas.join(', ')}`);
    if (focusIndustries.length) lines.push(`Target industries: ${focusIndustries.join(', ')}`);
    else if (profile.icpIndustry) lines.push(`Ideal customer industry: ${profile.icpIndustry}`);
    if (companySize.length) lines.push(`Target company size: ${companySize.join(', ')}`);
    else if (profile.icpCompanySize) lines.push(`Ideal customer size: ${profile.icpCompanySize}`);
    if (competitors.length) lines.push(`Key competitors to differentiate against: ${competitors.join(', ')}`);
    if (lines.length === 0) return '';
    return `\n\nSELLER CONTEXT (use to tailor and sharpen output):\n- ${lines.join('\n- ')}`;
  }

  // Split content into ordered chunks of ~perPassChars, capped at maxChunks. Used by multi-pass
  // generation so each continuation pass is grounded in a fresh slice of the gathered material.
  _chunkContent(content, perPassChars = GEN_INPUT_CHARS, maxChunks = GEN_MAX_PASSES) {
    const text = (content || '').toString();
    if (text.length <= perPassChars) return [text];
    const chunks = [];
    for (let i = 0; i < text.length && chunks.length < maxChunks; i += perPassChars) {
      chunks.push(text.substring(i, i + perPassChars));
    }
    return chunks;
  }

  // Build a compact "do not repeat these" block from already-collected items so continuation
  // passes add DISTINCT items instead of re-emitting the same ones.
  _avoidList(collected, identityOf) {
    if (!collected || collected.length === 0) return '';
    const ids = collected
      .map((it) => (identityOf(it) || '').toString().trim().replace(/\s+/g, ' ').slice(0, 90))
      .filter(Boolean)
      .slice(-80);
    if (ids.length === 0) return '';
    return `\n\nALREADY CAPTURED — do NOT repeat or restate these (generate only NEW, distinct items):\n- ${ids.join('\n- ')}`;
  }

  // Generic multi-pass generator. Runs continuation passes over content chunks (and re-queries the
  // last chunk with a do-not-repeat list when content is short) until the target is reached, the
  // pass budget is exhausted, or the content yields no new grounded items. Quality-dependent: it
  // never pads — if the content only supports N items, it returns N.
  //   buildSystem(remaining) -> system prompt string (should reference `remaining` as the target)
  //   userIntro              -> lead-in line for the user message (content appended after it)
  //   identityOf(item)       -> string used for dedupe + the avoid list
  async _generateItems({ buildSystem, userIntro, content, idPrefix, target, identityOf, temperature = 0.5,
    maxTokens = GEN_MAX_TOKENS, maxPasses = GEN_MAX_PASSES, perPassChars = GEN_INPUT_CHARS }) {
    const chunks = this._chunkContent(content, perPassChars, maxPasses);
    const collected = [];
    const seen = new Set();
    const keyOf = (it) => (identityOf(it) || '').toString().trim().toLowerCase().slice(0, 120);
    const add = (items) => {
      let n = 0;
      for (const it of items || []) {
        const k = keyOf(it);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        collected.push(it);
        n += 1;
      }
      return n;
    };

    let passes = 0;
    let chunkIdx = 0;
    while (collected.length < target && passes < maxPasses) {
      const chunk = chunks[Math.min(chunkIdx, chunks.length - 1)];
      const remaining = target - collected.length;
      const avoid = this._avoidList(collected, identityOf);
      let added = 0;
      try {
        const response = await this.openai.chat.completions.create({
          messages: [
            { role: 'system', content: buildSystem(remaining) },
            { role: 'user', content: `${userIntro}\n\n${chunk}${avoid}` }
          ],
          temperature,
          max_tokens: maxTokens
        });
        added = add(this.parseJsonArray(response.choices[0].message.content, idPrefix));
      } catch (e) {
        console.warn(`[Knowledge Generator] ${idPrefix} pass ${passes + 1} failed: ${e.message}`);
      }
      passes += 1;
      chunkIdx += 1;
      // Stop once every chunk has been consumed and the latest pass added nothing new
      // (the content is exhausted — never pad to hit the target).
      if (chunkIdx >= chunks.length && added === 0) break;
    }

    // Re-id sequentially so the saved KB has clean, unique ids.
    return collected.map((it, i) => ({ ...it, id: `${idPrefix}${i + 1}` }));
  }

  // Phase 1: Analyze the company from extracted content
  async analyzeCompany(content, profileCtx = '') {
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
          content: `Analyze this company:\n\n${content.substring(0, 30000)}${profileCtx}`
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
  async generateDiscoveryQuestions(content, analysis, isAdditional = false, profileCtx = '', target = DEFAULT_TARGETS.discoveryQuestions) {
    const quantityInstruction = isAdditional
      ? `Generate discovery questions that are DIRECTLY supported by specific content in the documents provided. Extract every NEW question that the content supports — including questions inspired by third-party research, industry insights, analyst findings, or market data found in the documents. These are valuable because they let a salesperson reference credible external sources during discovery. Do NOT invent questions beyond what the content supports, but DO be thorough in extracting all questions the content can ground.`
      : `Generate Challenger-style discovery questions that are DIRECTLY grounded in the provided content. Every question must be clearly supported by specific product capabilities, pain points, or value propositions found in the source material. Do NOT pad with generic or filler questions — only generate as many as the content genuinely supports.

Generate up to {{REMAINING}} NEW discovery questions in this pass (quality-dependent — fewer is fine if the content does not support more), covering all three categories below:

Category 1 — Product-Specific Pain Point Questions:
Questions that uncover pain points the product directly solves, challenge prospect assumptions about their current approach, create urgency around the problems, and guide conversations toward the product's strengths.

Category 2 — Strategic 'Big Picture' Discovery Questions:
Questions that explore the prospect's broader business strategy, long-term goals, organizational priorities, and how the problem area fits into their wider transformation or growth initiatives.

Category 3 — MEDDIC-Style Discovery Questions:
Questions focused on key metrics (how they measure success), economic impact (cost of inaction, ROI expectations), decision process (who is involved, approval steps), decision timeline (urgency, deadlines), pain points today (current challenges and workarounds), and potential competition (other solutions being evaluated).`;

    // Active tailoring: when the seller gave a profile, lead with questions framed for their exact
    // buyer/industry/segment/role — prioritisation, not exclusion (still cover the product broadly).
    const tailoring = profileCtx
      ? `\nTAILORING (prioritise, do not exclude): Lead with questions tailored to the seller's role, target buyer personas, target industries, and company segment described in SELLER CONTEXT — phrase them the way that specific buyer in that industry and segment would actually experience the problem. Then broaden to cover the rest of the product's value. Do NOT drop well-grounded questions just because they are not persona-specific.`
      : '';

    const buildSystem = (remaining) => `You are an expert sales coach specializing in the Challenger Sale methodology. Generate discovery questions that a salesperson selling ${analysis.companyName}'s product would ask prospects.

The company: ${analysis.productDescription}
Target market: ${analysis.targetMarket}
Pain points solved: ${analysis.painPointsSolved?.join(', ')}
Value propositions: ${analysis.valuePropositions?.join(', ')}
${profileCtx}
${tailoring}

${quantityInstruction.replace('{{REMAINING}}', remaining)}

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
]`;

    return this._generateItems({
      buildSystem,
      userIntro: 'Generate discovery questions based on this company content:',
      content,
      idPrefix: 'dq',
      target,
      temperature: 0.5,
      identityOf: (q) => q.question
    });
  }

  // Phase 3: Generate case studies
  async generateCaseStudies(content, analysis, isAdditional = false, extractedCaseStudies = null, profileCtx = '', target = DEFAULT_TARGETS.caseStudies) {
    // Use pre-extracted case studies from hybrid scraper if available
    if (extractedCaseStudies && extractedCaseStudies.length > 0) {
      console.log(`[Knowledge Generator] Using ${extractedCaseStudies.length} extracted case studies (hybrid scraper)`);
      return this.processExtractedCaseStudies(extractedCaseStudies);
    }
    console.log('[Knowledge Generator] No extracted case studies found, falling back to inference');

    const quantityInstruction = isAdditional
      ? `Generate case studies that are DIRECTLY supported by specific customer stories, metrics, or use cases found in the documents provided. Do NOT fabricate or infer case studies that aren't clearly described in the content. Every case study must be grounded in the provided content. Do NOT create duplicate entries for companies that already exist in the knowledge base.`
      : `Generate case study entries that are DIRECTLY grounded in the provided content. Use REAL customer stories, testimonials, and use cases found in the content. Do NOT fabricate case studies or invent customer scenarios that aren't supported by the source material. Every case study must be traceable back to something in the provided content. Generate up to {{REMAINING}} NEW case studies in this pass — only as many as the content genuinely supports (fewer is fine; never invent companies).`;

    const tailoring = profileCtx
      ? `\nTAILORING (prioritise, do not exclude): When the content contains stories matching the seller's focus products, target industries, or company segment in SELLER CONTEXT, surface those FIRST. Still include other well-grounded customer stories — do not drop a real story just because it is off-focus.`
      : '';

    const buildSystem = (remaining) => `You are a sales content specialist. Generate case study entries for ${analysis.companyName}'s sales team.

The company: ${analysis.productDescription}
Known customers/stories: ${analysis.customerStories?.join(', ')}
${profileCtx}
${tailoring}

${quantityInstruction.replace('{{REMAINING}}', remaining)}

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
]`;

    return this._generateItems({
      buildSystem,
      userIntro: 'Generate case studies from this content:',
      content,
      idPrefix: 'cs',
      target,
      temperature: 0.5,
      identityOf: (cs) => cs.company
    });
  }

  // Phase 4: Generate proof points
  async generateProofPoints(content, analysis, isAdditional = false, profileCtx = '', target = DEFAULT_TARGETS.proofPoints) {
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

Do NOT fabricate or infer proof points that aren't explicitly stated in the content. Generate up to {{REMAINING}} NEW proof points in this pass — extract every legitimate one the content supports, but never invent figures (fewer is fine if the content is thin).`;

    const tailoring = profileCtx
      ? `\nTAILORING (prioritise, do not exclude): Surface proof points relevant to the seller's focus products, target industries, and personas in SELLER CONTEXT FIRST. Still include other well-grounded proof points — do not drop a real statistic just because it is off-focus.`
      : '';

    const buildSystem = (remaining) => `You are a sales enablement specialist. Generate proof point entries for ${analysis.companyName}'s sales team.

The company: ${analysis.productDescription}
Known stats/metrics: ${analysis.keyStats?.join(', ')}
Differentiators: ${analysis.differentiators?.join(', ')}
${profileCtx}
${tailoring}

${quantityInstruction.replace('{{REMAINING}}', remaining)}

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
]`;

    return this._generateItems({
      buildSystem,
      userIntro: 'Generate proof points from this content:',
      content,
      idPrefix: 'pp',
      target,
      temperature: 0.4,
      identityOf: (pp) => pp.stat
    });
  }

  // Phase 4b: Generate Product Truths
  async generateProductTruths(content, analysis, isAdditional = false, profileCtx = '', target = DEFAULT_TARGETS.productTruths) {
    const quantityInstruction = isAdditional
      ? `Extract ALL factual product statements that are DIRECTLY supported by specific content in the documents. Focus on technical capabilities, security features, platform specifications, compliance certifications, and architectural facts.`
      : `Generate factual product truth statements that are DIRECTLY grounded in the provided content. Product truths are objective, verifiable statements about the product's capabilities, architecture, security, compliance, or performance that a salesperson can confidently state during a call.

Generate up to {{REMAINING}} NEW product truths in this pass — only as many as the content genuinely supports (fewer is fine; never invent specs), covering:
- Security & compliance features
- Platform capabilities and specifications
- Technical architecture facts
- Performance guarantees or SLAs
- Integration capabilities
- Deployment options`;

    const tailoring = profileCtx
      ? `\nTAILORING (prioritise, do not exclude): Surface product truths about the seller's focus products in SELLER CONTEXT FIRST. Still include other well-grounded facts about the product — do not drop a real capability just because it is off-focus.`
      : '';

    const buildSystem = (remaining) => `You are a sales enablement specialist. Generate product truth entries for ${analysis.companyName}'s sales team.

The company: ${analysis.productDescription}
Differentiators: ${analysis.differentiators?.join(', ')}
${profileCtx}
${tailoring}

${quantityInstruction.replace('{{REMAINING}}', remaining)}

For each product truth, generate 10-15 trigger keywords - words/phrases a PROSPECT might say when asking about capabilities or features.

TRIGGER EXAMPLES:
- Technical questions: "how does", "can it", "does it support", "what about"
- Security concerns: "security", "privacy", "compliance", "data protection"
- Platform specifics: "regions", "availability", "sla", "uptime"

Return ONLY a JSON array (no markdown):
[
  {
    "id": "pt1",
    "fact": "the factual product statement",
    "category": "Security|Platform|Infrastructure|Data|Reliability|Integration",
    "link": "source URL or file reference this fact comes from, or empty string",
    "triggers": ["keyword1", "keyword2", ...]
  }
]`;

    return this._generateItems({
      buildSystem,
      userIntro: 'Generate product truths from this content:',
      content,
      idPrefix: 'pt',
      target,
      temperature: 0.3,
      identityOf: (pt) => pt.fact
    });
  }
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
  async generateEmbeddings(discoveryQuestions, caseStudies, proofPoints, productTruths = []) {
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
    const ptTexts = productTruths.map(pt =>
      `${pt.fact} ${pt.category}`
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

    if (ptTexts.length > 0) {
      const embeddings = await embedder.generateEmbedding(ptTexts);
      for (let i = 0; i < productTruths.length; i++) {
        productTruths[i].embedding = embeddings[i];
      }
    }
  }

  // Parse a JSON array from GPT response, handling markdown code blocks
  parseJsonArray(content, idPrefix) {
    let cleaned = (content || '').trim();

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
      // Try to extract a well-formed array from the content
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          return parsed.map((item, i) => ({
            ...item,
            id: item.id || `${idPrefix}${i + 1}`
          }));
        } catch (e2) {
          // fall through to truncation salvage
        }
      }
      // Salvage: high-volume responses can be truncated mid-array (no closing ]). Recover every
      // COMPLETE top-level object so we keep what the model did finish writing.
      const salvaged = this._salvageObjects(cleaned, idPrefix);
      if (salvaged.length > 0) {
        console.warn(`[Knowledge Generator] Salvaged ${salvaged.length} ${idPrefix} items from a truncated response`);
        return salvaged;
      }
      console.error(`Failed to parse ${idPrefix} response:`, cleaned.substring(0, 200));
      return [];
    }
  }

  // Extract complete top-level {...} objects from a (possibly truncated) JSON array string by
  // tracking brace depth and ignoring braces inside strings. Drops any trailing incomplete object.
  _salvageObjects(text, idPrefix) {
    const items = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '{') { if (depth === 0) start = i; depth += 1; }
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          const chunk = text.substring(start, i + 1);
          try {
            const obj = JSON.parse(chunk);
            items.push({ ...obj, id: obj.id || `${idPrefix}${items.length + 1}` });
          } catch (e) { /* skip malformed object */ }
          start = -1;
        }
      }
    }
    return items;
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
      const maxPtId = this.getMaxId(existing.productTruths || [], 'pt');

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

      const newPt = (newKb.productTruths || []).map((pt, i) => ({
        ...pt,
        id: `pt${maxPtId + i + 1}`
      }));

      return this.deduplicate({
        companyName: existing.companyName || newKb.companyName,
        companyProfile: existing.companyProfile || newKb.companyProfile || {},
        generatedAt: new Date().toISOString(),
        meta: Object.assign({}, existing.meta, newKb.meta),
        discoveryQuestions: [...existing.discoveryQuestions, ...newDqs],
        caseStudies: [...existing.caseStudies, ...newCs],
        proofPoints: [...existing.proofPoints, ...newPp],
        productTruths: [...(existing.productTruths || []), ...newPt]
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
      (item) => caseStudyKey(item)
    );

    kb.proofPoints = this.deduplicateItems(
      kb.proofPoints,
      'pp',
      (item) => item.stat.toLowerCase().trim()
    );

    kb.productTruths = this.deduplicateItems(
      kb.productTruths || [],
      'pt',
      (item) => item.fact.toLowerCase().trim()
    );

    console.log(`[Knowledge Generator] After dedup: ${kb.discoveryQuestions.length} questions, ${kb.caseStudies.length} case studies, ${kb.proofPoints.length} proof points, ${kb.productTruths.length} product truths`);
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
