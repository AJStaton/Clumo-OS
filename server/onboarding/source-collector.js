// Source collector: the onboarding orchestrator that turns a website (+ pasted URLs)
// into type-routed content bundles for the knowledge generator.
//
// This replaces the old "scrape one blob, feed it to every generator" approach. It:
//   1. Discovers URLs via sitemap + anchors + pasted URLs, expanding JS listings via the
//      headless harvest (DOM + JSON sniffing) in the discovery layer.
//   2. Fetches pages through the tiered page-fetcher (static -> headless when needed).
//   3. Routes the right pages to the right knowledge type:
//        case_study  <- individual customer-story pages (LLM-extracted, structured)
//        proof       <- blog / research / ROI pages
//        product_truth <- docs + product/platform pages
//        discovery   <- product/platform pages
//        company     <- homepage + top product pages (for company analysis)
//   4. Records per-type coverage + confidence so the UI can warn on weak/missing types.
//
// All fetching goes through the injected/created pageFetcher so this module is testable
// with fakes (no live network).

const { createPageFetcher } = require('../fetch/page-fetcher');
const { discoverUrls } = require('../discovery/url-discovery');
const { buildRelevanceContext, scoreCaseStudyDetailed, hasContext } = require('./relevance');
const HybridWebsiteScraper = require('../hybrid-website-scraper');
const BUNDLE_CHAR_CAP = 120000;         // per-type content cap (~30k tokens) — wide grounding for high-volume generation
const MAX_PAGES_PER_BUNDLE = 30;        // pages folded into a non-case-study bundle
const WEAK_CONFIDENCE = 0.35;           // below this, a fetched page is a "weak" source

// Join fetched pages' main text into a single bundle string, capped.
function bundleText(pages, cap = BUNDLE_CHAR_CAP) {
  let out = '';
  for (const p of pages) {
    if (!p || !p.ok) continue;
    const body = (p.mainText && p.mainText.length > 80) ? p.mainText : (p.summary || '');
    if (!body) continue;
    const block = `\n--- ${p.title || p.url} (${p.url}) ---\n${body}\n`;
    if (out.length + block.length > cap) {
      out += block.substring(0, Math.max(0, cap - out.length));
      break;
    }
    out += block;
  }
  return out.trim();
}

// Fetch a list of classified URLs for one expected type, return fetched page objects.
async function fetchBucket(pageFetcher, bucket, expectedType, limit) {
  const pages = [];
  for (const item of (bucket || []).slice(0, limit)) {
    const page = await pageFetcher.fetch(item.url, { expectedType });
    if (page && page.ok) pages.push(page);
  }
  return pages;
}

function coverageFor(sources, highConfidence, weak, candidates, warning) {
  let status = 'ok';
  if (sources === 0) status = 'missing';
  else if (highConfidence === 0) status = 'degraded';
  return { sources, highConfidence, weak, candidates, status, warning: warning || null };
}

// collectSources(websiteUrl, options) -> structured sources object.
// options:
//   openaiClient      wrapped chat client (model pre-bound) for case-study extraction
//   pastedSources     { caseStudies:[], blog:[], docs:[] }
//   maxCaseStudies    cap on individual case-study pages to LLM-extract
//   onProgress        progress callback
//   pageFetcher       inject a fake fetcher for tests
//   caseStudyExtractor inject a fake extractor for tests
async function collectSources(websiteUrl, options = {}) {
  const {
    openaiClient = null,
    pastedSources = {},
    profile = null,
    priorities = [],
    maxCaseStudies = 50,
    onProgress = null,
    pageFetcher: injectedFetcher = null,
    caseStudyExtractor: injectedExtractor = null,
    discover = discoverUrls
  } = options;

  const pageFetcher = injectedFetcher || createPageFetcher({});
  const emit = (stage, message, extra = {}) => {
    if (onProgress) onProgress({ stage, message, ...extra });
  };

  // Case-study extractor: reuse the hybrid scraper's LLM extraction over fetched content.
  const extractor = injectedExtractor || (openaiClient
    ? new HybridWebsiteScraper(openaiClient, { maxCaseStudies })
    : null);

  const result = {
    bundles: { company: '', discovery: '', proof: '', productTruth: '' },
    extractedCaseStudies: [],
    weakCaseStudyCandidates: [],
    coverage: {},        // per-type: { sources, highConfidence, weak, status }
    telemetry: {}
  };

  try {
    emit('discovery', 'Discovering pages across your site...');
    const { buckets, telemetry: discoveryTelemetry } = await discover(websiteUrl, pageFetcher, {
      pastedSources,
      caseStudyBudget: maxCaseStudies,
      onProgress: (p) => emit('discovery', p.message)
    });

    // --- Company / product / docs / blog content bundles ---
    emit('scraping', 'Reading product and platform pages...');
    const productPages = await fetchBucket(pageFetcher, buckets.product, 'product_truth', MAX_PAGES_PER_BUNDLE);

    emit('scraping', 'Reading documentation...');
    const docsPages = await fetchBucket(pageFetcher, buckets.docs, 'product_truth', MAX_PAGES_PER_BUNDLE);

    emit('scraping', 'Reading blog and research posts...');
    const blogPages = await fetchBucket(pageFetcher, buckets.blog, 'proof_point', MAX_PAGES_PER_BUNDLE);

    // Always read the homepage for company analysis grounding.
    const homepage = await pageFetcher.fetch(websiteUrl, { expectedType: 'discovery_question' });
    const homepageOk = homepage && homepage.ok ? 1 : 0;
    const companyPages = [homepage, ...productPages].filter((p) => p && p.ok);

    result.bundles.company = bundleText(companyPages);
    result.bundles.discovery = bundleText([...productPages, homepage].filter(Boolean));
    result.bundles.proof = bundleText(blogPages);
    result.bundles.productTruth = bundleText([...docsPages, ...productPages]);

    // --- Case studies: fetch each page, then rank by relevance to what the seller sells, and
    // LLM-extract them. Relevance is used ONLY to ORDER the stories (on-focus first) — it never
    // removes a valid story. More case studies is better; the realtime pipeline selects later. ---
    const p = profile || {};
    const relevanceCtx = buildRelevanceContext({
      priorities: Array.isArray(priorities) ? priorities : [],
      focusProducts: p.focusProducts || [],
      focusIndustries: p.focusIndustries || (p.icpIndustry ? [p.icpIndustry] : []),
      personas: p.personas || []
    });

    const csUrls = (buckets.case_study || []).slice(0, maxCaseStudies);
    let csHigh = 0;
    let csWeak = 0;
    let csOffFocus = 0;   // kept, but ranked below on-focus — surfaced for telemetry only
    let csTrusted = 0;    // sourced from the seller's pasted/filtered intent (sorted to the top)
    let csOnFocus = 0;    // matched at least one seller focus term
    if (csUrls.length > 0 && extractor) {
      emit('case_studies', `Reading ${csUrls.length} case-study pages...`);

      // Pass 1: fetch + score (fetch is cached + far cheaper than the LLM extraction).
      const scored = [];
      for (const item of csUrls) {
        const page = await pageFetcher.fetch(item.url, { expectedType: 'case_study' });
        if (!page || !page.ok) continue;
        // A story sourced from what the seller pasted (or harvested from their filtered listing)
        // is trusted: it reflects the seller's explicit intent, so it sorts to the very top.
        const trusted = !!(item.pasted || item.fromPasted || item.trusted);
        const content = (page.mainText && page.mainText.length > 200) ? page.mainText : (page.summary || '');
        if (!content || content.length < 200) {
          // Genuinely thin/failed fetch — the only reason a candidate becomes "weak". This is NOT
          // about focus; an off-focus but well-fetched story is still extracted and kept.
          if (page.summary && page.summary.length > 40) {
            result.weakCaseStudyCandidates.push({ url: page.url, summary: page.summary, title: page.title });
            csWeak += 1;
          }
          continue;
        }
        const detail = scoreCaseStudyDetailed({ text: content, title: page.title, url: page.url }, relevanceCtx);
        if (trusted) csTrusted += 1;
        if (hasContext(relevanceCtx)) {
          if (detail.matchedFocus > 0) csOnFocus += 1;
          else if (!trusted) csOffFocus += 1;
        }
        scored.push({ page, content, trusted, relevance: detail.score, matchedFocus: detail.matchedFocus });
      }

      // Rank: trusted (seller-intent) first, then by relevance, then by fetch confidence. Soft
      // prioritisation only — nothing is dropped for being off-focus.
      if (hasContext(relevanceCtx)) {
        scored.sort((a, b) =>
          (Number(b.trusted) - Number(a.trusted)) ||
          (b.relevance - a.relevance) ||
          (b.page.confidence - a.page.confidence));
      } else {
        scored.sort((a, b) => (Number(b.trusted) - Number(a.trusted)));
      }

      // Pass 2: extract EVERY scored story (in prioritised order) up to the budget. We keep all of
      // them — on-focus stories simply lead.
      let idx = 0;
      for (const s of scored) {
        idx += 1;
        emit('case_studies', `Extracting case study ${idx} of ${scored.length}...`);
        try {
          const extracted = await extractor.extractCaseStudyFromContent(s.content, s.page.url);
          if (extracted && extracted.length > 0) {
            const tagged = extracted.map((cs) => ({
              ...cs,
              _confidence: s.page.confidence,
              _relevance: s.relevance,
              _trusted: s.trusted,
              _weak: s.page.confidence < WEAK_CONFIDENCE
            }));
            result.extractedCaseStudies.push(...tagged);
            if (s.page.confidence >= WEAK_CONFIDENCE) csHigh += extracted.length;
            else csWeak += extracted.length;
          }
        } catch (e) {
          console.warn(`[SourceCollector] Case-study extraction failed for ${s.page.url}: ${e.message}`);
        }
      }
      // Dedupe by company, keep the most complete entry; preserve the prioritised order.
      if (typeof extractor.deduplicateCaseStudies === 'function') {
        result.extractedCaseStudies = extractor.deduplicateCaseStudies(result.extractedCaseStudies);
      }
    }

    // --- Coverage scoring (drives UI warnings) ---
    const productTruthSources = docsPages.length + productPages.length;
    result.coverage = {
      case_study: coverageFor(
        result.extractedCaseStudies.length, csHigh, csWeak, csUrls.length,
        result.extractedCaseStudies.length === 0
          ? 'No case studies found. Paste a customer-story or filtered listing URL to add them.'
          : (csHigh === 0 ? 'Only weak case-study summaries found. Paste a customer-story URL for stronger results.' : null)
      ),
      proof_point: coverageFor(
        blogPages.length, blogPages.length, 0, (buckets.blog || []).length,
        blogPages.length === 0 ? 'No blog/research pages found. Paste a blog or ROI URL for proof points.' : null
      ),
      product_truth: coverageFor(
        productTruthSources, productTruthSources, 0,
        (buckets.docs || []).length + (buckets.product || []).length,
        productTruthSources === 0 ? 'No docs/product pages found. Paste a docs URL for product truths.' : null
      ),
      discovery_question: coverageFor(
        productPages.length + homepageOk, productPages.length + homepageOk, 0,
        (buckets.product || []).length + 1, null
      )
    };

    result.telemetry = {
      discovery: discoveryTelemetry,
      fetch: pageFetcher.getTelemetry(),
      caseStudyOffFocus: csOffFocus,   // kept-but-ranked-lower, not removed
      caseStudyOnFocus: csOnFocus,     // matched seller focus -> surfaced first
      caseStudyTrusted: csTrusted,     // from pasted/filtered seller intent -> top of the order
      buckets: {
        case_study: (buckets.case_study || []).length,
        blog: (buckets.blog || []).length,
        docs: (buckets.docs || []).length,
        product: (buckets.product || []).length
      }
    };

    return result;
  } finally {
    if (!injectedFetcher) {
      try { await pageFetcher.close(); } catch (e) { console.warn('[SourceCollector] fetcher close failed:', e.message); }
    }
  }
}

module.exports = { collectSources, bundleText, coverageFor, BUNDLE_CHAR_CAP };
