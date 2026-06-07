// Static fetcher: axios + cheerio. Fast, free, no JS execution.
// Separates fetching (network) from parsing (pure) so parsing can be unit-tested
// directly against HTML fixtures.

const axios = require('axios');
const { extractFromHtml } = require('./extract');

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Clumo/1.0; +https://clumo.co)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

// Fetch raw HTML for a URL. Returns { ok, status, html, error }.
async function fetchHtml(url, { timeout = 12000 } = {}) {
  try {
    const res = await axios.get(url, {
      timeout,
      headers: DEFAULT_HEADERS,
      maxRedirects: 5,
      // Accept 4xx so we can still inspect/branch, but treat >=400 as not-ok content.
      validateStatus: (s) => s < 500,
      responseType: 'text',
      transformResponse: (d) => d
    });
    const html = typeof res.data === 'string' ? res.data : '';
    return { ok: res.status < 400, status: res.status, html };
  } catch (error) {
    return { ok: false, status: 0, html: '', error: error.message };
  }
}

// Fetch + parse a URL statically. Returns a normalized page object with
// renderedVia: 'static', or null on hard failure.
async function fetchStatic(url, opts = {}) {
  const res = await fetchHtml(url, opts);
  if (!res.ok || !res.html) {
    return {
      url,
      ok: false,
      status: res.status,
      error: res.error || `HTTP ${res.status}`,
      renderedVia: 'static',
      mainText: '',
      links: [],
      signals: { mainTextChars: 0 }
    };
  }
  const extracted = extractFromHtml(res.html, url);
  return { ...extracted, ok: true, status: res.status, html: res.html, renderedVia: 'static' };
}

module.exports = { fetchStatic, fetchHtml, DEFAULT_HEADERS };
