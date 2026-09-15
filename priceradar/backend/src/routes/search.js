import { Router } from "express";
import { searchAcrossSources } from "../services/priceAggregator.js";

const router = Router();

// GET /api/search?q=iphone 15 256gb
// Returns { query, generatedAt, intent, storeErrors, reviewQueue, results, otherVariants }
router.get("/", async (req, res) => {
  const query = (req.query.q || "").trim();
  if (!query) {
    return res.status(400).json({ error: "Missing query param ?q=" });
  }

  try {
    const payload = await searchAcrossSources(query);
    res.json({
      resultCount: payload.results.length,
      ...payload,
    });
  } catch (err) {
    console.error("Search failed:", err);
    res.status(500).json({ error: "Search failed", detail: err.message });
  }
});

export default router;
