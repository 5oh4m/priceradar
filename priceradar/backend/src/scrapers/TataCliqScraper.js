import { BaseScraper } from "./BaseScraper.js";

/**
 * Tata CLiQ (tatacliq.com) — Tata Digital marketplace, workplan Wave 1.
 *
 * Uses the public search BFF that the site's own SPA calls. If the endpoint
 * shape changes, check the Network tab on a tatacliq.com search for the
 * request to `searchbff.tatacliq.com` and update the field mapping.
 */
export class TataCliqScraper extends BaseScraper {
  constructor(opts = {}) {
    super({ source: "tata_cliq", ...opts });
  }

  async search(query) {
    try {
      const url =
        `https://searchbff.tatacliq.com/products/mpl/search?searchText=${encodeURIComponent(query)}` +
        `&channel=WEB&page=0&pageSize=20&isSuggested=false&isKeywordRedirect=true&isMDE=true`;

      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        },
      });
      if (!res.ok) return this._fallbackSearch(query);

      const data = await res.json();
      const items = data?.searchresult || data?.products || [];

      return items
        .slice(0, 16)
        .map((p) => {
          const title = [p.brandName, p.productName].filter(Boolean).join(" ").trim() || p.productName || "";
          const priceRaw = p.priceValue ?? p.price ?? p.winningSellerPrice ?? p.mrpPrice ?? 0;
          const price =
            typeof priceRaw === "string" ? parseInt(priceRaw.replace(/[^\d]/g, ""), 10) : Math.round(priceRaw);
          const path = p.webURL || p.url || "";
          const image = (p.imageURL || p.image || "").replace(/\{.*?\}/g, "450");
          return {
            title,
            price,
            url: path ? (path.startsWith("http") ? path : `https://www.tatacliq.com${path}`) : `https://www.tatacliq.com/search/?text=${encodeURIComponent(query)}`,
            imageUrl: image ? (image.startsWith("http") ? image : `https:${image}`) : null,
            inStock: p.isOutOfStock !== true && p.stockAvailability !== "OUT_OF_STOCK",
            mrp:
              typeof p.mrpPrice === "string"
                ? parseInt(p.mrpPrice.replace(/[^\d]/g, ""), 10)
                : p.mrpPrice || undefined,
            source: this.source,
          };
        })
        .filter((r) => r.title && r.price > 0);
    } catch (err) {
      console.error("Tata CLiQ API search failed:", err.message);
      return this._fallbackSearch(query);
    }
  }

  async _fallbackSearch(query) {
    try {
      return await this.withBrowser(async (page) => {
      await page.goto(`https://www.tatacliq.com/search/?text=${encodeURIComponent(query)}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(4000);
      const rows = await page.evaluate(() => {
        const out = [];
        for (const a of Array.from(document.querySelectorAll('a[href*="/p-mp"]')).slice(0, 16)) {
          const card = a.closest("div") || a;
          const title = (card.querySelector('[class*="Name"], [class*="title"], h2, h3')?.textContent || "").trim();
          const priceText = (card.querySelector('[class*=" price"], [class*="Price"]')?.textContent || "").replace(/[^\d]/g, "");
          const img = card.querySelector("img");
          const price = parseInt(priceText, 10);
          if (!title || !price) continue;
          out.push({
            title,
            price,
            url: a.href,
            imageUrl: img ? img.src : null,
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
        .locator('[class*="PdpPriceFormat"], [class*="price"], [class*="Price"]')
        .first()
        .textContent()
        .catch(() => null);
      if (!priceText) return null;
      const oos = await page.locator("text=/out of stock/i").isVisible().catch(() => false);
      return { title: await page.title(), price: parseInt(priceText.replace(/[^\d]/g, ""), 10), inStock: !oos };
    });
  }
}
