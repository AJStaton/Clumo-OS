// Identity key for a case study, used to collapse true duplicates while keeping
// genuinely distinct stories from the SAME customer (e.g. two different Azure
// stories from EY). Company name alone is too coarse: a single customer can have
// many distinct stories, and keying on company silently discards all but one.
//
// Strategy (host-agnostic):
//   1. Prefer the source URL, normalized so locale variants (/en-gb vs /en-us)
//      and tracking query strings collapse but distinct story paths stay distinct.
//   2. Fall back to company + headline when there is no link.
//   3. Fall back to company or headline alone as a last resort.

function normalizeStoryUrl(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  try {
    const u = new URL(s.includes('://') ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    const segs = u.pathname.split('/').filter(Boolean);
    // Drop a single leading locale segment like "en", "en-gb", "de-de", "fr".
    if (segs.length && /^[a-z]{2}(-[a-z]{2})?$/i.test(segs[0])) segs.shift();
    const path = segs.join('/').toLowerCase().replace(/\/+$/, '');
    return path ? `${host}/${path}` : host;
  } catch (e) {
    // Not a parseable URL: strip query/hash + trailing slashes and lowercase.
    return s.toLowerCase().replace(/[#?].*$/, '').replace(/\/+$/, '');
  }
}

function caseStudyKey(item) {
  const link = item && item.link != null ? String(item.link).trim() : '';
  if (link) {
    const n = normalizeStoryUrl(link);
    if (n) return `url:${n}`;
  }
  const company = item && item.company != null ? String(item.company).toLowerCase().trim() : '';
  const headline = item && item.headline != null ? String(item.headline).toLowerCase().trim() : '';
  if (company && headline) return `ch:${company}::${headline}`;
  if (company) return `co:${company}`;
  if (headline) return `hl:${headline}`;
  return `raw:${JSON.stringify(item || {})}`;
}

module.exports = { caseStudyKey, normalizeStoryUrl };
