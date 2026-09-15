import { BaseScraper } from "./BaseScraper.js";

export class AmazonScraper extends BaseScraper {
  constructor(opts = {}) {
    super({ source: "amazon_in", ...opts });
  }

  async search(query) {
    return this.withBrowser(async (page) => {
      const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });

      await page
        .waitForSelector('div[data-component-type="s-search-result"]', {
          timeout: this.timeoutMs,
        })
        .catch(() => null);

      const results = await page.evaluate(() => {
        const cards = Array.from(
          document.querySelectorAll('div[data-component-type="s-search-result"]')
        );
        return cards
          .filter((card) => {
            // Skip sponsored results — they are often irrelevant
            const isSponsored =
              card.querySelector('[data-component-type="sp-sponsored-result"]') !== null ||
              card.querySelector('span.puis-label-popover-default') !== null ||
              card.querySelector('span:is([class*="Sponsored"], [class*="sponsored"])') !== null ||
              card.textContent.includes("Sponsored");
            return !isSponsored;
          })
          .slice(0, 12) // Limit to top 12 organic results
          .map((card) => {
            const titleEl = card.querySelector("h2 span");
            const priceWholeEl = card.querySelector("span.a-price-whole");
            const linkEl = card.querySelector("h2 a, a.a-link-normal.s-no-outline");
            const imgEl = card.querySelector("img.s-image");

            if (!titleEl || !priceWholeEl || !linkEl) return null;

            const price = parseInt(priceWholeEl.textContent.replace(/[^\d]/g, ""), 10);
            const href = linkEl.getAttribute("href");

            return {
              title: titleEl.textContent.trim(),
              price,
              url: href.startsWith("http") ? href : `https://www.amazon.in${href}`,
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

      const whole = await page
        .locator("span.a-price-whole")
        .first()
        .textContent()
        .catch(() => null);

      if (!whole) return null;

      const unavailable = await page
        .locator("text=Currently unavailable")
        .isVisible()
        .catch(() => false);

      return {
        title: await page.title(),
        price: parseInt(whole.replace(/[^\d]/g, ""), 10),
        inStock: !unavailable,
      };
    });
  }
}
