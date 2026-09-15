import { BaseScraper } from "./BaseScraper.js";

/**
 * Poorvika (poorvika.com) — major South-India mobiles + electronics retailer,
 * workplan Wave 2. Authorised seller.
 *
 * Tries their product-search API, falls back to rendering the results page.
 */
export class PoorvikaScraper extends BaseScraper {
  constructor(opts = {}) {
    super({ source: "poorvika", ...opts });
  }

  async search(query) {
    try {
      const res = await fetch(
        `https://arrc-webapi.poorvika.com/api/v3/product-variant/search?search=${encodeURIComponent(query)}&page=1&limit=16`,
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
      const items = data?.data?.items || data?.data || data?.items || [];
      const mapped = (Array.isArray(items) ? items : [])
        .slice(0, 16)
        .map((p) => ({
          title: p.product_name || p.name || p.title || "",
          price: Math.round(Number(String(p.our_price ?? p.price ?? p.selling_price ?? p.mrp ?? 0).replace(/[^\d.]/g, ""))),
          url: p.url_key || p.slug
            ? `https://www.poorvika.com/${p.url_key || p.slug}`
            : `https://www.poorvika.com/search?q=${encodeURIComponent(query)}`,
          imageUrl:
            p.image_url ||
            p.image ||
            (Array.isArray(p.images) ? p.images[0]?.url || p.images[0] : null) ||
            null,
          inStock: p.stock_status !== "out_of_stock" && p.in_stock !== false,
          mrp: p.mrp ? Math.round(Number(String(p.mrp).replace(/[^\d.]/g, ""))) : undefined,
          source: this.source,
        }))
        .filter((r) => r.title && r.price > 0);
      return mapped.length ? mapped : this._fallbackSearch(query);
    } catch (err) {
      console.error("Poorvika API search failed:", err.message);
      return this._fallbackSearch(query);
    }
  }

  async _fallbackSearch(query) {
    try {
      return await this.withBrowser(async (page) => {
      await page.goto(`https://www.poorvika.com/search?q=${encodeURIComponent(query)}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(4000);
      const rows = await page.evaluate(() => {
        const out = [];
        for (const card of Array.from(document.querySelectorAll('[class*="product"], [data-testid*="product"]')).slice(0, 16)) {
          const a = card.querySelector("a[href]");
          const title = (card.querySelector('[class*="name"], [class*="title"], h2, h3')?.textContent || "").trim();
          const priceText = (card.querySelector('[class*="price"]')?.textContent || "").replace(/[^\d]/g, "");
          const img = card.querySelector("img");
          const price = parseInt(priceText, 10);
          if (!a || !title || !price) continue;
          out.push({
            title,
            price,
            url: a.href.startsWith("http") ? a.href : `https://www.poorvika.com${a.getAttribute("href")}`,
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
        .locator('[class*="our-price"], [class*="offer-price"], [class*="price"]')
        .first()
        .textContent()
        .catch(() => null);
      if (!priceText) return null;
      const oos = await page.locator("text=/out of stock|sold out/i").isVisible().catch(() => false);
      return { title: await page.title(), price: parseInt(priceText.replace(/[^\d]/g, ""), 10), inStock: !oos };
    });
  }
}
