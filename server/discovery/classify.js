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

// Narrow / vertical case-study listings: a customer or case-study index scoped to a single
// product, industry, or solution (e.g. /solutions/sap/customers, /industries/banking/case-studies).
// These should never crowd out the master customer-stories library, so we down-rank them.
const NARROW_CASE_STUDY_LISTING = [
  /\/(solutions?|industries|industry|products?|sectors?|verticals?|use.?cases?)\/[^/]+\/(customers?|clients?|case.?stud(y|ies)|customer.?stor(y|ies)|success.?stor(y|ies)|client.?stor(y|ies))\/?$/i
];

// Search / browse / filtered listing pages WITHIN a customer-stories section
// (e.g. /customers/search, /case-studies/browse, /customer-stories/all). These are
// JS-rendered browse pages that carry the seller's filters in their query string, so they
// must be expanded headlessly rather than treated as a single story. Strict full-segment
// match: individual slugs like /customers/allbirds or /customers/searchspring are NOT caught
// because the trailing segment must be exactly a browse keyword.
const CASE_STUDY_BROWSE = [
  /\/(customers?|clients?|case.?stud(y|ies)|customer.?stor(y|ies)|success.?stor(y|ies)|client.?stor(y|ies)|stories|references?)\/(search|browse|explore|find|results?|library|directory|index|filter|filters|all)\/?$/i
];

// Filter-like query params that mark a listing page as a deliberately scoped browse
// (?filters=..., ?product=..., ?industry=...). Only ever used to BOOST an already
// listing-like URL — never to reclassify an individual story slug.
const FILTER_QUERY = /(?:^|[?&])(filters?|product|products|industry|industries|topic|topics|category|categories|tag|tags|sector|sectors|solution|solutions|persona|personas|type|usecase|use-case)=/i;

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

// Leading locale segment, e.g. /en-gb/..., /cs-cz/..., /fr/... Returns the locale or null.
const LOCALE_RE = /^\/([a-z]{2}(?:-[a-z]{2})?)(?=\/|$)/i;
function localeOf(path) {
  const m = (path || '').match(LOCALE_RE);
  return m ? m[1].toLowerCase() : null;
}
function stripLocalePath(path) {
  return (path || '').replace(LOCALE_RE, '') || '/';
}
function isNarrowCaseStudyListing(path) {
  return anyMatch(NARROW_CASE_STUDY_LISTING, path);
}
// Utility/nav segments that can appear directly under a customer-stories section but are NOT
// individual stories (locale switchers, region pickers, auth, generic hubs). Used to reject the
// broad /customers/<seg> individual match so these don't get harvested as fake case studies.
const NON_STORY_SEGMENT = /\/(customers?|clients?|case.?stud(y|ies)|customer.?stor(y|ies)|success.?stor(y|ies)|client.?stor(y|ies)|stories|references?)\/(locale|locales|language|languages|lang|region|regions|country|countries|signin|sign-in|login|log-in|signup|sign-up|register|account|overview|home|landing|featured|categories|category|topics?|tags?|industries|industry|products?|solutions?|sectors?|filter|filters)\/?$/i;

function isCaseStudyBrowse(path) {
  return anyMatch(CASE_STUDY_BROWSE, path);
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

  // Hub placeholder anchors like "/customers#" or "/case-studies#" (empty fragment) are dead
  // nav links, not real listing pages worth fetching.
  const fragmentPlaceholder = /#$/.test(rawUrl) || u.hash === '#';

  // Paginated listing pages add little; deprioritize but don't skip outright.
  const isPaginated = /\/(page|p)\/\d+|[?&]page=\d+/i.test(full);

  let category = 'other';
  let individual = false;
  let narrow = false;
  let search = false;

  if (isCaseStudyBrowse(path)) {
    // A search/browse page within a customer-stories section: a filtered listing, not a story.
    category = 'case_study';
    individual = false;
    search = true;
  } else if (anyMatch(CASE_STUDY_INDIVIDUAL, path) && !anyMatch(CASE_STUDY_LISTING, path) && !isNarrowCaseStudyListing(path) && !NON_STORY_SEGMENT.test(path)) {
    category = 'case_study';
    individual = true;
  } else if (isNarrowCaseStudyListing(path)) {
    category = 'case_study';
    individual = false;
    narrow = true;
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

  // A filter query string on an already listing-like case-study URL marks a deliberately
  // scoped browse (the seller's intent encoded in the URL). Boost it for headless expansion,
  // but never reclassify an individual story slug on the basis of its query string.
  if (category === 'case_study' && !individual && u.search && FILTER_QUERY.test(u.search)) {
    search = true;
  }

  // Priority: individual content pages first; listings next; paginated/narrow/placeholder last.
  let priority = individual ? 3 : 2;
  if (search) priority = 2;            // filtered/browse listing — expand it, don't bury it
  if (narrow) priority = 1;            // vertical listing — must not crowd out the master library
  if (fragmentPlaceholder) priority = 1;
  if (isPaginated) priority = 1;

  return { url: full, category, individual, narrow, search, priority };
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

// Classify, dedupe, and rank a flat list of URLs into per-category buckets, each capped at
// perTypeBudget. Pasted URLs (high priority) should be passed first. When two URLs differ only
// by locale prefix (/en-gb/x vs /en-us/x vs /cs-cz/x) they collapse to one, preferring the
// user's locale, then en-us, then the first seen.
function classifyAndRank(urls, { baseHost = null, perTypeBudget = 20, budgets = {}, userLocale = null } = {}) {
  const seen = new Map();           // locale-agnostic key -> { entry, locale }
  const buckets = { case_study: [], blog: [], docs: [], product: [] };
  const wantLocale = (userLocale || '').toLowerCase();

  function localePreferred(existingLocale, candidateLocale) {
    // Higher score wins.
    const score = (loc) => {
      if (!loc) return 1;                       // no locale prefix — neutral
      if (wantLocale && loc === wantLocale) return 4;
      if (loc === 'en-us' || loc === 'en') return 3;
      return 2;
    };
    return score(candidateLocale) > score(existingLocale);
  }

  for (const url of urls) {
    const c = classifyUrl(url, { baseHost });
    if (!c || !buckets[c.category]) continue;
    let path = '/';
    try { path = new URL(c.url).pathname; } catch { /* keep default */ }
    const locale = localeOf(path);
    const localeAgnostic = (() => {
      try {
        const u = new URL(c.url);
        return normalizeForDedupe(u.origin + stripLocalePath(u.pathname) + (u.search || ''));
      } catch { return normalizeForDedupe(c.url); }
    })();

    const prior = seen.get(localeAgnostic);
    if (prior) {
      // Same page, different locale — keep the better-localed variant.
      if (localePreferred(prior.locale, locale)) {
        const idx = buckets[c.category].indexOf(prior.entry);
        if (idx !== -1) buckets[c.category][idx] = c;
        else buckets[c.category].push(c);
        seen.set(localeAgnostic, { entry: c, locale });
      }
      continue;
    }
    seen.set(localeAgnostic, { entry: c, locale });
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
  localeOf,
  stripLocalePath,
  isNarrowCaseStudyListing,
  isCaseStudyBrowse,
  CATEGORY_TO_TYPES,
  CASE_STUDY_LISTING,
  CASE_STUDY_INDIVIDUAL,
  CASE_STUDY_BROWSE
};
