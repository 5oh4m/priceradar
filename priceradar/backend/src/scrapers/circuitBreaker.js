/**
 * Per-store circuit breaker (workplan §5 "Scraper hardening").
 *
 * After N consecutive failures a store is skipped for a cool-off window and the
 * API reports it as temporarily unavailable, instead of every search paying the
 * timeout for a store that is down. In-memory and per-process — fine for a
 * single API node; move to Redis when the API scales out.
 */

const THRESHOLD = parseInt(process.env.BREAKER_THRESHOLD || "5", 10);
const OPEN_MS = parseInt(process.env.BREAKER_OPEN_MS || String(15 * 60 * 1000), 10);

const state = new Map(); // slug -> { fails, openUntil }

function entry(slug) {
  let e = state.get(slug);
  if (!e) {
    e = { fails: 0, openUntil: 0 };
    state.set(slug, e);
  }
  return e;
}

export function isOpen(slug) {
  const e = state.get(slug);
  return !!(e && e.openUntil > Date.now());
}

export function recordSuccess(slug) {
  const e = entry(slug);
  e.fails = 0;
  e.openUntil = 0;
}

export function recordFailure(slug) {
  const e = entry(slug);
  e.fails += 1;
  if (e.fails >= THRESHOLD) e.openUntil = Date.now() + OPEN_MS;
}

export function breakerStatus() {
  const now = Date.now();
  return [...state.entries()].map(([slug, e]) => ({
    store: slug,
    consecutiveFailures: e.fails,
    open: e.openUntil > now,
    reopensInMs: e.openUntil > now ? e.openUntil - now : 0,
  }));
}
