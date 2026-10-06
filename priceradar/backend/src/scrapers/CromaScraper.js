import { BaseScraper } from "./BaseScraper.js";

/**
 * Croma.com scraper — major Indian electronics retailer (Tata-owned).
 * 
 * Croma blocks headless browser scraping with bot protection, so we use
 * their internal search API directly. This is faster and more reliable.
 * The API endpoint may change — check Network tab on croma.com/searchB if broken.
 */
export class CromaScraper extends BaseScraper {
  constructor(opts = {}) {
    super({ source: "croma", ...opts });
  }

  async search(query) {
    try {
      // Croma uses an Algolia-based search API. Try their public search endpoint.
      const searchUrl = `https://api.croma.com/searchservices/v1/search?currentPage=0&query=${encodeURIComponent(query)}&pageSize=12&channel=WEB`;
      
      const response = await fetch(searchUrl, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          "Origin": "https://www.croma.com",
          "Referer": "https://www.croma.com/",
        },
      });

      if (!response.ok) {
        // If the API fails, fall back to Playwright-based scraping
        return this._fallbackSearch(query);
      }

      const data = await response.json();
      const products = data?.products || data?.results || [];

      return products.slice(0, 12).map((product) => {
        const title = product.name || product.title || "";
        const price = product.price?.value || product.sellingPrice || product.mrp || 0;
        const url = product.url
          ? `https://www.croma.com${product.url}`
          : `https://www.croma.com/searchB?q=${encodeURIComponent(query)}`;
        const imageUrl = product.plpImage || product.imageUrl || product.image || null;

        return {
          title,
          price: typeof price === "string" ? parseInt(price.replace(/[^\d]/g, ""), 10) : price,
          url,
          imageUrl: imageUrl ? (imageUrl.startsWith("http") ? imageUrl : `https://media-ik.croma.com${imageUrl}`) : null,
          inStock: product.isInStock !== false,
          source: this.source,
        };
      }).filter((r) => r.title && r.price > 0);
    } catch (err) {
      console.error("Croma API search failed:", err.message);
      return this._fallbackSearch(query);
    }
  }

  /** Fallback: use Playwright for scraping if the API fails */
  async _fallbackSearch(query) {
    if (!this.allowBrowserFallback) return [];
    return this.withBrowser(async (page) => {
      const searchUrl = `https://www.croma.com/searchB?q=${encodeURIComponent(query)}&text=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: "networkidle" });
      await page.waitForTimeout(5000);

      const results = await page.evaluate(() => {
        const items = [];
        const links = document.querySelectorAll('a[href*="/p/"]');
        for (const link of Array.from(links).slice(0, 12)) {
          const card = link.closest("li, div") || link;
          const titleEl = card.querySelector("h3, [class*='title'], [class*='name']") || link;
          const priceEl = card.querySelector("[class*='amount'], [class*='price']");
          const imgEl = card.querySelector("img");

          const title = (titleEl.getAttribute("title") || titleEl.textContent || "").trim();
          const priceText = priceEl ? priceEl.textContent.replace(/[^\d]/g, "") : "";
          const price = parseInt(priceText, 10);
          if (!title || !price || isNaN(price)) continue;

          const href = link.getAttribute("href");
          items.push({
            title,
            price,
            url: href.startsWith("http") ? href : `https://www.croma.com${href}`,
            imageUrl: imgEl ? (imgEl.src || imgEl.dataset.src || null) : null,
            inStock: true,
          });
        }
        return items;
      });

      return results.map((r) => ({ ...r, source: this.source }));
    });
  }

  async getPrice(url) {
    return this.withBrowser(async (page) => {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);

      const priceText = await page
        .locator('[class*="pdpPrice"], [class*="amount"], [class*="new-price"], [class*="selling-price"]')
        .first()
        .textContent()
        .catch(() => null);

      if (!priceText) return null;

      const outOfStock = await page
        .locator("text=Out of Stock")
        .isVisible()
        .catch(() => false);

      return {
        title: await page.title(),
        price: parseInt(priceText.replace(/[^\d]/g, ""), 10),
        inStock: !outOfStock,
      };
    });
  }
}
