// Provider adapter registry.
//
// Adapters are an OPTIONAL discovery tier for sites whose case studies are served by a
// client-side app backed by a JSON/search API (e.g. microsoft.com, cloud.google.com),
// where neither static anchors nor sitemaps reliably surface individual story URLs.
//
// Contract: an adapter is `{ name, matches(host) => bool, discover(ctx) => Promise<string[]> }`.
// `discover` returns a flat list of candidate URLs (any category). Adapters MUST be
// best-effort: never throw, and return [] on any failure so the pipeline still succeeds
// via the static + sitemap tiers.

const microsoft = require('./microsoft');

const ADAPTERS = [microsoft];

function selectAdapter(host) {
  if (!host) return null;
  return ADAPTERS.find((a) => {
    try { return a.matches(host); } catch { return false; }
  }) || null;
}

// Run the matching adapter (if any). Always resolves to a string[].
async function runAdapters(ctx) {
  const host = ctx && ctx.host;
  const adapter = selectAdapter(host);
  if (!adapter) return { name: null, urls: [] };
  try {
    const urls = await adapter.discover(ctx);
    return { name: adapter.name, urls: Array.isArray(urls) ? urls : [] };
  } catch (err) {
    console.warn(`[Adapter:${adapter.name}] discover failed: ${err.message}`);
    return { name: adapter.name, urls: [] };
  }
}

module.exports = { selectAdapter, runAdapters, ADAPTERS };
