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

// Collapse a simple English plural to its singular so "services" matches "service" and
// "copilots" matches "copilot". Deliberately conservative (only trailing -s on longer tokens)
// to keep matching generic without a per-vendor synonym list.
function singular(tok) {
  return (tok && tok.length > 3 && tok.endsWith('s') && !tok.endsWith('ss')) ? tok.slice(0, -1) : tok;
}

function cleanTerms(list) {
  if (!Array.isArray(list)) return [];
  return list.map((s) => (s || '').toString().trim().toLowerCase()).filter(Boolean);
}

// Build a weighted term set from the seller context. Higher weight = stronger relevance signal.
//   priorities       (weight 3, FOCUS) — the product/solution areas the user explicitly chose
//   focusProducts    (weight 3, FOCUS) — what they sell
//   focusIndustries  (weight 2, FOCUS) — who they sell to (industry)
//   personas         (weight 1)        — buyer roles (ranking signal, not a focus gate)
//   companyKeywords  (weight 1)        — derived from the company's own site (weak ranking signal)
// "FOCUS" terms are the ones a story must hit to count as on-topic when the seller gave explicit
// focus. personas + companyKeywords help ranking but are generic enough that they must NOT, on
// their own, qualify an off-topic story (the SAP-on-Azure-when-you-sell-Foundry failure mode).
// Returns { terms: [{ term, tokens, weight, isFocus }], totalWeight, focusCount }.
function buildRelevanceContext({ priorities = [], focusProducts = [], focusIndustries = [], personas = [], companyKeywords = [] } = {}) {
  const groups = [
    [priorities, 3, true],
    [focusProducts, 3, true],
    [focusIndustries, 2, true],
    [personas, 1, false],
    [companyKeywords, 1, false]
  ];
  const terms = [];
  const seen = new Set();
  let totalWeight = 0;
  let focusCount = 0;
  for (const [list, weight, isFocus] of groups) {
    for (const raw of cleanTerms(list)) {
      if (seen.has(raw)) continue;
      seen.add(raw);
      const tokens = tokenize(raw);
      if (tokens.length === 0) continue;
      terms.push({ term: raw, tokens, weight, isFocus });
      totalWeight += weight;
      if (isFocus) focusCount += 1;
    }
  }
  return { terms, totalWeight, focusCount };
}

function hasContext(ctx) {
  return !!(ctx && ctx.totalWeight > 0 && ctx.terms.length > 0);
}

// Detailed scoring. Returns { score, matchedFocus } where:
//   score        number in [0,1] (or null when there is no context) — used for ranking
//   matchedFocus count of distinct FOCUS terms the story hits (body, title, or slug) — used as
//                a precision gate so an off-focus story can't qualify on generic keywords alone
function scoreCaseStudyDetailed(item, ctx) {
  if (!hasContext(ctx)) return { score: null, matchedFocus: 0 };
  const text = `${item.title || ''} ${item.text || ''}`.toLowerCase();
  const hayTokens = new Set(tokenize(text).map(singular));
  const path = (() => { try { return new URL(item.url).pathname.toLowerCase(); } catch { return (item.url || '').toLowerCase(); } })();

  let matched = 0;
  let urlBonus = 0;
  let matchedFocus = 0;
  for (const t of ctx.terms) {
    // A term matches if its phrase appears in the body, or all of its (singularized) tokens do.
    const phraseHit = t.term.includes(' ') && text.includes(t.term);
    const tokenHit = t.tokens.length > 0 && t.tokens.every((tok) => hayTokens.has(singular(tok)));
    const bodyHit = phraseHit || tokenHit;
    // A slug/url match is an independent signal the story is about this product/industry —
    // it counts even when the fetched body text is thin (e.g. JS-heavy story pages).
    const slugHit = t.tokens.some((tok) => tok.length >= 3 && path.includes(tok));
    if (bodyHit) matched += t.weight;
    if (slugHit) urlBonus += 0.15 * (t.weight / 3);
    if (t.isFocus && (bodyHit || slugHit)) matchedFocus += 1;
  }

  const base = matched / ctx.totalWeight;
  return { score: Math.max(0, Math.min(1, base + urlBonus)), matchedFocus };
}

// Score a case study against the context. Returns a number in [0,1], or null when there is no
// context to score against (caller should then preserve discovery order — no ranking).
//   item: { text, title, url }
function scoreCaseStudyRelevance(item, ctx) {
  return scoreCaseStudyDetailed(item, ctx).score;
}

module.exports = { buildRelevanceContext, scoreCaseStudyRelevance, scoreCaseStudyDetailed, tokenize, singular, hasContext };
