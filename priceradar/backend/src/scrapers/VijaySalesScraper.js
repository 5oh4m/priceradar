import { BaseScraper } from "./BaseScraper.js";

/**
 * Vijay Sales (vijaysales.com) scraper — popular Indian electronics chain.
 *
 * Vijay Sales uses Unbxd for search. Their main search input is readonly
 * and triggers a popup, making DOM scraping unreliable. We use their
 * Unbxd search API directly for reliable results.
 */
export class VijaySalesScraper extends BaseScraper {
  constructor(opts = {}) {
    super({ source: "vijay_sales", ...opts });
  }

  async search(query) {
    try {
      // First, try to get the Unbxd config from the page to find the API keys
      // These are public keys embedded in their page source
      const apiKey = "bb8ef7667d38c04e8a81c80f4a43a998";
      const siteKey = "ss-unbxd-aapac-prod-vijaysales-magento33881704883825";
      const unbxdUrl = `https://search.unbxd.io/${apiKey}/${siteKey}/search`;
      const searchUrl = `${unbxdUrl}?q=${encodeURIComponent(query)}&rows=12&start=0&fields=title,uniqueId,productUrl,imageUrl,price,mrp,status`;

      const response = await fetch(searchUrl, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) {
        return this._fallbackSearch(query);
      }

      const data = await response.json();
      const products = data?.response?.products || [];

      return products.slice(0, 12).map((product) => {
        const title = product.title || "";
        const price = product.price || product.mrp || 0;
        const productUrl = product.productUrl || "";
        const url = productUrl
          ? (productUrl.startsWith("http") ? productUrl : `https://www.vijaysales.com${productUrl}`)
          : `https://www.vijaysales.com/search/${encodeURIComponent(query)}`;
        const imageUrl = product.imageUrl?.[0] || product.imageUrl || null;

        return {
          title,
          price: typeof price === "string" ? parseInt(price.replace(/[^\d]/g, ""), 10) : Math.round(price),
          url,
          imageUrl: imageUrl ? (imageUrl.startsWith("http") ? imageUrl : `https://www.vijaysales.com${imageUrl}`) : null,
          inStock: product.status === "Enabled" || product.status !== "Unavailable",
          source: this.source,
        };
      }).filter((r) => r.title && r.price > 0);
    } catch (err) {
      console.error("Vijay Sales API search failed:", err.message);
      return this._fallbackSearch(query);
    }
  }

  /** Fallback: use Playwright with the search flyout input */
  async _fallbackSearch(query) {
    return this.withBrowser(async (page) => {
      await page.goto("https://www.vijaysales.com/", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);

      // Click the readonly search input to open the search flyout
      const readonlyInput = page.locator("input.input-result").first();
      if (await readonlyInput.isVisible().catch(() => false)) {
        await readonlyInput.click();
        await page.waitForTimeout(1000);
      }

      // Now find the actual editable input in the search flyout
      const editableInput = page.locator("input.searchContainer__searchAndInput--searchInputBox").first();
      if (await editableInput.isVisible().catch(() => false)) {
        await editableInput.fill(query);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(5000);
      } else {
        return [];
      }

      const results = await page.evaluate(() => {
        const items = [];
        const cards = document.querySelectorAll('[class*="product"], [class*="card"]');
        for (const card of Array.from(cards).slice(0, 12)) {
          const titleEl = card.querySelector('[class*="name"], [class*="title"], h3, a[title]');
          const priceEl = card.querySelector('[class*="price"], [class*="amount"]');
          const linkEl = card.querySelector("a[href]");
          const imgEl = card.querySelector("img");

          if (!titleEl || !priceEl) continue;
          const title = (titleEl.getAttribute("title") || titleEl.textContent || "").trim();
          const priceText = priceEl.textContent.replace(/[^\d]/g, "");
          const price = parseInt(priceText, 10);
          if (!title || !price || isNaN(price)) continue;

          const href = linkEl ? linkEl.getAttribute("href") : null;
          items.push({
            title,
            price,
            url: href ? (href.startsWith("http") ? href : `https://www.vijaysales.com${href}`) : null,
            imageUrl: imgEl ? imgEl.src : null,
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
        .locator('[class*="offer-price"], [class*="selling-price"], [class*="special-price"]')
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
