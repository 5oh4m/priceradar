# PriceRadar

Full-stack price comparison app: live scrapes trusted stores, picks the cheapest,
and uses Claude to summarize real customer reviews and suggest better alternatives.

## Architecture

```
frontend (React/Vite)  →  backend (Express)  →  Postgres (products, prices, cache)
                                ↓
                          Playwright scrapers (Amazon.in, Flipkart)
                                ↓
                          Claude API (review summary + suggestions)
                                ↓
                          BullMQ worker (refreshes prices every 6h, Redis-backed)
```

**Why cache-first, not live-scrape-per-request:**
Scraping on every user search is slow (5-10s+) and gets you rate-limited fast.
The `worker.js` process re-scrapes tracked listings on a schedule and writes to
`price_snapshots`; the API mostly reads from Postgres. Live scraping (`/api/search`)
is still there for discovering *new* products the first time someone searches them.

## Setup

### 1. Prerequisites
- Node.js 18+
- PostgreSQL running locally (or a hosted instance)
- Redis running locally (for the background worker — `worker.js`)

### 2. Backend
```bash
cd backend
npm install
npx playwright install chromium   # downloads the browser binary
cp .env.example .env              # fill in ANTHROPIC_API_KEY, DATABASE_URL, REDIS_URL
psql $DATABASE_URL -f src/db/schema.sql   # create tables
npm run dev                       # starts API on :5000
```

In a second terminal, optionally run the background refresher:
```bash
npm run worker
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev                       # starts on :5173, proxies /api to :5000
```

Open http://localhost:5173 and search for a product.

## P0 + P1 — correctness and the comparison-block UI (this iteration)

The search result is no longer one card per store listing. One canonical product
variant is one **comparison block**; stores are rows inside it, sorted by
effective price, deduped to one row per store.

**Backend — `backend/src/services/`**
- `queryIntent.js` — parses the search string into intent
  (`"iphone 15 256 gb"` -> `{ brand:"apple", attrs:{ storage_gb:256 } }`).
- `attrs.js` — deterministic extractors for storage / RAM / colour / model year /
  connectivity / pack size / refurbished, shared by the query parser and the
  title normalizer, plus `attrsConflict()` — the **hard gate**.
- `titleNormalizer.js` — strips marketing noise from a scraped title and derives
  `brand`, a model `slug`, and the same attribute shape.
- `variantKey.js` — the canonical key (`brand|slug|storage|colour|...`) and
  `canonicalUrl()` for de-duplication.
- `bankOfferParser.js` — rules-first extractor for store "offer box" bullet text,
  with a confidence score; anything below `0.70` goes to a review queue instead
  of being shown.
- `bankOffers.js` + `data/bankOffers.seed.js` — the manual / admin override
  layer (workplan §3, "highest precedence"). Edit the seed file to add or
  correct a store-wide card offer; each entry is a plain string run through the
  same parser, matched to rows by store / brand / category / validity, and
  carries a `sourceUrl` shown as a "terms" link in the UI.
- `storeMeta.js` — per-store name / colour / trust tier / affiliate hook.
- `priceAggregator.js` — rewritten grouping half. `classify(query, listings)` is
  pure and unit-tested; it returns `results` (exact intent matches) and
  `otherVariants` (same model, a different storage/colour), each a list of
  `Product` objects with a deduped, sorted `offers` array.

**Frontend — `frontend/src/`**
- `components/ComparisonBlock.jsx` — the block: fixed regions, one `Best` badge on
  the winning row, struck listed price + bold effective price on every row, bank
  offer as a chip expandable to the full list, freshness stamp per row,
  `tabular-nums` on every figure, fixed `aspect-ratio: 1` image box.
- `components/FilterBar.jsx` — sticky sort (effective / listed / delivery),
  in-stock toggle, and **"Your cards"**: tick the issuers you hold and every
  effective price recomputes to what those cards can get.
- `components/Skeletons.jsx` — load state; empty state and per-store error state
  live in `App.jsx`.
- `lib/effectivePrice.js`, `lib/compare.js` — the effective-price engine and
  row-selection logic, kept pure so they are tested directly.

**Response shape from `GET /api/search?q=`**
```
{ query, generatedAt,
  intent:  { brand, model, attrs },
  storeErrors:  [{ store, message }],
  reviewQueue:  [ low-confidence parsed bank offers ],
  results:       Product[],
  otherVariants: Product[] }
```

**Bank offers today.** They come from the manual seed in
`backend/src/data/bankOffers.seed.js`, matched per store row and priced by the
engine — the "Your cards" filter recomputes against them. They are "as
advertised"; verify against each `sourceUrl` before trusting a figure.

**Still to do**
- **Persist to the canonical layer.** `classify()` builds `Product` / `offer`
  objects in memory only. `backend/src/db/schema.v2.sql` is the migration target;
  wiring it in gives each variant a stable id for `/reviews` and `/suggestions`.
- **Scraper-side offer-box extraction.** `BaseScraper.fetchBankOffers(url)` returns
  `[]`; each adapter should pull the offer bullet list from its product page onto
  `listing.offerTexts`. Those strings already flow through the parser and merge
  with the seed offers — only the scraping is missing.
- **Scraper selectors will break.** Amazon/Flipkart change their DOM often; check
  `src/scrapers/*.js` first when a source returns empty.
- **Review scraping isn't included.** `summarizeReviews()` still expects raw review
  text; a `raw_reviews` table + a per-product review scraper is the missing piece.

## Tests

```bash
cd backend && npm test        # node --test — matcher, hard gate, dedup,
                              # bank-offer parser, effective-price invariants
```
The headline-invariant test imports the frontend `lib/` helpers directly, so the
"headline price always equals the top row" rule is asserted across both halves.

## Legal note
Check each site's `robots.txt` and Terms of Use before scraping at any real scale.
For a personal/college project this is generally fine at light, infrequent traffic;
for a real product, prefer official affiliate APIs (Amazon Associates, Flipkart
Affiliate API) where available — they're more stable and don't carry ToS risk.

## Stores

| Slug | Store | Tier | Extraction | Status |
|---|---|---|---|---|
| `amazon_in` | Amazon.in | Marketplace | Playwright | working |
| `flipkart` | Flipkart | Marketplace | Playwright | selectors need tuning |
| `croma` | Croma | Authorised | JSON API | endpoint returning empty |
| `reliance_digital` | Reliance Digital | Authorised | JSON API | working |
| `vijay_sales` | Vijay Sales | Authorised | Unbxd API | working |
| `tata_cliq` | Tata CLiQ | Marketplace | search BFF | endpoint params need tuning |
| `jiomart` | JioMart | Marketplace | Algolia (`JIOMART_ALGOLIA_KEY`) | needs Algolia key |
| `sangeetha` | Sangeetha Mobiles | Authorised | storefront API | endpoint host need tuning |
| `poorvika` | Poorvika | Authorised | storefront API | endpoint host need tuning |

The four newest adapters are wired end to end — registered in
`scrapers/index.js`, metadata in `storeMeta.js`, bank-offer coverage in
`bankOffers.seed.js` — and the `coverage.test.js` suite proves a new store
flows through `classify()` with no core changes. Their live endpoints and DOM
selectors still need to be captured from each site's own network traffic, the
same tuning Amazon and Flipkart need.

`GET /api/status` reports each store's health and whether its circuit breaker
is open.

## Scraper hardening

- **Browser fallback is opt-out per adapter** (`allowBrowserFallback`). Adapters
  whose Playwright fallback cannot currently succeed have it disabled in
  `scrapers/index.js`, so a failed API call returns immediately instead of
  spending the full per-store timeout launching a browser for nothing.

- **Per-store search timeout** (`SCRAPE_SEARCH_TIMEOUT_MS`, default 12s) — one
  slow store can no longer hold up the whole search.
- **Circuit breaker** (`scrapers/circuitBreaker.js`) — after
  `BREAKER_THRESHOLD` consecutive failures a store is skipped for
  `BREAKER_OPEN_MS` and reported as unavailable, instead of every search paying
  its timeout.

## Adding a new source

1. Create `src/scrapers/<Name>Scraper.js` extending `BaseScraper`; implement
   `search(query)` and `getPrice(url)`. Copy `CromaScraper.js` (JSON API +
   Playwright fallback) or `FlipkartScraper.js` (pure Playwright) as a template.
2. Register it in `src/scrapers/index.js`.
3. Add one row to `STORE_META` in `src/services/storeMeta.js` (name, colour,
   trust tier).
4. Optional: add store-wide bank offers to `src/data/bankOffers.seed.js`.

That's it — the aggregator, worker, status page, and frontend read from those
keys and need no changes.
