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

// Round-robin merge of per-listing harvested links, master (non-narrow) listings before narrow
// ones, each listing capped at its quota so a single listing can't flood the bucket. Mutates
// `chosen` via `add`. `capNarrow` tightens the cap for narrow vertical listings (discovered
// listings) but is disabled for pasted listings where the narrowness is the seller's intent.
function roundRobinListings(listings, budget, chosen, add, { capNarrow = true } = {}) {
  const ordered = [...listings].sort((a, b) => (a.narrow ? 1 : 0) - (b.narrow ? 1 : 0));
  const n = ordered.length;
  if (n === 0) return;
  const baseCap = n <= 1 ? budget : Math.max(8, Math.ceil(budget / n));
  const capFor = (l) => (capNarrow && l.narrow ? Math.min(baseCap, 5) : baseCap);
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
}

// Merge case-study candidates into a final, budgeted, de-duplicated, diversity-controlled list.
// Fill order encodes trust + diversity so the seller's pasted/filtered intent always wins and no
// single source (e.g. a provider-adapter sitemap firehose) can flood the bucket:
//   1. pastedDirect          — individual stories the seller pasted
//   2. pastedListings        — stories harvested from expanding the seller's pasted listings
//                              (their filters are the seller's intent; narrow cap disabled)
//   3. direct                — individual stories from sitemap/anchor discovery
//   4. listings              — stories from expanding discovered listings (narrow cap on)
//   5. adapterDirect         — individual stories from provider adapters (least-trusted firehose)
//   6. listing URLs          — the listing pages themselves, as a last-resort fallback
// First-write-wins dedupe means an earlier (more trusted) provenance is retained.
//   direct/listings keep the original 2-arg signature so existing callers/tests are unaffected.
function diversifyCaseStudies({ pastedDirect = [], pastedListings = [], direct = [], listings = [], adapterDirect = [], budget = 50 }) {
  const chosen = new Map();
  const add = (c) => {
    const k = normalizeForDedupe(c.url);
    if (!chosen.has(k)) chosen.set(k, c);
  };

  for (const c of pastedDirect) { if (chosen.size >= budget) break; add(c); }
  roundRobinListings(pastedListings, budget, chosen, add, { capNarrow: false });
  for (const c of direct) { if (chosen.size >= budget) break; add(c); }
  roundRobinListings(listings, budget, chosen, add, { capNarrow: true });
  for (const c of adapterDirect) { if (chosen.size >= budget) break; add(c); }

  // Keep a listing URL as a fallback only when expanding it yielded no individual stories (some
  // sites put all content on the listing page). When a listing already produced story links, its
  // own URL (often a JS search/browse shell) shouldn't occupy a slot meant for a real story.
  for (const l of [...pastedListings, ...listings]) {
    if (chosen.size >= budget) break;
    if ((l.links || []).length > 0) continue;
    add({ url: l.url, category: 'case_study', individual: false, narrow: l.narrow, trusted: !!l.trusted, priority: l.narrow ? 1 : 2 });
  }

  return [...chosen.values()].slice(0, budget);
}

// pastedSources: { caseStudies: [], blog: [], docs: [] } — user-provided URLs per category.
// Returns { buckets, telemetry }.
async function discoverUrls(baseUrl, pageFetcher, options = {}) {
  const {
    pastedSources = {},
    perTypeBudget = 30,
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

  // 4) Provider adapters (optional, best-effort). These can return a large flat firehose of
  // individual story URLs with no diversity control, so we track them separately and treat them
  // as the least-trusted discovery tier (they must never crowd out pasted or natively-discovered
  // sources).
  if (onProgress) onProgress({ message: 'Checking provider integrations...' });
  const adapterResult = await runAdapters({
    host: baseHost,
    baseUrl,
    fetchText: sitemap.defaultFetchText,
    sitemap
  });
  const adapterUrlSet = new Set();
  for (const u of adapterResult.urls) {
    candidates.add(u);
    adapterUrlSet.add(normalizeForDedupe(u));
  }
  telemetry.strategies.adapter = adapterResult.urls.length;
  telemetry.adapterName = adapterResult.name;

  const pastedUrlSet = new Set(pasted.map((p) => normalizeForDedupe(p.url)));

  // Classify + rank everything. Pasted URLs are prepended so they win ties. The case-study pool
  // is kept deliberately larger than the final budget so listings + diverse stories survive to
  // the expansion/diversification step instead of being truncated by an early firehose.
  const userLocale = (() => { try { return localeOf(new URL(baseUrl).pathname); } catch { return null; } })();
  const csPool = Math.max(caseStudyBudget * 3, 60);
  const ranked = classifyAndRank([...pasted.map((p) => p.url), ...candidates], { baseHost, perTypeBudget, budgets: { case_study: csPool }, userLocale });

  // Tag case-study provenance so the diversifier can honor trust: pasted (seller intent) and
  // adapter (least-trusted firehose). Pasted wins when a URL was seen from multiple sources.
  for (const c of ranked.case_study) {
    const key = normalizeForDedupe(c.url);
    if (pastedUrlSet.has(key)) { c.pasted = true; c.trusted = true; }
    else if (adapterUrlSet.has(key)) { c.adapter = true; }
  }

  // Ensure pasted URLs land in their declared bucket even if classification disagrees.
  for (const p of pasted) {
    const bucket = ranked[p.category];
    if (bucket && !bucket.some((c) => normalizeForDedupe(c.url) === normalizeForDedupe(p.url))) {
      const classified = classifyUrl(p.url, { baseHost });
      const entry = classified && classified.category === p.category
        ? { ...classified, pasted: true, trusted: true, priority: 5 }
        : { url: p.url, category: p.category, individual: true, pasted: true, trusted: true, priority: 5 };
      bucket.unshift(entry);
      ranked[p.category] = bucket.slice(0, p.category === 'case_study' ? csPool : perTypeBudget);
    }
  }

  // 5) Expand case-study listing pages into individual story URLs, with provenance-aware
  // diversity. Pasted listings (often carrying the seller's filters in their query string) are
  // expanded first and their harvested stories inherit the seller's trust.
  const isListingEntry = (c) => !c.individual || !!c.search || isCaseStudyListing(c.url);
  const csListings = ranked.case_study.filter(isListingEntry);
  if (csListings.length > 0) {
    if (onProgress) onProgress({ message: 'Expanding case-study library...' });

    const pastedDirect = ranked.case_study.filter((x) => x.pasted && x.individual && !isListingEntry(x));
    const direct = ranked.case_study.filter((x) => x.individual && !isListingEntry(x) && !x.pasted && !x.adapter);
    const adapterDirect = ranked.case_study.filter((x) => x.individual && !isListingEntry(x) && x.adapter);

    // Expand the seller's pasted listings before discovered ones; within each group, master
    // (non-narrow) listings before narrow so the general library expands first.
    const orderInGroup = (a, b) => (a.narrow ? 1 : 0) - (b.narrow ? 1 : 0);
    const pastedListingMeta = csListings.filter((c) => c.pasted).sort(orderInGroup);
    const discoveredListingMeta = csListings.filter((c) => !c.pasted).sort(orderInGroup);

    const expand = async (listing, trusted) => {
      // Force headless so JS-rendered/filtered listings (Beamery, SPA search pages) yield tiles.
      const page = await pageFetcher.fetch(listing.url, { expectedType: 'case_study', forceHeadless: true });
      telemetry.listingExpansions += 1;
      const links = [];
      const seenInListing = new Set();
      // A pasted listing may live on a different host than the seller's site (e.g. stories
      // hosted on www.example.com while the product site is app.example.com, or a third-party
      // case-study platform). Trust the host of the listing the seller pointed us at, so its
      // story links are harvested even when they don't match baseHost.
      const allowedHost = trusted ? hostOf(listing.url) : baseHost;
      // DOM anchors are the primary harvest; JSON-sniffed URLs are a lower-trust secondary source
      // that adds volume for SPA listings whose tiles aren't crawlable anchors.
      const domLinks = (page && page.ok && page.links) ? page.links : [];
      const jsonLinks = (page && page.ok && page.jsonLinks) ? page.jsonLinks : [];
      const consider = [
        ...domLinks.map((u) => ({ u, method: 'dom' })),
        ...jsonLinks.map((u) => ({ u, method: 'json' }))
      ];
      let jsonAccepted = 0;
      for (const { u: link, method } of consider) {
        if (hostOf(link) !== allowedHost) continue;
        const c = classifyUrl(link, { baseHost });
        if (c && c.category === 'case_study' && c.individual && !isCaseStudyListing(c.url)) {
          const k = normalizeForDedupe(c.url);
          if (seenInListing.has(k)) continue;
          seenInListing.add(k);
          if (trusted) { c.fromPasted = true; c.trusted = true; }
          c.harvestMethod = method;
          if (method === 'json') jsonAccepted += 1;
          links.push(c);
        }
      }
      telemetry.jsonHarvestedLinks = (telemetry.jsonHarvestedLinks || 0) + jsonAccepted;
      if (page && page.listingIncomplete) telemetry.listingExpansionIncomplete = (telemetry.listingExpansionIncomplete || 0) + 1;
      return { url: listing.url, narrow: !!listing.narrow, trusted: !!trusted, links };
    };

    const pastedListings = [];
    const listings = [];
    let expansions = 0;
    for (const listing of pastedListingMeta) {
      if (expansions >= MAX_LISTING_EXPANSIONS) break;
      pastedListings.push(await expand(listing, true));
      expansions += 1;
    }
    for (const listing of discoveredListingMeta) {
      if (expansions >= MAX_LISTING_EXPANSIONS) break;
      listings.push(await expand(listing, false));
      expansions += 1;
    }

    telemetry.pastedCaseStudyListings = pastedListingMeta.length;
    telemetry.pastedCaseStudyLinks = pastedListings.reduce((n, l) => n + l.links.length, 0);

    ranked.case_study = diversifyCaseStudies({
      pastedDirect, pastedListings, direct, listings, adapterDirect, budget: caseStudyBudget
    });
  } else {
    // No listings to expand: still apply the final budget + provenance ordering to the pool.
    const pastedDirect = ranked.case_study.filter((x) => x.pasted);
    const direct = ranked.case_study.filter((x) => !x.pasted && !x.adapter);
    const adapterDirect = ranked.case_study.filter((x) => x.adapter);
    ranked.case_study = diversifyCaseStudies({ pastedDirect, direct, adapterDirect, budget: caseStudyBudget });
  }

  return { buckets: ranked, telemetry };
}

module.exports = { discoverUrls, diversifyCaseStudies, SEED_PATHS };
