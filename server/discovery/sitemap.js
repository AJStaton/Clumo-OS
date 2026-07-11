// Sitemap discovery helpers.
// Static XML sitemaps bypass the SPA problem entirely for URL *discovery* — even when a
// site's listing page is client-rendered, its sitemap is plain XML the server returns
// directly. Handles robots.txt Sitemap: refs and recursive <sitemapindex> trees.

const { fetchHtml } = require('../fetch/static-fetcher');

function extractLocs(xml) {
  const locs = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    locs.push(m[1].trim());
  }
  return locs;
}

function isSitemapIndex(xml) {
  return /<sitemapindex[\s>]/i.test(xml);
}

// Default fetch implementation returns raw text for a URL, or '' on failure.
async function defaultFetchText(url) {
  const res = await fetchHtml(url, { timeout: 12000 });
  return res.ok ? res.html : '';
}

// Parse robots.txt for `Sitemap:` directives.
async function sitemapsFromRobots(origin, fetchText = defaultFetchText) {
  const txt = await fetchText(origin.replace(/\/$/, '') + '/robots.txt');
  if (!txt) return [];
  const refs = [];
  const re = /^\s*sitemap:\s*(\S+)/gim;
  let m;
  while ((m = re.exec(txt)) !== null) refs.push(m[1].trim());
  return refs;
}

// Recursively collect all page URLs reachable from a sitemap (or sitemap index).
async function collectFromSitemap(sitemapUrl, fetchText = defaultFetchText, opts = {}) {
  const { maxUrls = 5000, maxDepth = 3, _depth = 0, _seen = new Set() } = opts;
  if (_depth > maxDepth || _seen.has(sitemapUrl)) return [];
  _seen.add(sitemapUrl);

  const xml = await fetchText(sitemapUrl);
  if (!xml) return [];

  const locs = extractLocs(xml);
  if (isSitemapIndex(xml)) {
    const out = [];
    for (const childSitemap of locs) {
      if (out.length >= maxUrls) break;
      const child = await collectFromSitemap(childSitemap, fetchText, {
        maxUrls, maxDepth, _depth: _depth + 1, _seen
      });
      out.push(...child);
    }
    return out.slice(0, maxUrls);
  }
  return locs.slice(0, maxUrls);
}

// Discover all page URLs for a site via robots.txt + common sitemap locations.
async function discoverSitemapUrls(baseUrl, fetchText = defaultFetchText, opts = {}) {
  let origin;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }

  const candidates = new Set();
  for (const ref of await sitemapsFromRobots(origin, fetchText)) candidates.add(ref);
  candidates.add(origin + '/sitemap.xml');
  candidates.add(origin + '/sitemap_index.xml');

  const all = new Set();
  for (const sm of candidates) {
    const locs = await collectFromSitemap(sm, fetchText, opts);
    for (const loc of locs) all.add(loc);
    if (all.size >= (opts.maxUrls || 5000)) break;
  }
  return [...all];
}

module.exports = {
  extractLocs,
  isSitemapIndex,
  sitemapsFromRobots,
  collectFromSitemap,
  discoverSitemapUrls,
  defaultFetchText
};
