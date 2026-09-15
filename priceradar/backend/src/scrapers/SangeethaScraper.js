import { BaseScraper } from "./BaseScraper.js";

/**
 * Sangeetha Mobiles (sangeethamobiles.com) — large South-India phone retailer,
 * workplan Wave 2. Authorised seller, frequently undercuts on phones.
 *
 * Tries their storefront API, falls back to rendering the search results page.
 */
export class SangeethaScraper extends BaseScraper {
  constructor(opts = {}) {
    super({ source: "sangeetha", ...opts });
  }

  async search(query) {
    try {
      const res = await fetch(
        `https://apiv2.sangeethamobiles.com/api/product/search?search=${encodeURIComponent(query)}&page=1&limit=16`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          },
        }
      );
      if (!res.ok) return this._fallbackSearch(query);
      const data = await res.json();
      const items = data?.data?.products || data?.products || data?.data || [];
      const mapped = (Array.isArray(items) ? items : [])
        .slice(0, 16)
        .map((p) => ({
          title: p.name || p.product_name || p.title || "",
          price: Math.round(
            Number(String(p.offer_price ?? p.selling_price ?? p.price ?? p.mrp ?? 0).replace(/[^\d.]/g, ""))
          ),
          url: p.slug
            ? `https://www.sangeethamobiles.com/product/${p.slug}`
            : `https://www.sangeethamobiles.com/search?q=${encodeURIComponent(query)}`,
          imageUrl: p.image || p.thumbnail || (Array.isArray(p.images) ? p.images[0] : null) || null,
          inStock: p.in_stock !== false && p.stock !== 0,
          mrp: p.mrp ? Math.round(Number(String(p.mrp).replace(/[^\d.]/g, ""))) : undefined,
          source: this.source,
        }))
        .filter((r) => r.title && r.price > 0);
      return mapped.length ? mapped : this._fallbackSearch(query);
    } catch (err) {
      console.error("Sangeetha API search failed:", err.message);
      return this._fallbackSearch(query);
    }
  }

  async _fallbackSearch(query) {
    try {
      return await this.withBrowser(async (page) => {
      await page.goto(`https://www.sangeethamobiles.com/search?q=${encodeURIComponent(query)}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(4000);
      const rows = await page.evaluate(() => {
        const out = [];
        for (const card of Array.from(document.querySelectorAll('[class*="product-card"], [class*="ProductCard"], li[class*="product"]')).slice(0, 16)) {
          const a = card.querySelector('a[href*="/product/"], a[href*="/p/"]');
          const title = (card.querySelector('[class*="name"], [class*="title"], h2, h3')?.textContent || "").trim();
          const priceText = (card.querySelector('[class*="price"]')?.textContent || "").replace(/[^\d]/g, "");
          const img = card.querySelector("img");
          const price = parseInt(priceText, 10);
          if (!a || !title || !price) continue;
          out.push({
            title,
            price,
            url: a.href.startsWith("http") ? a.href : `https://www.sangeethamobiles.com${a.getAttribute("href")}`,
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
        .locator('[class*="offer-price"], [class*="selling-price"], [class*="price"]')
        .first()
        .textContent()
        .catch(() => null);
      if (!priceText) return null;
      const oos = await page.locator("text=/out of stock|sold out/i").isVisible().catch(() => false);
      return { title: await page.title(), price: parseInt(priceText.replace(/[^\d]/g, ""), 10), inStock: !oos };
    });
  }
}
