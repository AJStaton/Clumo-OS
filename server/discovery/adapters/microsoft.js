// Microsoft customer-stories adapter (optional, best-effort).
//
// microsoft.com/customers is a client-rendered SPA: the story tiles are injected by JS and
// are absent from the raw HTML, so static anchor scraping finds nothing. Microsoft does,
// however, publish customer stories under stable `/<locale>/customers/story/<slug>` paths
// that are listed in their customer-hub sitemaps. This adapter harvests those story URLs
// from the sitemap tree rather than depending on an undocumented JSON search endpoint
// (which would rot). If anything fails it returns [] and the pipeline falls back cleanly.

const STORY_PATH = /\/customers\/story\//i;

// Candidate sitemaps that index Microsoft customer stories. Tried in order; all failures
// are swallowed. Kept narrow so we don't crawl all of microsoft.com.
const CANDIDATE_SITEMAPS = [
  'https://www.microsoft.com/en-us/customers/sitemap.xml',
  'https://www.microsoft.com/sitemap.xml'
];

function matches(host) {
  return /(^|\.)microsoft\.com$/i.test(host);
}

// ctx: { host, baseUrl, fetchText(url) => Promise<string>, sitemap }
// `sitemap` is the shared sitemap helper (parseSitemap) injected by url-discovery so we
// reuse its index-recursion + <loc> parsing.
async function discover(ctx) {
  const { fetchText, sitemap } = ctx;
  if (typeof fetchText !== 'function' || !sitemap) return [];

  const found = new Set();
  for (const sm of CANDIDATE_SITEMAPS) {
    try {
      const locs = await sitemap.collectFromSitemap(sm, fetchText, { maxUrls: 2000 });
      for (const loc of locs) {
        if (STORY_PATH.test(loc)) found.add(loc);
      }
    } catch {
      // try next candidate
    }
    if (found.size >= 200) break;
  }
  return [...found];
}

module.exports = { name: 'microsoft', matches, discover };
