// URL discovery orchestrator.
// Combines four strategies — user-pasted URLs, sitemap.xml, homepage/key-page anchor
// scraping, and optional provider adapters — then classifies and ranks everything into
// per-category buckets. Case-study LISTING pages are expanded (headless if needed) into
// individual story URLs, which is the Beamery-style failure the static scraper couldn't
// handle.

const sitemap = require('./sitemap');
const { runAdapters } = require('./adapters');
const { classifyAndRank, classifyUrl, normalizeForDedupe, localeOf, CASE_STUDY_LISTING } = require('./classify');
const { URL } = require('url');

// Seed paths worth probing directly even if not linked from the homepage.
const SEED_PATHS = [
  '/customers', '/case-studies', '/resources/case-studies', '/customer-stories',
  '/blog', '/resources', '/product', '/platform', '/features', '/solutions',
  '/security', '/docs', '/pricing'
];

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

function isCaseStudyListing(pathUrl) {
  try {
    const p = new URL(pathUrl).pathname;
    return CASE_STUDY_LISTING.some((re) => re.test(p));
  } catch { return false; }
}

// Merge directly-discovered stories with stories harvested from listing pages, enforcing
// per-listing diversity so a single vertical listing (e.g. /solutions/sap/customers) can't
// flood the bucket. Direct individual hits are kept first; listing stories are then added
// round-robin (master listings before narrow ones), each listing capped at its quota.
// Pure + exported for unit testing.
//   direct:   [{ url, ... }]                     — individual stories found without a listing
//   listings: [{ url, narrow, links: [{url,...}] }] — per-listing harvested stories
function diversifyCaseStudies({ direct = [], listings = [], budget = 50 }) {
  const chosen = new Map();
  const add = (c) => {
    const k = normalizeForDedupe(c.url);
    if (!chosen.has(k)) chosen.set(k, c);
  };

  for (const c of direct) {
    if (chosen.size >= budget) break;
    add(c);
  }

  // Master (non-narrow) listings first, then narrow.
  const ordered = [...listings].sort((a, b) => (a.narrow ? 1 : 0) - (b.narrow ? 1 : 0));
  const n = ordered.length;
  const baseCap = n <= 1 ? budget : Math.max(8, Math.ceil(budget / n));
  // Narrow vertical listings get a tighter cap so they never dominate.
  const capFor = (l) => (l.narrow ? Math.min(baseCap, 5) : baseCap);
  const counts = new Array(n).fill(0);

  let round = 0;
  let progressed = true;
  while (chosen.size < budget && progressed) {
    progressed = false;
    for (let i = 0; i < n; i++) {
      const l = ordered[i];
      if (round >= (l.links || []).length) continue;
      if (counts[i] >= capFor(l)) continue;
      add(l.links[round]);
      counts[i] += 1;
      progressed = true;
      if (chosen.size >= budget) break;
    }
    round += 1;
  }

  // Always keep the listing URLs themselves as fallbacks (some sites put all content there).
  for (const l of ordered) {
    if (chosen.size >= budget) break;
    add({ url: l.url, category: 'case_study', individual: false, narrow: l.narrow, priority: l.narrow ? 1 : 2 });
  }

  return [...chosen.values()].slice(0, budget);
}

// pastedSources: { caseStudies: [], blog: [], docs: [] } — user-provided URLs per category.
// Returns { buckets, telemetry }.
async function discoverUrls(baseUrl, pageFetcher, options = {}) {
  const {
    pastedSources = {},
    perTypeBudget = 20,
    caseStudyBudget = perTypeBudget,
    maxAnchorPages = 8,
    maxListingExpansions = 8,
    onProgress = null
  } = options;
  const MAX_LISTING_EXPANSIONS = maxListingExpansions;

  const baseHost = hostOf(baseUrl);
  const origin = baseHost ? new URL(baseUrl).origin : null;
  const candidates = new Set();
  const telemetry = { strategies: {}, listingExpansions: 0 };

  // 1) Pasted URLs (highest trust). Tracked separately so they always survive ranking.
  const pasted = [];
  const pastedMap = { caseStudies: 'case_study', blog: 'blog', docs: 'docs' };
  for (const [field, category] of Object.entries(pastedMap)) {
    for (const u of pastedSources[field] || []) {
      const trimmed = (u || '').trim();
      if (!trimmed) continue;
      pasted.push({ url: trimmed, category, individual: true, priority: 5, pasted: true });
      candidates.add(trimmed);
    }
  }
  telemetry.strategies.pasted = pasted.length;

  // 2) Sitemap discovery.
  if (onProgress) onProgress({ message: 'Reading sitemap...' });
  let sitemapUrls = [];
  try {
    sitemapUrls = await sitemap.discoverSitemapUrls(baseUrl, sitemap.defaultFetchText, { maxUrls: 4000 });
  } catch (e) {
    console.warn('[Discovery] sitemap failed:', e.message);
  }
  for (const u of sitemapUrls) candidates.add(u);
  telemetry.strategies.sitemap = sitemapUrls.length;

  // 3) Anchor scraping of homepage + seed pages.
  if (onProgress) onProgress({ message: 'Scanning homepage and key pages...' });
  const anchorSeeds = [baseUrl, ...SEED_PATHS.map((p) => origin ? origin + p : null).filter(Boolean)];
  let anchorCount = 0;
  for (const seed of anchorSeeds.slice(0, maxAnchorPages)) {
    const page = await pageFetcher.fetch(seed, { expectedType: null });
    if (page && page.ok && page.links) {
      for (const link of page.links) {
        if (hostOf(link) === baseHost) { candidates.add(link); anchorCount += 1; }
      }
    }
  }
  telemetry.strategies.anchors = anchorCount;

  // 4) Provider adapters (optional, best-effort).
  if (onProgress) onProgress({ message: 'Checking provider integrations...' });
  const adapterResult = await runAdapters({
    host: baseHost,
    baseUrl,
    fetchText: sitemap.defaultFetchText,
    sitemap
  });
  for (const u of adapterResult.urls) candidates.add(u);
  telemetry.strategies.adapter = adapterResult.urls.length;
  telemetry.adapterName = adapterResult.name;

  // Classify + rank everything. Pasted URLs are prepended so they win ties.
  const userLocale = (() => { try { return localeOf(new URL(baseUrl).pathname); } catch { return null; } })();
  const ranked = classifyAndRank([...pasted.map((p) => p.url), ...candidates], { baseHost, perTypeBudget, budgets: { case_study: caseStudyBudget }, userLocale });

  // Ensure pasted URLs land in their declared bucket even if classification disagrees.
  for (const p of pasted) {
    const bucket = ranked[p.category];
    if (bucket && !bucket.some((c) => normalizeForDedupe(c.url) === normalizeForDedupe(p.url))) {
      bucket.unshift({ url: p.url, category: p.category, individual: true, priority: 5 });
      ranked[p.category] = bucket.slice(0, p.category === 'case_study' ? caseStudyBudget : perTypeBudget);
    }
  }

  // 5) Expand case-study listing pages into individual story URLs, with per-listing diversity.
  const csListings = ranked.case_study.filter((c) => !c.individual || isCaseStudyListing(c.url));
  if (csListings.length > 0) {
    if (onProgress) onProgress({ message: 'Expanding case-study library...' });
    const direct = ranked.case_study.filter((x) => x.individual && !isCaseStudyListing(x.url));
    const listings = [];
    // Master listings before narrow ones so the general library expands first.
    const orderedListings = [...csListings].sort((a, b) => (a.narrow ? 1 : 0) - (b.narrow ? 1 : 0));
    for (const listing of orderedListings.slice(0, MAX_LISTING_EXPANSIONS)) {
      // Force headless so JS-rendered listings (Beamery) actually yield their tiles.
      const page = await pageFetcher.fetch(listing.url, { expectedType: 'case_study', forceHeadless: true });
      telemetry.listingExpansions += 1;
      const links = [];
      const seenInListing = new Set();
      if (page && page.ok && page.links) {
        for (const link of page.links) {
          if (hostOf(link) !== baseHost) continue;
          const c = classifyUrl(link, { baseHost });
          if (c && c.category === 'case_study' && c.individual && !isCaseStudyListing(c.url)) {
            const k = normalizeForDedupe(c.url);
            if (seenInListing.has(k)) continue;
            seenInListing.add(k);
            links.push(c);
          }
        }
      }
      listings.push({ url: listing.url, narrow: !!listing.narrow, links });
    }
    ranked.case_study = diversifyCaseStudies({ direct, listings, budget: caseStudyBudget });
  }

  return { buckets: ranked, telemetry };
}

module.exports = { discoverUrls, diversifyCaseStudies, SEED_PATHS };
