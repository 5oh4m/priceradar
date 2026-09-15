import { Router } from "express";
import { pool } from "../db/pool.js";
import { summarizeReviews } from "../services/aiReviews.js";
import { suggestAlternatives } from "../services/aiSuggestions.js";

const router = Router();

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// GET|POST /api/products/:id/reviews -> cached AI review summary (regenerated weekly)
// POST is preferred: some proxies drop GET bodies (raw review text goes in the body).
async function reviewsHandler(req, res) {
  const { id } = req.params;
  try {
    const cached = await pool.query(
      "SELECT summary_json, generated_at FROM review_summaries WHERE product_id = $1",
      [id]
    );

    const isFresh =
      cached.rows.length > 0 &&
      Date.now() - new Date(cached.rows[0].generated_at).getTime() < ONE_WEEK_MS;

    if (isFresh) {
      return res.json({ cached: true, ...cached.rows[0].summary_json });
    }

    // Not fresh: caller is responsible for having scraped raw reviews into
    // wherever you store them (a `raw_reviews` table, or pull live here).
    // For brevity, this expects the client to pass rawReviews for now —
    // in production, pull them from a `raw_reviews` table instead.
    const rawReviews = req.body?.rawReviews || [];
    const productRes = await pool.query("SELECT canonical_title FROM products WHERE id = $1", [id]);
    const title = productRes.rows[0]?.canonical_title || "this product";

    const summary = await summarizeReviews(title, rawReviews);

    await pool.query(
      `INSERT INTO review_summaries (product_id, summary_json, generated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (product_id) DO UPDATE SET summary_json = $2, generated_at = now()`,
      [id, summary]
    );

    res.json({ cached: false, ...summary });
  } catch (err) {
    console.error("Review summary failed:", err);
    res.status(500).json({ error: "Failed to get review summary" });
  }
}

router.get("/:id/reviews", reviewsHandler);
router.post("/:id/reviews", reviewsHandler);

// GET /api/products/:id/suggestions -> cached AI alternatives
router.get("/:id/suggestions", async (req, res) => {
  const { id } = req.params;
  try {
    const cached = await pool.query(
      "SELECT suggestions_json, generated_at FROM suggestions WHERE product_id = $1",
      [id]
    );

    const isFresh =
      cached.rows.length > 0 &&
      Date.now() - new Date(cached.rows[0].generated_at).getTime() < ONE_WEEK_MS;

    if (isFresh) {
      return res.json({ cached: true, ...cached.rows[0].suggestions_json });
    }

    const productRes = await pool.query(
      "SELECT canonical_title, category FROM products WHERE id = $1",
      [id]
    );
    if (productRes.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    const { canonical_title, category } = productRes.rows[0];

    const priceRes = await pool.query(
      `SELECT ps.price FROM price_snapshots ps
       JOIN listings l ON l.id = ps.listing_id
       WHERE l.product_id = $1
       ORDER BY ps.scraped_at DESC LIMIT 1`,
      [id]
    );
    const price = priceRes.rows[0]?.price || 0;

    const suggestions = await suggestAlternatives({
      title: canonical_title,
      price,
      category,
    });

    await pool.query(
      `INSERT INTO suggestions (product_id, suggestions_json, generated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (product_id) DO UPDATE SET suggestions_json = $2, generated_at = now()`,
      [id, suggestions]
    );

    res.json({ cached: false, ...suggestions });
  } catch (err) {
    console.error("Suggestions failed:", err);
    res.status(500).json({ error: "Failed to get suggestions" });
  }
});

export default router;
