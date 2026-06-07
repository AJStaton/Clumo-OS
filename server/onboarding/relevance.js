// Case-study relevance scoring.
//
// Given a seller's context (what they sell, who they sell to, and the product/solution
// priorities they picked during onboarding), score how relevant a discovered case study is.
// This is what stops a single topic (e.g. SAP-on-Azure stories) from dominating the knowledge
// base when the seller is actually focused on something else.
//
// Deliberately lightweight + deterministic: weighted keyword/phrase matching, no embeddings or
// network calls. Local-first and cheap, and it reuses content already fetched for extraction.

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'their', 'our', 'your', 'you', 'are',
  'was', 'were', 'has', 'have', 'had', 'can', 'will', 'how', 'why', 'what', 'who', 'use', 'using',
  'into', 'about', 'inc', 'ltd', 'llc', 'corp', 'company', 'customer', 'customers', 'story',
  'stories', 'case', 'study', 'studies', 'solution', 'solutions', 'platform'
]);

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function cleanTerms(list) {
  if (!Array.isArray(list)) return [];
  return list.map((s) => (s || '').toString().trim().toLowerCase()).filter(Boolean);
}

// Build a weighted term set from the seller context. Higher weight = stronger relevance signal.
//   priorities       (weight 3) — the product/solution areas the user explicitly chose
//   focusProducts    (weight 3) — what they sell
//   focusIndustries  (weight 2) — who they sell to (industry)
//   personas         (weight 1) — buyer roles
//   companyKeywords  (weight 1) — derived from the company's own site
// Returns { terms: [{ term, tokens, weight }], totalWeight }.
function buildRelevanceContext({ priorities = [], focusProducts = [], focusIndustries = [], personas = [], companyKeywords = [] } = {}) {
  const groups = [
    [priorities, 3],
    [focusProducts, 3],
    [focusIndustries, 2],
    [personas, 1],
    [companyKeywords, 1]
  ];
  const terms = [];
  const seen = new Set();
  let totalWeight = 0;
  for (const [list, weight] of groups) {
    for (const raw of cleanTerms(list)) {
      if (seen.has(raw)) continue;
      seen.add(raw);
      const tokens = tokenize(raw);
      if (tokens.length === 0) continue;
      terms.push({ term: raw, tokens, weight });
      totalWeight += weight;
    }
  }
  return { terms, totalWeight };
}

function hasContext(ctx) {
  return !!(ctx && ctx.totalWeight > 0 && ctx.terms.length > 0);
}

// Score a case study against the context. Returns a number in [0,1], or null when there is no
// context to score against (caller should then preserve discovery order — no ranking).
//   item: { text, title, url }
function scoreCaseStudyRelevance(item, ctx) {
  if (!hasContext(ctx)) return null;
  const text = `${item.title || ''} ${item.text || ''}`.toLowerCase();
  const hayTokens = new Set(tokenize(text));
  const path = (() => { try { return new URL(item.url).pathname.toLowerCase(); } catch { return (item.url || '').toLowerCase(); } })();

  let matched = 0;
  let urlBonus = 0;
  for (const t of ctx.terms) {
    // A term matches if its phrase appears in the body, or all of its tokens appear.
    const phraseHit = t.term.includes(' ') && text.includes(t.term);
    const tokenHit = t.tokens.every((tok) => hayTokens.has(tok));
    if (phraseHit || tokenHit) matched += t.weight;
    // A slug/url match is an independent signal the story is about this product/industry —
    // it counts even when the fetched body text is thin (e.g. JS-heavy story pages).
    if (t.tokens.some((tok) => tok.length >= 3 && path.includes(tok))) urlBonus += 0.15 * (t.weight / 3);
  }

  const base = matched / ctx.totalWeight;
  return Math.max(0, Math.min(1, base + urlBonus));
}

module.exports = { buildRelevanceContext, scoreCaseStudyRelevance, tokenize, hasContext };
