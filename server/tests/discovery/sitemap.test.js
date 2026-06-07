// Tests for discovery/sitemap.js — robots + sitemap parsing (injected fetchText, no network).

const {
  extractLocs, isSitemapIndex, sitemapsFromRobots, collectFromSitemap, discoverSitemapUrls
} = require('../../discovery/sitemap');

const INDEX_XML = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://x.com/sitemap-pages.xml</loc></sitemap>
  <sitemap><loc>https://x.com/sitemap-blog.xml</loc></sitemap>
</sitemapindex>`;

const PAGES_XML = `<?xml version="1.0"?>
<urlset><url><loc>https://x.com/customers/acme</loc></url>
<url><loc>https://x.com/product</loc></url></urlset>`;

const BLOG_XML = `<?xml version="1.0"?>
<urlset><url><loc>https://x.com/blog/roi</loc></url></urlset>`;

function fakeFetch(map) {
  return async (url) => map[url] || '';
}

describe('sitemap.extractLocs / isSitemapIndex', () => {
  it('extracts <loc> values', () => {
    expect(extractLocs(PAGES_XML)).toEqual(['https://x.com/customers/acme', 'https://x.com/product']);
  });
  it('detects a sitemap index', () => {
    expect(isSitemapIndex(INDEX_XML)).toBe(true);
    expect(isSitemapIndex(PAGES_XML)).toBe(false);
  });
});

describe('sitemap.sitemapsFromRobots', () => {
  it('parses Sitemap: directives from robots.txt', async () => {
    const fetchText = fakeFetch({
      'https://x.com/robots.txt': 'User-agent: *\nDisallow:\nSitemap: https://x.com/sitemap.xml\n'
    });
    const refs = await sitemapsFromRobots('https://x.com', fetchText);
    expect(refs).toEqual(['https://x.com/sitemap.xml']);
  });
});

describe('sitemap.collectFromSitemap', () => {
  it('recurses sitemap indexes and collects all page URLs', async () => {
    const fetchText = fakeFetch({
      'https://x.com/sitemap.xml': INDEX_XML,
      'https://x.com/sitemap-pages.xml': PAGES_XML,
      'https://x.com/sitemap-blog.xml': BLOG_XML
    });
    const locs = await collectFromSitemap('https://x.com/sitemap.xml', fetchText);
    expect(locs).toContain('https://x.com/customers/acme');
    expect(locs).toContain('https://x.com/blog/roi');
    expect(locs.length).toBe(3);
  });

  it('guards against cyclic sitemap references', async () => {
    const cyclic = `<sitemapindex><sitemap><loc>https://x.com/sitemap.xml</loc></sitemap></sitemapindex>`;
    const fetchText = fakeFetch({ 'https://x.com/sitemap.xml': cyclic });
    const locs = await collectFromSitemap('https://x.com/sitemap.xml', fetchText);
    expect(locs).toEqual([]);
  });
});

describe('sitemap.discoverSitemapUrls', () => {
  it('combines robots + default sitemap locations', async () => {
    const fetchText = fakeFetch({
      'https://x.com/robots.txt': 'Sitemap: https://x.com/sitemap.xml',
      'https://x.com/sitemap.xml': PAGES_XML
    });
    const urls = await discoverSitemapUrls('https://x.com', fetchText);
    expect(urls).toContain('https://x.com/customers/acme');
    expect(urls).toContain('https://x.com/product');
  });
});
