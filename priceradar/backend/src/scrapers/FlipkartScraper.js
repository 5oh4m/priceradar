import { BaseScraper } from "./BaseScraper.js";

/**
 * NOTE: E-commerce sites change their DOM structure often — treat these
 * selectors as a starting point, not a permanent contract. When a scraper
 * silently returns [] or null, the first thing to check is whether the
 * selectors below still match (open the page, inspect element).
 *
 * Also check /robots.txt and Flipkart's Terms of Use before running this
 * at scale — for a personal/college project this is generally fine, but
 * don't hammer their servers (respect delays, use it for demo-scale traffic).
 */
export class FlipkartScraper extends BaseScraper {
  constructor(opts = {}) {
    super({ source: "flipkart", ...opts });
  }

  async search(query) {
    return this.withBrowser(async (page) => {
      const searchUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });

      // Flipkart shows a login popup on first load — dismiss it.
      const closeBtn = page.locator("button._2KpZ6l._2doB4z");
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click().catch(() => {});
      }

      await page.waitForSelector('[data-id]', { timeout: this.timeoutMs }).catch(() => null);

      const results = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll("div[data-id]"));
        return cards
          .filter((card) => {
            // Skip sponsored/ad cards
            const isAd =
              card.querySelector('[class*="sponsored"]') !== null ||
              card.querySelector('[class*="Sponsored"]') !== null ||
              card.querySelector('[data-tkid]') !== null ||
              (card.textContent || "").includes("Ad") && card.querySelector('.WB5m4b') !== null;
            return !isAd;
          })
          .slice(0, 12) // Limit to top 12 organic results
          .map((card) => {
            const titleEl = card.querySelector("div.KzDlHZ, a.s1Q9rs, a.IRpwTa");
            const priceEl = card.querySelector("div._30jeq3, div.Nx9bqj");
            const linkEl = card.querySelector("a.CGtC98, a.s1Q9rs, a.IRpwTa, a._1fQZEK");
            const imgEl = card.querySelector("img");

            if (!titleEl || !priceEl || !linkEl) return null;

            const price = parseInt(priceEl.textContent.replace(/[^\d]/g, ""), 10);
            return {
              title: titleEl.textContent.trim(),
              price,
              url: linkEl.href.startsWith("http")
                ? linkEl.href
                : `https://www.flipkart.com${linkEl.getAttribute("href")}`,
              imageUrl: imgEl ? imgEl.src : null,
              inStock: true,
            };
          })
          .filter(Boolean);
      });

      return results.map((r) => ({ ...r, source: this.source }));
    });
  }

  async getPrice(url) {
    return this.withBrowser(async (page) => {
      await page.goto(url, { waitUntil: "domcontentloaded" });

      const priceText = await page
        .locator("div._30jeq3._16Jk6d, div.Nx9bqj.CxhGGd")
        .first()
        .textContent()
        .catch(() => null);

      if (!priceText) return null;

      const outOfStock = await page
        .locator("text=Sold Out")
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
