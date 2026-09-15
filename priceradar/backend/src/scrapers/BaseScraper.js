import { chromium } from "playwright";

/**
 * Every site-specific scraper extends this. Keeps a consistent
 * interface so the aggregator doesn't care which site it's talking to.
 */
export class BaseScraper {
  constructor({ source, headless = true, timeoutMs = 15000 }) {
    this.source = source;
    this.headless = headless;
    this.timeoutMs = timeoutMs;
  }

  async withBrowser(fn) {
    const browser = await chromium.launch({ headless: this.headless });
    try {
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        locale: "en-IN",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(this.timeoutMs);
      return await fn(page);
    } finally {
      await browser.close();
    }
  }

  /**
   * @param {string} query - search term e.g. "iPhone 15 128GB"
   * @returns {Promise<Array<{title, url, price, inStock, imageUrl}>>}
   */
  async search(query) {
    throw new Error(`search() not implemented for ${this.source}`);
  }

  /**
   * @param {string} url - product page URL
   * @returns {Promise<{title, price, inStock, imageUrl}|null>}
   */
  async getPrice(url) {
    throw new Error(`getPrice() not implemented for ${this.source}`);
  }

  /**
   * Optional: return the raw text of each bullet in the product page's
   * "offers" / "bank offers" box. The aggregator runs these through
   * services/bankOfferParser.js and drops anything below the confidence
   * threshold into a review queue. Default: none.
   *
   * @param {string} url - product page URL
   * @returns {Promise<string[]>}
   */
  async fetchBankOffers(url) {
    return [];
  }
}
