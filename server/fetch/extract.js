// HTML content extraction + scoring, shared by the static and headless fetchers.
// Pure functions over an HTML string so they are trivially unit-testable with fixtures
// (no live network). Extracts clean text, structured data (JSON-LD / OpenGraph /
// __NEXT_DATA__), links, and a set of signals used to score per-page confidence.

const cheerio = require('cheerio');
const { URL } = require('url');

const NOISE_SELECTOR = 'script, style, nav, footer, header, iframe, noscript, svg, ' +
  '[role="navigation"], [role="banner"], .cookie-banner, .cookie-consent, .popup, .modal, ' +
  '#onetrust-consent-sdk, [aria-label="cookie" i]';

// Pull every JSON-LD block, tolerating malformed JSON.
function extractJsonLd($) {
  const blocks = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw || !raw.trim()) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else blocks.push(parsed);
    } catch {
      // Some sites concatenate multiple objects or include trailing junk — try a loose grab.
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { blocks.push(JSON.parse(match[0])); } catch { /* ignore */ }
      }
    }
  });
  return blocks;
}

// OpenGraph / Twitter / meta description — cheap structured signal that survives SPAs.
function extractMeta($) {
  const get = (sel, attr = 'content') => {
    const v = $(sel).attr(attr);
    return v ? v.trim() : '';
  };
  return {
    title: get('meta[property="og:title"]') || get('meta[name="twitter:title"]'),
    description: get('meta[property="og:description"]') ||
      get('meta[name="twitter:description"]') ||
      get('meta[name="description"]'),
    type: get('meta[property="og:type"]'),
    siteName: get('meta[property="og:site_name"]'),
    canonical: $('link[rel="canonical"]').attr('href') || ''
  };
}

// Best-effort summary text from structured data, used as a weak-candidate fallback
// when a page renders as a shell (e.g. Legora individual story pages).
function structuredSummary(jsonld, meta) {
  const parts = [];
  for (const block of jsonld) {
    if (!block || typeof block !== 'object') continue;
    for (const key of ['headline', 'name', 'description', 'articleBody', 'about']) {
      const val = block[key];
      if (typeof val === 'string' && val.length > 20) parts.push(val);
    }
  }
  if (meta.title) parts.unshift(meta.title);
  if (meta.description) parts.push(meta.description);
  // Dedupe while preserving order.
  return [...new Set(parts)].join('\n').trim();
}

function resolveLinks($, baseUrl) {
  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      links.push(new URL(href, baseUrl).href);
    } catch { /* skip malformed */ }
  });
  return links;
}

// Extract clean, content-focused text. Prefers main/article regions and strips boilerplate.
function extractText($) {
  const $main = $('main, article, [role="main"], .content, .main-content, #content, #main').first();
  const $root = $main.length > 0 ? $main : $('body');

  // Remove noise from the chosen root only.
  $root.find(NOISE_SELECTOR).remove();

  const parts = [];
  $root.find('h1, h2, h3, h4, h5, h6, p, li, td, th, blockquote, figcaption').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t.length > 10) parts.push(t);
  });
  const mainText = parts.join('\n');
  const uniqueParagraphs = new Set(parts).size;
  return { mainText, uniqueParagraphs };
}

function detectFramework(html) {
  return {
    hasNextData: /__NEXT_DATA__/.test(html) || /self\.__next_f/.test(html),
    hasNuxt: /window\.__NUXT__/.test(html),
    hasReactRoot: /data-reactroot|id="root"|id="__next"/.test(html)
  };
}

// Main entry: parse an HTML string into a normalized structure + signals.
function extractFromHtml(html, url) {
  const safeHtml = typeof html === 'string' ? html : '';
  const $ = cheerio.load(safeHtml);

  const title = ($('title').first().text() || '').trim();
  const h1 = ($('h1').first().text() || '').trim();
  const links = resolveLinks($, url);
  const jsonld = extractJsonLd($);
  const meta = extractMeta($);
  const fw = detectFramework(safeHtml);

  // Full body text BEFORE stripping (for boilerplate ratio).
  const fullBodyText = $('body').text().replace(/\s+/g, ' ').trim();

  const { mainText, uniqueParagraphs } = extractText($);
  const summary = structuredSummary(jsonld, meta);

  const mainTextChars = mainText.length;
  const fullTextChars = fullBodyText.length;
  const boilerplateRatio = fullTextChars > 0
    ? Math.max(0, 1 - mainTextChars / fullTextChars)
    : 1;

  return {
    url,
    title,
    h1,
    mainText,
    summary,
    links,
    jsonld,
    meta,
    signals: {
      rawBytes: safeHtml.length,
      mainTextChars,
      fullTextChars,
      boilerplateRatio: Number(boilerplateRatio.toFixed(3)),
      uniqueParagraphs,
      jsonldCount: jsonld.length,
      hasOgDescription: Boolean(meta.description),
      ...fw
    }
  };
}

// Type-relevance keyword sets used to score whether a page is a good source for a type.
const TYPE_SIGNALS = {
  case_study: [
    'case study', 'customer story', 'success story', 'results', 'challenge', 'solution',
    'outcome', 'testimonial', 'roi', 'increase', 'reduced', 'saved', 'customer'
  ],
  proof_point: [
    'roi', 'research', 'report', 'survey', 'study', 'analyst', 'gartner', 'forrester', 'idc',
    'benchmark', 'statistic', '%', 'increase', 'savings', 'award'
  ],
  product_truth: [
    'security', 'compliance', 'soc 2', 'gdpr', 'iso', 'architecture', 'api', 'integration',
    'sla', 'uptime', 'encryption', 'deployment', 'platform', 'documentation', 'feature'
  ],
  discovery_question: [
    'platform', 'solution', 'feature', 'product', 'capabilit', 'workflow', 'use case', 'benefit'
  ]
};

function keywordHits(text, keywords) {
  const lower = (text || '').toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) hits += 1;
  }
  return hits;
}

// Score a page's confidence as a source for an expected type (0..1).
// Combines content richness, boilerplate ratio, and type-relevance keyword density.
function scoreContent(extracted, expectedType) {
  const s = extracted.signals;
  // Richness: saturates around ~1500 chars of main content.
  const richness = Math.min(1, s.mainTextChars / 1500);
  // Penalize pages that are almost entirely nav/footer boilerplate.
  const contentRatio = 1 - Math.min(1, s.boilerplateRatio);
  // Type relevance from main text + structured summary.
  const haystack = `${extracted.mainText} ${extracted.summary} ${extracted.title}`;
  const keywords = TYPE_SIGNALS[expectedType] || [];
  const relevance = keywords.length > 0
    ? Math.min(1, keywordHits(haystack, keywords) / 5)
    : 0.5;

  const confidence = 0.5 * richness + 0.2 * contentRatio + 0.3 * relevance;
  return Number(Math.max(0, Math.min(1, confidence)).toFixed(3));
}

// Heuristic: does this look like an unrendered SPA shell that headless might rescue?
function looksLikeShell(extracted) {
  const s = extracted.signals;
  if (s.mainTextChars >= 600) return false; // already has real content
  // Thin text + a framework marker => likely client-rendered.
  return (s.hasNextData || s.hasNuxt || s.hasReactRoot) || s.mainTextChars < 200;
}

module.exports = {
  extractFromHtml,
  scoreContent,
  looksLikeShell,
  structuredSummary,
  TYPE_SIGNALS,
  NOISE_SELECTOR
};
