// URL classification + ranking for onboarding discovery.
// Maps a URL to a source category (case_study | blog | docs | product | other),
// scores how "individual" vs "listing" it is, and assigns a fetch priority so the
// per-type budget is spent on the most promising pages first.

const { URL } = require('url');

// Individual case-study / customer-story pages (a slug after the section).
const CASE_STUDY_INDIVIDUAL = [
  /\/case.?stud(y|ies)\/[^/]+/i,
  /\/customer.?stor(y|ies)\/[^/]+/i,
  /\/success.?stor(y|ies)\/[^/]+/i,
  /\/client.?stor(y|ies)\/[^/]+/i,
  /\/customers?\/[^/]+/i,
  /\/clients?\/[^/]+/i,
  /\/customer.?spotlight\/[^/]+/i,
  /\/client.?spotlight\/[^/]+/i,
  /\/testimonial\/[^/]+/i,
  /\/our.?work\/[^/]+/i,
  /\/impact.?stor(y|ies)\/[^/]+/i,
  /\/customer.?experience\/[^/]+/i
];

// Case-study listing / library / index pages.
const CASE_STUDY_LISTING = [
  /\/case.?stud(y|ies)\/?$/i,
  /\/case.?stud.*(librar|all)/i,
  /\/customer.?stor(y|ies)\/?$/i,
  /\/success.?stor(y|ies)\/?$/i,
  /\/client.?stor(y|ies)\/?$/i,
  /\/customers?\/?$/i,
  /\/clients?\/?$/i,
  /\/customer.?results?\/?$/i,
  /\/client.?results?\/?$/i,
  /\/customer.?spotlights?\/?$/i,
  /\/our.?work\/?$/i,
  /\/our.?customers?\/?$/i,
  /\/impact.?stor(y|ies)\/?$/i
];

const BLOG = [/\/blog/i, /\/resources?/i, /\/insights?/i, /\/research/i, /\/news/i, /\/article/i, /\/report/i, /\/roi/i, /\/benchmark/i];
const DOCS = [/\/docs?/i, /\/documentation/i, /\/learn/i, /\/developer/i, /\/api\b/i, /\/reference/i, /\/guides?/i, /\/support\/docs/i];
const PRODUCT = [/\/product/i, /\/platform/i, /\/features?/i, /\/solutions?/i, /\/capabilit/i, /\/use.?cases?/i, /\/why/i, /\/pricing/i, /\/security/i];

// Hosts that are documentation subdomains we should allow even when they differ
// from the main domain (Microsoft/Google split docs onto separate hosts).
const DOC_SUBDOMAIN = /^(docs?|learn|developers?|developer|api|support)\./i;

const SKIP = [
  /\.(pdf|png|jpe?g|gif|svg|css|js|zip|mp4|mp3|webp|ico|woff2?)(\?|$)/i,
  /\/(login|signup|sign-up|register|account|cart|checkout)/i,
  /\/(careers?|jobs|legal|privacy|terms|cookies?|sitemap|rss|feed)/i,
  /\/cdn-cgi\//i,
  /^(mailto:|tel:|javascript:)/i
];

function anyMatch(patterns, path) {
  return patterns.some((re) => re.test(path));
}

// Returns { category, individual, priority } or null if the URL should be skipped.
// category: 'case_study' | 'blog' | 'docs' | 'product' | 'other'
function classifyUrl(rawUrl, { baseHost = null } = {}) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const full = u.href;
  const path = u.pathname;

  if (SKIP.some((re) => re.test(full))) return null;

  // Paginated listing pages add little; deprioritize but don't skip outright.
  const isPaginated = /\/(page|p)\/\d+|[?&]page=\d+/i.test(full);

  let category = 'other';
  let individual = false;

  if (anyMatch(CASE_STUDY_INDIVIDUAL, path) && !anyMatch(CASE_STUDY_LISTING, path)) {
    category = 'case_study';
    individual = true;
  } else if (anyMatch(CASE_STUDY_LISTING, path)) {
    category = 'case_study';
    individual = false;
  } else if (anyMatch(DOCS, path) || (baseHost && DOC_SUBDOMAIN.test(u.hostname) && u.hostname !== baseHost)) {
    category = 'docs';
    individual = /\/[^/]+\/[^/]+/.test(path);
  } else if (anyMatch(BLOG, path)) {
    category = 'blog';
    individual = /\/[^/]+\/[^/]+/.test(path);
  } else if (anyMatch(PRODUCT, path)) {
    category = 'product';
    individual = true;
  }

  if (category === 'other') return null;

  // Priority: individual content pages first; listings next; paginated last.
  let priority = individual ? 3 : 2;
  if (isPaginated) priority = 1;

  return { url: full, category, individual, priority };
}

// Map a source category to the knowledge types it primarily feeds.
const CATEGORY_TO_TYPES = {
  case_study: ['case_study'],
  blog: ['proof_point'],
  docs: ['product_truth'],
  product: ['product_truth', 'discovery_question']
};

function normalizeForDedupe(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    for (const p of [...u.searchParams.keys()]) {
      if (/^utm|^gclid$|^fbclid$|^mc_/i.test(p)) u.searchParams.delete(p);
    }
    let s = u.origin + u.pathname.replace(/\/$/, '');
    const qs = u.searchParams.toString();
    if (qs) s += '?' + qs;
    return s.toLowerCase();
  } catch {
    return rawUrl.toLowerCase();
  }
}

// Classify, dedupe, and rank a flat list of URLs into per-category buckets,
// each capped at perTypeBudget. Pasted URLs (high priority) should be passed first.
function classifyAndRank(urls, { baseHost = null, perTypeBudget = 20, budgets = {} } = {}) {
  const seen = new Set();
  const buckets = { case_study: [], blog: [], docs: [], product: [] };

  for (const url of urls) {
    const c = classifyUrl(url, { baseHost });
    if (!c || !buckets[c.category]) continue;
    const norm = normalizeForDedupe(c.url);
    if (seen.has(norm)) continue;
    seen.add(norm);
    buckets[c.category].push(c);
  }

  for (const cat of Object.keys(buckets)) {
    buckets[cat].sort((a, b) => b.priority - a.priority);
    buckets[cat] = buckets[cat].slice(0, budgets[cat] || perTypeBudget);
  }
  return buckets;
}

module.exports = {
  classifyUrl,
  classifyAndRank,
  normalizeForDedupe,
  CATEGORY_TO_TYPES,
  CASE_STUDY_LISTING,
  CASE_STUDY_INDIVIDUAL
};
