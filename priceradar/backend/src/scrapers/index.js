import { FlipkartScraper } from "./FlipkartScraper.js";
import { AmazonScraper } from "./AmazonScraper.js";
import { CromaScraper } from "./CromaScraper.js";
import { RelianceDigitalScraper } from "./RelianceDigitalScraper.js";
import { VijaySalesScraper } from "./VijaySalesScraper.js";
import { TataCliqScraper } from "./TataCliqScraper.js";
import { JioMartScraper } from "./JioMartScraper.js";
import { SangeethaScraper } from "./SangeethaScraper.js";
import { PoorvikaScraper } from "./PoorvikaScraper.js";

const opts = {
  headless: process.env.SCRAPE_HEADLESS !== "false",
  timeoutMs: parseInt(process.env.SCRAPE_TIMEOUT_MS || "15000", 10),
};

// Add a new trusted source here + one row in services/storeMeta.js + (optionally)
// entries in data/bankOffers.seed.js. The aggregator, worker and frontend need
// no changes — they are driven by these keys.
// These adapters reach their store over a JSON API. Their Playwright fallback
// is disabled because it cannot currently succeed — the site blocks headless
// browsers, or the API host doesn't resolve — and attempting it burns the whole
// per-store timeout on every search. Re-enable one by flipping the flag once
// its real endpoint has been captured from the site's own network traffic.
const noBrowserFallback = { ...opts, allowBrowserFallback: false };

export const scrapers = {
  flipkart: new FlipkartScraper(opts),
  amazon_in: new AmazonScraper(opts),
  croma: new CromaScraper(noBrowserFallback),
  reliance_digital: new RelianceDigitalScraper(opts),
  vijay_sales: new VijaySalesScraper(opts),
  tata_cliq: new TataCliqScraper(noBrowserFallback),
  jiomart: new JioMartScraper(noBrowserFallback),
  sangeetha: new SangeethaScraper(noBrowserFallback),
  poorvika: new PoorvikaScraper(noBrowserFallback),
};

export const trustedSources = Object.keys(scrapers);
