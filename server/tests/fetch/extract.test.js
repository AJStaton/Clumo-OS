// Tests for fetch/extract.js — pure HTML extraction + scoring (no network).

const { extractFromHtml, scoreContent, looksLikeShell } = require('../../fetch/extract');

const RICH_CASE_STUDY = `<!doctype html><html><head>
  <title>Acme Corp Success Story | Reduced time-to-hire 50%</title>
  <meta property="og:description" content="How Acme reduced time-to-hire by 50% with our platform.">
  <script type="application/ld+json">{"@type":"Article","headline":"Acme cuts hiring time","description":"Acme Corp reduced time-to-hire by 50% using AI matching."}</script>
</head><body>
  <nav><a href="/about">About</a><a href="/customers">Customers</a></nav>
  <main>
    <h1>Acme Corp reduces time-to-hire by 50%</h1>
    <p>Acme Corp struggled with manual recruiting across 30 countries and high attrition.</p>
    <p>They implemented our Talent CRM with AI-powered skills matching to automate sourcing.</p>
    <p>The result was a 50% reduction in time-to-hire and a 3x increase in qualified candidates, saving an estimated $2M annually.</p>
    <p>This case study shows the measurable ROI and customer outcome of the solution.</p>
  </main>
  <footer><a href="/legal">Legal</a></footer>
</body></html>`;

const SPA_SHELL = `<!doctype html><html><head>
  <title>Loading…</title>
  <script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>
</head><body><div id="__next"></div><script>self.__next_f=[]</script></body></html>`;

describe('extract.extractFromHtml', () => {
  it('extracts title, h1, main text, links and structured data', () => {
    const r = extractFromHtml(RICH_CASE_STUDY, 'https://x.com/customers/acme');
    expect(r.title).toMatch(/Acme Corp Success Story/);
    expect(r.h1).toMatch(/reduces time-to-hire/i);
    expect(r.mainText).toMatch(/Talent CRM/);
    expect(r.mainText).toMatch(/50%/);
    expect(r.jsonld.length).toBe(1);
    expect(r.meta.description).toMatch(/50%/);
    // Links resolve to absolute URLs.
    expect(r.links).toContain('https://x.com/customers');
  });

  it('computes a low main-text count and framework flags for an SPA shell', () => {
    const r = extractFromHtml(SPA_SHELL, 'https://x.com/customers/acme');
    expect(r.signals.mainTextChars).toBeLessThan(100);
    expect(r.signals.hasNextData).toBe(true);
  });

  it('tolerates non-string / empty html', () => {
    expect(() => extractFromHtml(null, 'https://x.com')).not.toThrow();
    expect(extractFromHtml(undefined, 'https://x.com').mainText).toBe('');
  });
});

describe('extract.scoreContent', () => {
  it('scores a rich, on-type case study higher than a shell', () => {
    const rich = extractFromHtml(RICH_CASE_STUDY, 'https://x.com/customers/acme');
    const shell = extractFromHtml(SPA_SHELL, 'https://x.com/customers/acme');
    const richScore = scoreContent(rich, 'case_study');
    const shellScore = scoreContent(shell, 'case_study');
    expect(richScore).toBeGreaterThan(0.5);
    expect(shellScore).toBeLessThan(0.35);
    expect(richScore).toBeGreaterThan(shellScore);
  });
});

describe('extract.looksLikeShell', () => {
  it('flags thin SPA shells and clears rich pages', () => {
    const rich = extractFromHtml(RICH_CASE_STUDY, 'https://x.com/customers/acme');
    const shell = extractFromHtml(SPA_SHELL, 'https://x.com/customers/acme');
    expect(looksLikeShell(shell)).toBe(true);
    expect(looksLikeShell(rich)).toBe(false);
  });
});
