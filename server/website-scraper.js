// Website Scraper for Clumo Onboarding
// Scrapes a company website to extract content for knowledge base generation

const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

// Patterns to identify key pages worth scraping
const KEY_PAGE_PATTERNS = [
  /about/i, /product/i, /feature/i, /solution/i, /platform/i,
  /customer/i, /case.?stud/i, /testimonial/i, /success/i,
  /pricing/i, /plan/i, /why/i, /benefit/i, /how.?it.?work/i,
  /integrat/i, /partner/i, /security/i, /enterprise/i,
  /resource/i, /use.?case/i, /industr/i
];

// Pages/paths to skip
const SKIP_PATTERNS = [
  /\.(pdf|png|jpg|jpeg|gif|svg|css|js|zip|mp4|mp3|webp)$/i,
  /blog\/\d/i, /page\/\d/i, // paginated blog/listing pages
  /login/i, /signup/i, /sign-up/i, /register/i, /account/i,
  /careers/i, /jobs/i, /legal/i, /privacy/i, /terms/i, /cookie/i,
  /sitemap/i, /rss/i, /feed/i, /cdn-cgi/i,
  /#/, /mailto:/, /tel:/, /javascript:/
];

class WebsiteScraper {
  constructor() {
    this.visited = new Set();
    this.results = [];
    this.maxPages = 15;
    this.timeout = 10000; // 10s per page
  }

  // Main entry point: scrape a website URL
  async scrape(url, onProgress) {
    this.visited.clear();
    this.results = [];

    // Normalize URL
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }

    const baseUrl = new URL(url);
    const baseDomain = baseUrl.hostname;

    if (onProgress) onProgress({ stage: 'homepage', message: 'Fetching homepage...' });

    // Step 1: Scrape the homepage
    const homepageContent = await this.fetchAndParse(url);
    if (!homepageContent) {
      throw new Error('Could not fetch the website. Please check the URL and try again.');
    }

    this.results.push(homepageContent);
    this.visited.add(url);

    // Step 2: Find key internal links
    const links = this.findKeyLinks(homepageContent.links, baseDomain, url);

    if (onProgress) onProgress({ stage: 'subpages', message: `Found ${links.length} key pages to scan...` });

    // Step 3: Scrape key subpages (3 concurrent)
    const chunks = this.chunkArray(links, 3);
    for (const chunk of chunks) {
      if (this.results.length >= this.maxPages) break;

      const promises = chunk.map(async (link) => {
        if (this.results.length >= this.maxPages) return;
        if (this.visited.has(link)) return;
        this.visited.add(link);

        try {
          const content = await this.fetchAndParse(link);
          if (content && content.text.length > 100) {
            this.results.push(content);
          }
        } catch (e) {
          console.warn(`[Scraper] Failed to scrape ${link}:`, e.message);
        }
      });

      await Promise.all(promises);
    }

    if (onProgress) onProgress({ stage: 'complete', message: `Scraped ${this.results.length} pages` });

    // Collect all case study links across all pages
    const allCaseStudyLinks = [];
    for (const result of this.results) {
      if (result.caseStudyLinks) {
        allCaseStudyLinks.push(...result.caseStudyLinks);
      }
    }

    // Step 4: Hunt for case study listing/library pages we may have missed due to maxPages limit
    // These pages are gold mines — worth crawling even beyond the maxPages cap
    const allDiscoveredLinks = [];
    for (const result of this.results) {
      if (result.links) allDiscoveredLinks.push(...result.links);
    }

    const caseStudyListingPatterns = [
      /case.?stud.*librar/i, /case.?stud.*all/i, /case.?studi?e?s\/?$/i,
      /case-study-library/i, /case-studies\/?$/i,
      /customer.?stori/i, /success.?stori/i,
      /customer.?results?\/?$/i, /client.?results?\/?$/i,
      /client.?stori/i, /client.?spotlights?\/?$/i,
      /customer.?spotlights?\/?$/i,
      /our.?work\/?$/i, /our.?clients?\/?$/i, /our.?customers?\/?$/i,
      /impact.?stori/i, /customer.?experiences?\/?$/i
    ];

    for (const link of allDiscoveredLinks) {
      try {
        const parsed = new URL(link);
        if (parsed.hostname !== baseDomain) continue;
        const normalized = parsed.origin + parsed.pathname.replace(/\/$/, '');
        if (this.visited.has(normalized)) continue;

        const isListingPage = caseStudyListingPatterns.some(p => p.test(parsed.pathname));
        if (isListingPage) {
          this.visited.add(normalized);
          if (onProgress) onProgress({ stage: 'case_studies', message: 'Found case study library, hunting for case studies...' });
          console.log(`[Scraper] Crawling case study listing page: ${normalized}`);

          const content = await this.fetchAndParse(link);
          if (content) {
            if (content.caseStudyLinks) {
              allCaseStudyLinks.push(...content.caseStudyLinks);
            }
            // Also add any links on the listing page that look like individual case studies
            if (content.links) {
              for (const subLink of content.links) {
                try {
                  const subParsed = new URL(subLink);
                  if (subParsed.hostname !== baseDomain) continue;
                  if (caseStudyListingPatterns.some(p => p.test(subParsed.pathname))) continue;
                  const isIndividual =
                    /case.?stud/i.test(subParsed.pathname) ||
                    /customer.?stor/i.test(subParsed.pathname) ||
                    /success.?stor/i.test(subParsed.pathname) ||
                    /client.?stor/i.test(subParsed.pathname) ||
                    /testimonial\//i.test(subParsed.pathname) ||
                    /client.?result\//i.test(subParsed.pathname) ||
                    /customer.?result\//i.test(subParsed.pathname) ||
                    /customer.?spotlight\//i.test(subParsed.pathname) ||
                    /our.?work\/.+/i.test(subParsed.pathname) ||
                    /our.?clients?\/.+/i.test(subParsed.pathname) ||
                    /our.?customers?\/.+/i.test(subParsed.pathname) ||
                    /impact.?stor/i.test(subParsed.pathname) ||
                    /customer.?experience\/.+/i.test(subParsed.pathname);
                  if (isIndividual) {
                    allCaseStudyLinks.push({ text: '', url: subLink });
                  }
                } catch (e) {
                  console.warn(`[Scraper] Malformed URL skipped: ${subLink}`);
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn(`[Scraper] Malformed URL skipped: ${link}`);
      }
    }

    return {
      domain: baseDomain,
      pagesScraped: this.results.length,
      pages: this.results.map(r => ({
        url: r.url,
        title: r.title,
        content: r.text
      })),
      caseStudyLinks: allCaseStudyLinks
    };
  }

  // Fetch a URL and parse its HTML content
  async fetchAndParse(url) {
    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Clumo/1.0; +https://clumo.co)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        maxRedirects: 3,
        validateStatus: (status) => status < 400
      });

      const $ = cheerio.load(response.data);

      // Extract title before removing noise (title tag is in <head>, safe either way)
      const title = $('title').text().trim() ||
        $('h1').first().text().trim() ||
        '';

      // Extract all links and case study links BEFORE removing noise elements,
      // because nav/header/footer menus often contain case study and key page links
      const links = [];
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href) {
          try {
            const resolved = new URL(href, url).href;
            links.push(resolved);
          } catch (e) {
            // Skip malformed URLs
          }
        }
      });

      // Extract case study links (with text + URL pairs)
      const caseStudyLinks = [];
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        const linkText = $(el).text().trim();

        if (href && linkText) {
          try {
            const resolved = new URL(href, url).href;
            const parsedUrl = new URL(resolved);

            // Check if this looks like a case study link (URL path patterns)
            const isCaseStudy =
              /case.?stud/i.test(parsedUrl.pathname) ||
              /customer.?stor/i.test(parsedUrl.pathname) ||
              /success.?stor/i.test(parsedUrl.pathname) ||
              /testimonial/i.test(parsedUrl.pathname) ||
              /client.?stor/i.test(parsedUrl.pathname) ||
              /client.?result/i.test(parsedUrl.pathname) ||
              /customer.?result/i.test(parsedUrl.pathname) ||
              /customer.?spotlight/i.test(parsedUrl.pathname) ||
              /our.?work\//i.test(parsedUrl.pathname) ||
              /our.?clients?\//i.test(parsedUrl.pathname) ||
              /our.?customers?\//i.test(parsedUrl.pathname) ||
              /customer.?experience/i.test(parsedUrl.pathname) ||
              /impact.?stor/i.test(parsedUrl.pathname) ||
              // Or if the link is in a case study section
              ($(el).closest('[class*="case"], [class*="customer"], [class*="testimonial"], [class*="success"], [class*="client"], [class*="story"], [class*="stories"], [class*="spotlight"]').length > 0 && linkText.length > 10);

            if (isCaseStudy) {
              caseStudyLinks.push({
                text: linkText,
                url: resolved
              });
            }
          } catch (e) {
            // Skip malformed URLs
          }
        }
      });

      // Now remove noise elements for clean text extraction
      $('script, style, nav, footer, header, iframe, noscript, svg, [role="navigation"], [role="banner"], .cookie-banner, .popup, .modal').remove();

      // Extract main text content
      const textParts = [];

      // Prioritize main content areas
      const mainContent = $('main, article, [role="main"], .content, .main-content, #content, #main').first();
      const contentRoot = mainContent.length > 0 ? mainContent : $('body');

      contentRoot.find('h1, h2, h3, h4, h5, h6, p, li, td, th, blockquote, figcaption').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 10) {
          textParts.push(text);
        }
      });

      const text = textParts.join('\n');

      return { url, title, text, links, caseStudyLinks };
    } catch (error) {
      return null;
    }
  }

  // Filter and prioritize key internal links
  findKeyLinks(allLinks, baseDomain, baseUrl) {
    const seen = new Set();
    const keyLinks = [];

    for (const link of allLinks) {
      try {
        const parsed = new URL(link);

        // Must be same domain
        if (parsed.hostname !== baseDomain) continue;

        // Normalize: remove hash, trailing slash
        const normalized = parsed.origin + parsed.pathname.replace(/\/$/, '');
        if (seen.has(normalized) || this.visited.has(normalized)) continue;

        // Skip unwanted patterns
        if (SKIP_PATTERNS.some(p => p.test(link))) continue;

        // Check if this looks like a key page
        const isKeyPage = KEY_PAGE_PATTERNS.some(p => p.test(parsed.pathname));
        if (isKeyPage) {
          seen.add(normalized);
          keyLinks.push(normalized);
        }
      } catch (e) {
        // Skip malformed URLs
      }
    }

    // Also add some standard paths that might exist
    const standardPaths = ['/about', '/products', '/features', '/solutions', '/customers', '/pricing', '/why-us', '/platform'];
    for (const p of standardPaths) {
      const fullUrl = `https://${baseDomain}${p}`;
      if (!seen.has(fullUrl) && !this.visited.has(fullUrl)) {
        seen.add(fullUrl);
        keyLinks.push(fullUrl);
      }
    }

    return keyLinks.slice(0, this.maxPages - 1); // -1 for homepage already scraped
  }

  // Split array into chunks for concurrency control
  chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}

module.exports = WebsiteScraper;
