// Preliminary site scan for the onboarding wizard.
//
// Detects the product/solution areas a site offers and where its case-study, docs, and blog
// hubs live — WITHOUT the expensive per-page LLM extraction or headless listing expansion.
// Fast and local-first: sitemap + homepage anchors + URL classification only.

const sitemap = require('../discovery/sitemap');
const { createPageFetcher } = require('../fetch/page-fetcher');
const { classifyUrl, localeOf, isNarrowCaseStudyListing, CASE_STUDY_LISTING } = require('../discovery/classify');
const { URL } = require('url');

// Path segments that are not real product/solution names.
const GENERIC_SEG = new Set([
  'overview', 'index', 'all', 'home', 'customers', 'customer', 'case-studies', 'case-study',
  'pricing', 'security', 'docs', 'documentation', 'blog', 'resources', 'support', 'contact',
  'about', 'company', 'partners', 'solutions', 'products', 'product', 'platform', 'features',
  'industries', 'industry', 'use-cases', 'use-case', 'compare', 'demo', 'free', 'trial', 'login'
]);

const KNOWN_ACRONYMS = new Set(['ai', 'sap', 'sql', 'api', 'iot', 'ml', 'crm', 'erp', 'hr', 'bi', 'aks', 'vm', 'hpc', 'sdk', 'cli', 'ar', 'vr']);

function prettyLabel(slug) {
  return (slug || '')
    .split('-')
    .filter(Boolean)
    .map((w) => (KNOWN_ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

// Pull a product/solution candidate from a path like /solutions/sap or /products/ai-foundry.
const AREA_RE = /\/(solutions?|industries|industry|use.?cases?|products?|platform|services?)\/([a-z0-9][a-z0-9-]{1,40})(?=\/|$)/i;
function areaFromPath(path) {
  const m = (path || '').match(AREA_RE);
  if (!m) return null;
  const group = m[1].toLowerCase();
  const seg = m[2].toLowerCase();
  if (GENERIC_SEG.has(seg) || /^\d+$/.test(seg)) return null;
  const kind = /^(solutions?|industries|industry|use)/.test(group) ? 'solution' : 'product';
  return { kind, slug: seg, label: prettyLabel(seg) };
}

function stripLocale(path) {
  return path.replace(/^\/([a-z]{2}(?:-[a-z]{2})?)(?=\/|$)/i, '') || '/';
}

// scanSite(websiteUrl) -> { products:[{id,label,url}], solutions:[...], hubs:{caseStudies,docs,blog,product} }
async function scanSite(websiteUrl, options = {}) {
  const { pageFetcher: injected = null, fetchText = sitemap.defaultFetchText } = options;
  const pageFetcher = injected || createPageFetcher({});
  const baseHost = hostOf(websiteUrl);
  let userLocale = null;
  try { userLocale = localeOf(new URL(websiteUrl).pathname); } catch { /* none */ }

  try {
    const candidates = new Set();

    // 1) Sitemap (cheap, broad).
    try {
      const urls = await sitemap.discoverSitemapUrls(websiteUrl, fetchText, { maxUrls: 3000 });
      for (const u of urls) candidates.add(u);
    } catch (e) {
      console.warn('[SiteScanner] sitemap failed:', e.message);
    }

    // 2) Homepage anchors.
    try {
      const home = await pageFetcher.fetch(websiteUrl, { expectedType: null });
      if (home && home.ok && home.links) {
        for (const link of home.links) {
          if (hostOf(link) === baseHost) candidates.add(link);
        }
      }
    } catch (e) {
      console.warn('[SiteScanner] homepage anchor scan failed:', e.message);
    }

    const products = new Map();   // label-lower -> {id,label,url}
    const solutions = new Map();
    const hubs = { caseStudies: null, docs: null, blog: null, product: null };
    const hubLocale = {};         // track locale quality of the chosen hub

    const localeScore = (loc) => {
      if (!loc) return 1;
      if (userLocale && loc === userLocale) return 4;
      if (loc === 'en-us' || loc === 'en') return 3;
      return 2;
    };

    for (const url of candidates) {
      let path = '/';
      try { path = new URL(url).pathname; } catch { continue; }

      // Product / solution areas.
      const area = areaFromPath(path);
      if (area) {
        const target = area.kind === 'solution' ? solutions : products;
        const key = area.label.toLowerCase();
        if (!target.has(key)) target.set(key, { id: area.slug, label: area.label, url });
      }

      // Hubs (prefer the user's locale variant).
      const c = classifyUrl(url, { baseHost });
      if (!c) continue;
      const loc = localeOf(path);
      const isMasterCsListing = c.category === 'case_study' && !c.individual && !isNarrowCaseStudyListing(path) &&
        CASE_STUDY_LISTING.some((re) => re.test(path));

      const consider = (hubKey, ok) => {
        if (!ok) return;
        if (!hubs[hubKey] || localeScore(loc) > (hubLocale[hubKey] || 0)) {
          hubs[hubKey] = url;
          hubLocale[hubKey] = localeScore(loc);
        }
      };
      consider('caseStudies', isMasterCsListing);
      consider('docs', c.category === 'docs' && stripLocale(path).split('/').filter(Boolean).length <= 2);
      consider('blog', c.category === 'blog' && stripLocale(path).split('/').filter(Boolean).length <= 2);
      consider('product', c.category === 'product');
    }

    return {
      products: [...products.values()].slice(0, 24),
      solutions: [...solutions.values()].slice(0, 24),
      hubs
    };
  } finally {
    if (!injected) {
      try { await pageFetcher.close(); } catch (e) { console.warn('[SiteScanner] fetcher close failed:', e.message); }
    }
  }
}

module.exports = { scanSite, prettyLabel, areaFromPath };
