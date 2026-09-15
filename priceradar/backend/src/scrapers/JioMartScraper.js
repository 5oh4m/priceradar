import { BaseScraper } from "./BaseScraper.js";

/**
 * JioMart (jiomart.com) — Reliance Retail, workplan Wave 2. Broad electronics +
 * grocery, often aggressive pricing.
 *
 * JioMart's storefront search is Algolia-backed; the public app credentials are
 * embedded in the page and rotate. We try the algolia endpoint, then fall back
 * to rendering the search page.
 */
export class JioMartScraper extends BaseScraper {
  constructor(opts = {}) {
    super({ source: "jiomart", ...opts });
    this.algoliaApp = process.env.JIOMART_ALGOLIA_APP || "3YP0Q7OODT";
    this.algoliaKey = process.env.JIOMART_ALGOLIA_KEY || "";
  }

  async search(query) {
    if (this.algoliaKey) {
      try {
        const res = await fetch(
          `https://${this.algoliaApp.toLowerCase()}-dsn.algolia.net/1/indexes/prod_mart_master_vertical/query`,
          {
            method: "POST",
            headers: {
              "X-Algolia-Application-Id": this.algoliaApp,
              "X-Algolia-API-Key": this.algoliaKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ params: `query=${encodeURIComponent(query)}&hitsPerPage=16` }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          const hits = data?.hits || [];
          const mapped = hits
            .map((h) => ({
              title: h.display_name || h.name || "",
              price: Math.round(h.price || h.selling_price || h.mrp || 0),
              url: h.url_path
                ? `https://www.jiomart.com/p/${h.url_path}`
                : `https://www.jiomart.com/search/${encodeURIComponent(query)}`,
              imageUrl: h.image_url || (Array.isArray(h.images) ? h.images[0] : null) || null,
              inStock: h.available !== false && h.in_stock !== false,
              mrp: h.mrp ? Math.round(h.mrp) : undefined,
              source: this.source,
            }))
            .filter((r) => r.title && r.price > 0);
          if (mapped.length) return mapped;
        }
      } catch (err) {
        console.error("JioMart algolia search failed:", err.message);
      }
    }
    return this._fallbackSearch(query);
  }

  async _fallbackSearch(query) {
    try {
      return await this.withBrowser(async (page) => {
      await page.goto(`https://www.jiomart.com/search/${encodeURIComponent(query)}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(4000);
      const rows = await page.evaluate(() => {
        const out = [];
        for (const card of Array.from(document.querySelectorAll('[class*="product"], li.ais-InfiniteHits-item')).slice(0, 16)) {
          const linkEl = card.querySelector('a[href*="/p/"]');
          const title = (card.querySelector('[class*="name"], [class*="title"]')?.textContent || linkEl?.textContent || "").trim();
          const priceText = (card.querySelector('[class*="price"]')?.textContent || "").replace(/[^\d]/g, "");
          const img = card.querySelector("img");
          const price = parseInt(priceText, 10);
          if (!linkEl || !title || !price) continue;
          out.push({
            title,
            price,
            url: linkEl.href.startsWith("http") ? linkEl.href : `https://www.jiomart.com${linkEl.getAttribute("href")}`,
            imageUrl: img ? img.src || img.dataset?.src || null : null,
            inStock: true,
          });
        }
        return out;
      });
        return rows.map((r) => ({ ...r, source: this.source }));
      });
    } catch (err) {
      console.error(`${this.source} fallback search failed:`, err.message);
      return [];
    }
  }

  async getPrice(url) {
    return this.withBrowser(async (page) => {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
      const priceText = await page
        .locator('[class*="final-price"], [class*="price"], #price_section')
        .first()
        .textContent()
        .catch(() => null);
      if (!priceText) return null;
      const oos = await page.locator("text=/out of stock|sold out/i").isVisible().catch(() => false);
      return { title: await page.title(), price: parseInt(priceText.replace(/[^\d]/g, ""), 10), inStock: !oos };
    });
  }
}
