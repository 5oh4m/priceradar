import { BaseScraper } from "./BaseScraper.js";

/**
 * Reliance Digital (reliancedigital.in) scraper.
 *
 * Uses their public /ext/raven-api/catalog endpoint which returns
 * product data with pricing. The response format uses deeply nested
 * attributes with the product name in _custom_json.name and price
 * in the price-zmr1 field.
 */
export class RelianceDigitalScraper extends BaseScraper {
  constructor(opts = {}) {
    super({ source: "reliance_digital", ...opts });
  }

  async search(query) {
    try {
      const searchUrl = `https://www.reliancedigital.in/ext/raven-api/catalog/v1.0/products?q=${encodeURIComponent(query)}&page_no=1&page_size=12`;

      const response = await fetch(searchUrl, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) {
        console.error(`Reliance Digital API returned ${response.status}`);
        return [];
      }

      const data = await response.json();
      const items = data?.items || [];

      return items
        .filter((item) => item.type === "product")
        .slice(0, 12)
        .map((item) => {
          const attrs = item.attributes || {};
          const customJson = attrs._custom_json || {};

          // Extract title, price, and construct accurate product URL using the slug and item_code
          const title = item.name || customJson.name || `${attrs.brand_name || ""} ${attrs["model-name"] || ""}`.trim();
          const price = parseInt(attrs["price-zmr1"] || "0", 10);
          const url = item.slug 
            ? `https://www.reliancedigital.in/product/${item.slug}`
            : `https://www.reliancedigital.in/search?q=${encodeURIComponent(query)}`;

          // Images live on `item.medias` — an array of { type, url, alt }.
          // `attributes.variant_media` is present but almost always empty, so it
          // is only a fallback.
          const medias = Array.isArray(item.medias) ? item.medias : [];
          const firstMedia = medias.find((m) => m?.type === "image" && m?.url) || medias.find((m) => m?.url);
          const variantMedia = attrs.variant_media || {};
          const imageUrl =
            firstMedia?.url || Object.values(variantMedia)?.[0]?.[0]?.url || null;

          return {
            title,
            price,
            url,
            imageUrl,
            inStock: (attrs.sellable_quantity || 0) > 0,
            source: this.source,
          };
        })
        .filter((r) => r.title && r.price > 0);
    } catch (err) {
      console.error("Reliance Digital API search failed:", err.message);
      return [];
    }
  }

  async getPrice(url) {
    return this.withBrowser(async (page) => {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);

      const priceText = await page
        .locator('[class*="pdp-price"], [class*="offer-price"], [class*="selling-price"]')
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
