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
        const clean = (s) =>
          (s || "").replace(/^\s*sponsored ad\s*[-–:]?\s*/i, "").replace(/\s+/g, " ").trim();

        const num = (s) => {
          const n = parseInt(String(s || "").replace(/[^\d]/g, ""), 10);
          return Number.isFinite(n) ? n : null;
        };

        return Array.from(document.querySelectorAll('div[data-component-type="s-search-result"]'))
          .map((card) => {
            const h2 = card.querySelector("h2");
            const imgEl = card.querySelector("img.s-image");
            const aria = h2?.getAttribute("aria-label") || "";
            const alt = imgEl?.getAttribute("alt") || "";

            // Sponsored cards carry the marker on the h2 aria-label / image alt.
            // The old class-based checks no longer match anything.
            const isSponsored = /^\s*sponsored ad\b/i.test(aria) || /^\s*sponsored ad\b/i.test(alt);
            if (isSponsored) return null;

            // `h2 span` collapses to just the brand ("Apple") on some card
            // layouts, so take the longest of every candidate that carries the
            // full product name.
            const title = [
              aria,
              alt,
              h2?.textContent,
              card.querySelector('[data-cy="title-recipe"] span')?.textContent,
            ]
              .map(clean)
              .filter((t) => t.length > 5 && !/^sponsored$/i.test(t))
              .sort((a, b) => b.length - a.length)[0];

            const price = num(card.querySelector("span.a-price-whole")?.textContent);

            const linkEl =
              card.querySelector('a[href*="/dp/"]') ||
              card.querySelector("h2 a") ||
              card.querySelector("a.a-link-normal.s-no-outline");
            const href = linkEl?.getAttribute("href");

            if (!title || !price || !href) return null;

            // struck-through list price, when shown
            const mrp = num(
              card.querySelector("span.a-text-price span.a-offscreen")?.textContent
            );

            const ratingText = card.querySelector("span.a-icon-alt")?.textContent || "";
            const rating = parseFloat((ratingText.match(/([\d.]+)\s*out of/) || [])[1]);
            const ratingCount = num(
              card.querySelector("span.a-size-base.s-underline-text")?.textContent
            );

            return {
              title,
              price,
              url: href.startsWith("http") ? href.split("?")[0] : `https://www.amazon.in${href.split("?")[0]}`,
              imageUrl: imgEl?.src || null,
              inStock: true,
              mrp: mrp && mrp > price ? mrp : undefined,
              rating: Number.isFinite(rating) ? rating : undefined,
              ratingCount: ratingCount || undefined,
            };
          })
          .filter(Boolean)
          .slice(0, 12);
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
