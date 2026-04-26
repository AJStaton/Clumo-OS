// Hybrid Website Scraper for Clumo Onboarding
// Phase 1: Uses Cheerio to discover case study URLs (fast, free)
// Phase 2: Uses GPT-4 via Azure OpenAI to extract structured data from each page (quality, reliable)

const axios = require('axios');
const cheerio = require('cheerio');
const WebsiteScraper = require('./website-scraper');

class HybridWebsiteScraper extends WebsiteScraper {
  constructor(openai, options = {}) {
    super();
    this.openai = openai;
    this.maxCaseStudies = options.maxCaseStudies || 50;
    this.extractionTimeout = options.timeout || 30000;
    this.extractionCost = 0;
  }

  // Override scrape() to add Phase 2: LLM extraction
  async scrape(url, onProgress) {
    // Phase 1: Use parent class Cheerio logic to find pages + case study URLs
    const baseResult = await super.scrape(url, onProgress);

    // Phase 2: Extract content from case study URLs using GPT-4
    if (baseResult.caseStudyLinks && baseResult.caseStudyLinks.length > 0) {
      if (onProgress) onProgress({ stage: 'llm_extraction', message: 'Extracting case study details with AI...' });

      const extractedCaseStudies = await this.extractCaseStudiesWithLLM(
        baseResult.caseStudyLinks,
        url,
        onProgress
      );

      baseResult.extractedCaseStudies = extractedCaseStudies;
      baseResult.extractionCost = this.extractionCost;

      console.log(`[Hybrid Scraper] Extracted ${extractedCaseStudies.length} case studies via LLM (cost: $${this.extractionCost.toFixed(4)})`);
    } else {
      console.log('[Hybrid Scraper] No case study links found, skipping LLM extraction');
      baseResult.extractedCaseStudies = [];
    }

    return baseResult;
  }

  // Phase 2: Extract structured case study data from each URL using GPT-4
  async extractCaseStudiesWithLLM(caseStudyLinks, sourceUrl, onProgress) {
    let uniqueUrls = this.deduplicateUrls(caseStudyLinks);

    // Expand listing/library pages into individual case study URLs
    uniqueUrls = await this.expandListingPages(uniqueUrls, sourceUrl, onProgress);

    const limitedUrls = uniqueUrls.slice(0, this.maxCaseStudies);

    console.log(`[Hybrid Scraper] Extracting from ${limitedUrls.length} unique case study URLs (max: ${this.maxCaseStudies})`);

    const results = [];

    for (let i = 0; i < limitedUrls.length; i++) {
      const link = limitedUrls[i];

      if (onProgress) {
        onProgress({
          stage: 'llm_extraction',
          message: `Extracting case study ${i + 1} of ${limitedUrls.length}...`
        });
      }

      try {
        const extracted = await this.extractSinglePage(link.url, sourceUrl);
        if (extracted && extracted.length > 0) {
          results.push(...extracted);
        }
      } catch (error) {
        console.error(`[Hybrid Scraper] Failed to extract from ${link.url}: ${error.message}`);
        // Continue to next URL — don't break the whole pipeline
      }
    }

    // Deduplicate by company name (keep the one with the most complete data)
    return this.deduplicateCaseStudies(results);
  }

  // Extract case studies from a single page using GPT-4
  async extractSinglePage(url, sourceUrl) {
    // Fetch and clean the HTML
    const html = await this.fetchCleanHtml(url);
    if (!html || html.length < 200) {
      console.log(`[Hybrid Scraper] Skipping ${url} — insufficient content`);
      return [];
    }

    const response = await this.openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are an expert at extracting case study information from HTML content.

Your task is to find ALL case studies on this page and extract them into a structured format.

For EACH case study you find, extract:
1. company: The company/organization name (e.g., "Salesforce", "Wells Fargo")
2. headline: A compelling headline, preferably leading with a metric or outcome
3. problem: The specific challenge/problem the company faced
4. solution: Specific products/features mentioned by name
5. result: Specific metrics or quantifiable outcomes
6. link: The full URL to the case study page
7. triggers: 15-20 relevant keywords (mostly single words)

CRITICAL RULES:
- "company" MUST be the organization name, NEVER a person's name
- "link" MUST be the current page URL: ${url} — this page IS the case study, so always use this URL. Never leave it empty.
- "result" MUST include specific numbers/metrics if available
- "solution" MUST reference specific products/features by name
- "triggers" should be mostly single words that would come up in a sales conversation

TRIGGER KEYWORD RULES:
- Mostly SINGLE words: "hiring", "retention", "skills", "analytics", "onboarding"
- Occasionally 2 words max for product names: "talent CRM", "AI matching"
- Include industry terms, pain point words, product names, and synonyms
- 15-20 triggers per case study

Return ONLY valid JSON array format:
[
  {
    "company": "Example Corp",
    "headline": "Example Corp Reduces Time-to-Hire by 50%",
    "problem": "Struggled with manual recruiting across 30 countries",
    "solution": "Implemented Beamery's Talent CRM with AI-powered matching",
    "result": "50% reduction in time-to-hire, 3x increase in qualified candidates",
    "link": "https://example.com/case-study/example-corp",
    "triggers": ["recruiting", "hiring", "talent", "AI", "automation", "global", "CRM"]
  }
]

If no case studies are found on this page, return: []`
        },
        {
          role: 'user',
          content: `Extract all case studies from this HTML content:\n\n${html}`
        }
      ],
      temperature: 0.3,
      max_tokens: 4000
    });

    // Track cost (GPT-4o-mini pricing: $0.00015/1K input, $0.0006/1K output)
    const promptTokens = response.usage?.prompt_tokens || 0;
    const completionTokens = response.usage?.completion_tokens || 0;
    const pageCost = (promptTokens / 1000 * 0.00015) + (completionTokens / 1000 * 0.0006);
    this.extractionCost += pageCost;

    console.log(`[Hybrid Scraper] ${url} — ${promptTokens + completionTokens} tokens, $${pageCost.toFixed(4)}`);

    // Parse the JSON response, then ensure every entry has the source URL as its link
    const parsed = this.parseExtractedJson(response.choices[0].message.content);
    return parsed.map(cs => ({
      ...cs,
      link: cs.link && cs.link.trim() ? cs.link.trim() : url
    }));
  }

  // Fetch a URL and return cleaned HTML content
  async fetchCleanHtml(url) {
    try {
      const response = await axios.get(url, {
        timeout: this.extractionTimeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Clumo/1.0; +https://clumo.co)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        maxRedirects: 3,
        validateStatus: (status) => status < 400
      });

      const $ = cheerio.load(response.data);

      // Remove noise elements
      $('script, style, nav, footer, header, iframe, noscript, svg, [role="navigation"], [role="banner"], .cookie-banner, .popup, .modal').remove();

      // Get cleaned HTML (preserving links for URL extraction)
      const html = $('body').html();

      // Limit to 30k chars (~7500 tokens)
      return html ? html.substring(0, 30000) : null;
    } catch (error) {
      console.error(`[Hybrid Scraper] Failed to fetch ${url}: ${error.message}`);
      return null;
    }
  }

  // Detect if a URL is a case study listing/library page (not an individual case study)
  isListingPage(url) {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname;
      return /case.?stud.*librar/i.test(path) ||
        /case.?stud.*all/i.test(path) ||
        /case.?studi?e?s\/?$/i.test(path) ||
        /case-study-library/i.test(path) ||
        /case-studies\/?$/i.test(path) ||
        /customer.?stori/i.test(path) ||
        /success.?stori/i.test(path) ||
        /customer.?results?\/?$/i.test(path) ||
        /client.?results?\/?$/i.test(path) ||
        /client.?stori/i.test(path) ||
        /client.?spotlights?\/?$/i.test(path) ||
        /customer.?spotlights?\/?$/i.test(path) ||
        /our.?work\/?$/i.test(path) ||
        /our.?clients?\/?$/i.test(path) ||
        /our.?customers?\/?$/i.test(path) ||
        /impact.?stori/i.test(path) ||
        /customer.?experiences?\/?$/i.test(path);
    } catch {
      return false;
    }
  }

  // Expand listing/library pages by crawling them to discover individual case study URLs
  async expandListingPages(uniqueUrls, sourceUrl, onProgress) {
    const listingUrls = [];
    const individualUrls = [];

    for (const link of uniqueUrls) {
      if (this.isListingPage(link.url)) {
        listingUrls.push(link);
      } else {
        individualUrls.push(link);
      }
    }

    if (listingUrls.length === 0) return uniqueUrls;

    const baseDomain = new URL(sourceUrl).hostname;

    for (const listing of listingUrls) {
      console.log(`[Hybrid Scraper] Expanding listing page: ${listing.url}`);
      if (onProgress) onProgress({ stage: 'llm_extraction', message: 'Scanning case study library for individual pages...' });

      try {
        const content = await this.fetchAndParse(listing.url);
        if (!content || !content.links) continue;

        for (const link of content.links) {
          try {
            const parsed = new URL(link);
            if (parsed.hostname !== baseDomain) continue;
            if (this.isListingPage(link)) continue;
            // Match individual case study/customer page URLs
            const isIndividualCaseStudy =
              /case.?stud/i.test(parsed.pathname) ||
              /customer.?stor/i.test(parsed.pathname) ||
              /success.?stor/i.test(parsed.pathname) ||
              /client.?stor/i.test(parsed.pathname) ||
              /testimonial\//i.test(parsed.pathname) ||
              /client.?result\//i.test(parsed.pathname) ||
              /customer.?result\//i.test(parsed.pathname) ||
              /customer.?spotlight\//i.test(parsed.pathname) ||
              /client.?spotlight\//i.test(parsed.pathname) ||
              /our.?work\/.+/i.test(parsed.pathname) ||
              /our.?clients?\/.+/i.test(parsed.pathname) ||
              /our.?customers?\/.+/i.test(parsed.pathname) ||
              /impact.?stor/i.test(parsed.pathname) ||
              /customer.?experience\/.+/i.test(parsed.pathname);
            if (isIndividualCaseStudy) {
              individualUrls.push({ text: '', url: link });
            }
          } catch (e) {
              console.warn(`[Hybrid Scraper] Malformed URL skipped: ${link}`);
            }
        }
      } catch (error) {
        console.error(`[Hybrid Scraper] Failed to expand listing ${listing.url}: ${error.message}`);
      }
    }

    const expanded = this.deduplicateUrls(individualUrls);
    console.log(`[Hybrid Scraper] Expanded ${listingUrls.length} listing page(s) → ${expanded.length} individual case study URLs`);
    return expanded;
  }

  // Remove duplicate URLs from case study links
  deduplicateUrls(links) {
    const seen = new Set();
    const unique = [];

    for (const link of links) {
      // Normalize: remove query params, trailing slash, hash
      let normalized;
      try {
        const parsed = new URL(link.url);
        normalized = parsed.origin + parsed.pathname.replace(/\/$/, '');
      } catch {
        normalized = link.url;
      }

      if (!seen.has(normalized)) {
        seen.add(normalized);
        unique.push(link);
      }
    }

    return unique;
  }

  // Remove duplicate case studies by company name
  deduplicateCaseStudies(caseStudies) {
    const byCompany = new Map();

    for (const cs of caseStudies) {
      const key = cs.company.toLowerCase().trim();
      const existing = byCompany.get(key);

      if (!existing) {
        byCompany.set(key, cs);
      } else {
        // Keep the one with more complete data
        const existingScore = this.completenessScore(existing);
        const newScore = this.completenessScore(cs);
        if (newScore > existingScore) {
          byCompany.set(key, cs);
        }
      }
    }

    return Array.from(byCompany.values());
  }

  // Score how complete a case study entry is
  completenessScore(cs) {
    let score = 0;
    if (cs.company && cs.company.length > 0) score += 1;
    if (cs.headline && cs.headline.length > 0) score += 1;
    if (cs.problem && cs.problem.length > 0) score += 1;
    if (cs.solution && cs.solution.length > 0) score += 1;
    if (cs.result && cs.result.length > 0) score += 2; // Results are extra valuable
    if (cs.link && cs.link.length > 0) score += 2; // Links are extra valuable
    if (cs.triggers && cs.triggers.length > 5) score += 1;
    return score;
  }

  // Parse JSON from GPT response, handling markdown code blocks
  parseExtractedJson(content) {
    let cleaned = content.trim();

    // Remove markdown code blocks if present
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

    try {
      const parsed = JSON.parse(cleaned);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      // Try to extract array from content
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          return Array.isArray(parsed) ? parsed : [];
        } catch (e2) {
          console.error('[Hybrid Scraper] Failed to parse LLM response as JSON');
          return [];
        }
      }
      console.error('[Hybrid Scraper] No JSON array found in LLM response');
      return [];
    }
  }
}

module.exports = HybridWebsiteScraper;
