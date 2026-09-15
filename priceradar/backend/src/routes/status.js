import { Router } from "express";
import { scrapers } from "../scrapers/index.js";
import { storeMeta } from "../services/storeMeta.js";
import { breakerStatus } from "../scrapers/circuitBreaker.js";

const router = Router();

// GET /api/status -> per-store health (workplan §5 "per-store status page")
router.get("/", (req, res) => {
  const breakers = Object.fromEntries(breakerStatus().map((b) => [b.store, b]));
  const stores = Object.keys(scrapers).map((slug) => {
    const meta = storeMeta(slug);
    const b = breakers[slug];
    return {
      slug,
      name: meta.name,
      trustTier: meta.trustTier,
      status: b?.open ? "unavailable" : "ok",
      consecutiveFailures: b?.consecutiveFailures ?? 0,
      reopensInMs: b?.reopensInMs ?? 0,
    };
  });
  res.json({ generatedAt: new Date().toISOString(), stores });
});

export default router;
