// Provider adapter registry.
//
// Adapters are an OPTIONAL, host-AGNOSTIC discovery tier: an adapter is
// `{ name, matches(host) => bool, discover(ctx) => Promise<string[]> }` whose `discover`
// returns a flat list of candidate URLs. They MUST be best-effort: never throw, return []
// on any failure so the pipeline still succeeds via the static + sitemap + headless tiers.
//
// No host-specific adapters are registered. SPA / JS-rendered listings (whose story tiles
// are injected client-side and absent from raw HTML) are now handled generically by the
// headless harvest in fetch/headless-fetcher.js — bounded scroll/load-more interaction plus
// JSON-response sniffing — so no per-vendor sitemap/endpoint code is needed or shipped.
// This array is the seam for any future genuinely host-agnostic adapter.

const ADAPTERS = [];

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
