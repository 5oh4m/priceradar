import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";
import { pool } from "./db/pool.js";
import { scrapers } from "./scrapers/index.js";

dotenv.config();

/**
 * Run this as a separate process: `npm run worker`
 * It re-scrapes prices for every tracked listing on a schedule so the
 * frontend can read from `price_snapshots` (fast, cached) instead of
 * scraping live on every user request.
 */

const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const priceRefreshQueue = new Queue("price-refresh", { connection });

async function refreshAllPrices() {
  const { rows: listings } = await pool.query("SELECT id, source, url FROM listings");

  for (const listing of listings) {
    const scraper = scrapers[listing.source];
    if (!scraper) continue;

    try {
      const result = await scraper.getPrice(listing.url);
      if (result) {
        await pool.query(
          `INSERT INTO price_snapshots (listing_id, price, in_stock, scraped_at)
           VALUES ($1, $2, $3, now())`,
          [listing.id, result.price, result.inStock]
        );
      }
    } catch (err) {
      console.error(`Failed to refresh price for listing ${listing.id} (${listing.source}):`, err.message);
    }
  }
}

new Worker(
  "price-refresh",
  async () => {
    console.log("Running scheduled price refresh...");
    await refreshAllPrices();
    console.log("Price refresh complete.");
  },
  { connection }
);

// Schedule: every 6 hours. Adjust based on how fresh you need prices —
// more frequent = more accurate but more likely to get you rate-limited/blocked.
async function scheduleRepeatingJob() {
  await priceRefreshQueue.add(
    "refresh",
    {},
    { repeat: { every: 6 * 60 * 60 * 1000 }, removeOnComplete: true }
  );
  console.log("Scheduled price refresh every 6 hours.");
}

scheduleRepeatingJob();
