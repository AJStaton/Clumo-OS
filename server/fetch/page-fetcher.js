// Page fetcher: the tiered-fetch orchestrator.
// Tries the static path first; escalates to headless only when a page looks like a
// low-confidence SPA shell for the type we expect. Caches results per run (a page is
// often referenced by both discovery and extraction) and records per-source metadata.

const { fetchStatic } = require('./static-fetcher');
const { createHeadlessFetcher } = require('./headless-fetcher');
const { scoreContent, looksLikeShell } = require('./extract');
const { URL } = require('url');

// Generic (host-agnostic) path keywords that mark a link as an individual customer story / case
// study. Used only to gauge whether a forced listing render actually surfaced candidate story
// links (vs. just nav/footer chrome) — the discovery layer's classifier does the authoritative
// categorisation later.
const CANDIDATE_PATH_RE = /\/(customer-stories|customers?|case-studies|case-study|success-stories|stories|story|success|references?|testimonials?)\b/i;

function countCandidateLinks(links) {
  let n = 0;
  for (const link of links || []) {
    try { if (CANDIDATE_PATH_RE.test(new URL(link).pathname)) n += 1; } catch { /* skip */ }
  }
  return n;
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    // Strip common tracking params to improve cache hits + dedupe.
    for (const p of [...u.searchParams.keys()]) {
      if (/^utm|^gclid$|^fbclid$|^mc_/i.test(p)) u.searchParams.delete(p);
    }
    let s = u.origin + u.pathname.replace(/\/$/, '');
    const qs = u.searchParams.toString();
    if (qs) s += '?' + qs;
    return s;
  } catch {
    return url;
  }
}

function createPageFetcher(options = {}) {
  const {
    confidenceThreshold = 0.35,
    headless: headlessEnabled = true,
    maxHeadlessRenders = 20,
    staticTimeout = 12000,
    headlessOptions = {},
    // Injectable for testing: a static fetch function and a headless fetcher instance.
    fetchStaticFn = fetchStatic,
    headlessFetcher: injectedHeadless = undefined
  } = options;

  const cache = new Map();        // normalizedUrl -> page result
  const sources = [];             // per-source metadata for telemetry
  const headlessFetcher = injectedHeadless !== undefined
    ? injectedHeadless
    : (headlessEnabled
      ? createHeadlessFetcher({ maxRenders: maxHeadlessRenders, ...headlessOptions })
      : null);

  // Fetch a single URL with tiered escalation.
  // opts.expectedType drives the confidence scoring / escalation decision.
  // opts.forceHeadless renders directly (used for known JS listing pages).
  async function fetch(url, opts = {}) {
    const { expectedType = null, forceHeadless = false } = opts;
    // A forced-headless fetch is how we expand JS listing pages — drive scroll/load-more + sniff
    // JSON in that case so SPA tiles are harvested deterministically.
    const listing = forceHeadless || opts.listing === true;
    const key = normalizeUrl(url);
    let priorStatic = null;
    if (cache.has(key)) {
      const cached = cache.get(key);
      // A forceHeadless request must not be satisfied by a cached static result —
      // otherwise JS-rendered listing pages (already fetched statically during anchor
      // discovery) never get expanded headlessly. Re-render in that case, but keep the
      // cached result as a fallback if the headless render yields nothing usable.
      if (!forceHeadless || cached.renderedVia === 'headless') return cached;
      if (cached.ok) priorStatic = cached;
    }

    let staticResult = priorStatic;
    if (!forceHeadless) {
      staticResult = await fetchStaticFn(url, { timeout: staticTimeout });
    }

    const staticConfidence = staticResult && staticResult.ok
      ? scoreContent(staticResult, expectedType)
      : 0;

    const shouldEscalate = headlessFetcher && (
      forceHeadless ||
      !staticResult ||
      !staticResult.ok ||
      (looksLikeShell(staticResult) && staticConfidence < confidenceThreshold)
    );

    let result = staticResult;
    let renderedVia = staticResult && staticResult.ok ? 'static' : 'failed';
    let confidence = staticConfidence;
    let renderedDeltaChars = 0;

    if (shouldEscalate) {
      const rendered = await headlessFetcher.fetch(url, { listing });
      if (rendered && rendered.ok) {
        const headlessConfidence = scoreContent(rendered, expectedType);
        const staticChars = staticResult ? staticResult.signals.mainTextChars : 0;
        renderedDeltaChars = rendered.signals.mainTextChars - staticChars;
        // A listing render counts as successful when it surfaces candidate STORY links (tiles),
        // even if its main text is thin — that's the whole point of expanding it. We count only
        // story-like links (DOM + JSON), so generic nav/footer chrome doesn't make us keep a
        // rendered result that has no real stories over richer cached static content. Otherwise
        // keep whichever tier produced richer text.
        const renderedCandidateLinks = countCandidateLinks(rendered.links) + (rendered.jsonLinks ? rendered.jsonLinks.length : 0);
        const listingHasLinks = listing && renderedCandidateLinks > 0;
        if (!staticResult || !staticResult.ok || rendered.signals.mainTextChars > staticChars || listingHasLinks) {
          result = rendered;
          renderedVia = 'headless';
          confidence = headlessConfidence;
        }
      }
    }

    if (!result || !result.ok) {
      const failed = {
        url,
        ok: false,
        renderedVia: 'failed',
        mainText: '',
        summary: '',
        links: [],
        jsonLinks: [],
        jsonld: [],
        meta: {},
        signals: { mainTextChars: 0 },
        confidence: 0
      };
      cache.set(key, failed);
      sources.push({ url: key, renderedVia: 'failed', mainTextChars: 0, confidence: 0, renderedDeltaChars: 0, expectedType });
      return failed;
    }

    const final = { ...result, confidence, renderedVia, jsonLinks: result.jsonLinks || [] };
    cache.set(key, final);
    sources.push({
      url: key,
      renderedVia,
      mainTextChars: result.signals.mainTextChars,
      structuredDataFound: result.signals.jsonldCount > 0 || result.signals.hasOgDescription,
      confidence,
      renderedDeltaChars,
      expectedType
    });
    return final;
  }

  async function close() {
    if (headlessFetcher) await headlessFetcher.close();
  }

  function getTelemetry() {
    return {
      pagesFetched: cache.size,
      sources: [...sources],
      headlessRenders: headlessFetcher ? headlessFetcher.getRendersUsed() : 0,
      headlessDisabled: headlessFetcher ? headlessFetcher.isDisabled() : true,
      warnings: headlessFetcher ? headlessFetcher.getWarnings() : []
    };
  }

  return { fetch, close, getTelemetry, normalizeUrl };
}

module.exports = { createPageFetcher, normalizeUrl };
