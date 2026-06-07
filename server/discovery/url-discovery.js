// URL discovery orchestrator.
// Combines four strategies — user-pasted URLs, sitemap.xml, homepage/key-page anchor
// scraping, and optional provider adapters — then classifies and ranks everything into
// per-category buckets. Case-study LISTING pages are expanded (headless if needed) into
// individual story URLs, which is the Beamery-style failure the static scraper couldn't
// handle.

const sitemap = require('./sitemap');
const { runAdapters } = require('./adapters');
const { classifyAndRank, classifyUrl, normalizeForDedupe, CASE_STUDY_LISTING } = require('./classify');
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

// pastedSources: { caseStudies: [], blog: [], docs: [] } — user-provided URLs per category.
// Returns { buckets, telemetry }.
async function discoverUrls(baseUrl, pageFetcher, options = {}) {
  const {
    pastedSources = {},
    perTypeBudget = 20,
    caseStudyBudget = perTypeBudget,
    maxAnchorPages = 8,
    onProgress = null
  } = options;

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
  const ranked = classifyAndRank([...pasted.map((p) => p.url), ...candidates], { baseHost, perTypeBudget, budgets: { case_study: caseStudyBudget } });

  // Ensure pasted URLs land in their declared bucket even if classification disagrees.
  for (const p of pasted) {
    const bucket = ranked[p.category];
    if (bucket && !bucket.some((c) => normalizeForDedupe(c.url) === normalizeForDedupe(p.url))) {
      bucket.unshift({ url: p.url, category: p.category, individual: true, priority: 5 });
      ranked[p.category] = bucket.slice(0, p.category === 'case_study' ? caseStudyBudget : perTypeBudget);
    }
  }

  // 5) Expand case-study listing pages into individual story URLs.
  const csListings = ranked.case_study.filter((c) => !c.individual || isCaseStudyListing(c.url));
  if (csListings.length > 0) {
    if (onProgress) onProgress({ message: 'Expanding case-study library...' });
    const individuals = new Map();
    for (const c of ranked.case_study.filter((x) => x.individual && !isCaseStudyListing(x.url))) {
      individuals.set(normalizeForDedupe(c.url), c);
    }
    for (const listing of csListings.slice(0, 5)) {
      // Force headless so JS-rendered listings (Beamery) actually yield their tiles.
      const page = await pageFetcher.fetch(listing.url, { expectedType: 'case_study', forceHeadless: true });
      telemetry.listingExpansions += 1;
      if (!page || !page.ok || !page.links) continue;
      for (const link of page.links) {
        if (hostOf(link) !== baseHost) continue;
        const c = classifyUrl(link, { baseHost });
        if (c && c.category === 'case_study' && c.individual && !isCaseStudyListing(c.url)) {
          individuals.set(normalizeForDedupe(c.url), c);
        }
      }
    }
    const merged = [...individuals.values()];
    // Keep listings too (some sites have all content on the listing page).
    merged.push(...csListings);
    merged.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    ranked.case_study = merged.slice(0, caseStudyBudget);
  }

  return { buckets: ranked, telemetry };
}

module.exports = { discoverUrls, SEED_PATHS };
