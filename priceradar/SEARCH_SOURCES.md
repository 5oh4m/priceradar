# Where PriceRadar's product data comes from

This is a reference for `GET /api/search?q=`: what actually gets hit on the
internet when someone searches, in what order, and how reliable each source is
right now. Code lives in `backend/src/scrapers/` (one file per store) and
`backend/src/services/priceAggregator.js` (orchestration).

Nothing is scraped in advance and nothing is cached — every search calls all
nine store adapters live, in parallel, right then.

## 1. The nine store adapters

Each adapter tries a direct JSON endpoint first (fast, structured, less likely
to get blocked) and falls back to rendering the page with Playwright (a real
headless Chromium browser) only if the endpoint fails. That fallback is
**disabled** on the adapters where it cannot currently succeed — attempting it
burned the entire 12s per-store timeout on every search for nothing. Re-enable
one by flipping `allowBrowserFallback` in `scrapers/index.js`.

| Store | Slug | Primary method | Endpoint / entry point | Fallback |
|---|---|---|---|---|
| Amazon.in | `amazon_in` | Playwright only | `https://www.amazon.in/s?k=<query>` | — |
| Flipkart | `flipkart` | Playwright only | `https://www.flipkart.com/search?q=<query>` | — |
| Croma | `croma` | JSON API | `https://api.croma.com/searchservices/v1/search?query=<query>` | disabled |
| Reliance Digital | `reliance_digital` | JSON API | `https://www.reliancedigital.in/ext/raven-api/catalog/v1.0/products?q=<query>` | none (returns empty on failure) |
| Vijay Sales | `vijay_sales` | JSON API (Unbxd) | `https://search.unbxd.io/<key>/<sitekey>/search?q=<query>` | Playwright on `vijaysales.com` search flyout |
| Tata CLiQ | `tata_cliq` | JSON API | `https://searchbff.tatacliq.com/products/mpl/search?searchText=<query>` | disabled |
| JioMart | `jiomart` | Algolia search | Algolia index `prod_mart_master_vertical` (needs `JIOMART_ALGOLIA_KEY`) | disabled |
| Sangeetha Mobiles | `sangeetha` | JSON API (guessed) | `https://apiv2.sangeethamobiles.com/api/product/search?search=<query>` | disabled |
| Poorvika | `poorvika` | JSON API (guessed) | `https://arrc-webapi.poorvika.com/api/v3/product-variant/search?search=<query>` | disabled |

Every adapter returns the same shape regardless of method:
`{ title, price, url, imageUrl, inStock, source }`.

### Verified working
**Reliance Digital and Vijay Sales** return listings reliably via their JSON
endpoints. **Croma's** endpoint is real and answers, but has been returning
empty result sets for every query tried. All point-in-time — network
conditions, IP reputation, or the endpoints themselves can change it.

One Reliance Digital bug worth remembering: its images were read from
`attributes.variant_media`, which that API returns empty. They actually live on
`item.medias[]`. Until that was fixed, every Reliance-only product block
rendered the "no image" placeholder.

### Amazon.in — working
Pure Playwright DOM scraping, and currently returning usable listings with
titles, prices, ratings and `/dp/` URLs. Two things had to be fixed for this:
its `h2 span` title selector collapsed to just the brand ("Apple") on some card
layouts, so the title is now taken as the longest of several candidates
including the image `alt`; and the sponsored-ad filter matched nothing, so ads
were flowing in as if they were organic prices. Amazon changes this markup
often — if Amazon rows vanish, check those selectors first.

### Not verified / needs tuning
**Flipkart** — pure Playwright (DOM scraping), same fragility as Amazon, and
its selectors have not been re-verified.

**Tata CLiQ, JioMart, Sangeetha Mobiles, Poorvika** — added most recently.
I wrote these against the shape I'd expect each site's storefront API to have,
but I have not captured the real requests from each site's own network traffic
(browser devtools → Network tab while searching on the live site), so:
- Sangeetha's and Poorvika's hostnames don't currently resolve — the endpoint
  paths are guesses.
- Tata CLiQ's endpoint responds but rejects the request (needs more/different
  query parameters than I'm sending).
- JioMart needs a real Algolia app/API key (`JIOMART_ALGOLIA_KEY` env var).

All four fail *soft* and *fast*: they return an empty list rather than throwing
or stalling, so a search never errors, hangs, or shows a false "temporarily
unavailable" banner because of them. They contribute nothing until their
endpoints are corrected.

## 2. Search hardening (applies to all nine)

- **12-second timeout per store** (`SCRAPE_SEARCH_TIMEOUT_MS`) — one slow or
  hanging store can't delay the whole search.
- **Circuit breaker** (`backend/src/scrapers/circuitBreaker.js`) — after 5
  consecutive failures a store is skipped for 15 minutes.
- `GET /api/status` shows live health per store.

## 3. What happens to the raw listings after scraping

The scrapers only fetch; everything that turns raw listings into the
comparison blocks the UI shows is in `priceAggregator.js`:

1. **Relevance filter** — drops listings that don't match the brand/model
   terms in the query (`filterByRelevance`).
2. **Query intent + title normalization** — parses what the user asked for and
   what each listing actually is (storage, RAM, colour, connectivity, model
   year, refurbished) — `queryIntent.js` / `titleNormalizer.js`.
3. **Hard gate** — a listing whose storage/colour/etc. conflicts with what the
   query specified is routed to "Other variants" instead of being merged in
   (`attrs.js`).
4. **Canonical grouping + dedupe** — listings are bucketed into one block per
   real product variant, one row per store, keeping the lowest price on a
   collision (`variantKey.js`). Grouping is by brand + model slug, then split
   only where an attribute genuinely *conflicts*. An attribute one store states
   and another omits (Amazon says "5G", Reliance doesn't) must not split the
   block, or there is nothing left to compare.

## 4. Bank offers (not product data, but shown alongside it)

Bank/card offers are **not scraped yet** — `BaseScraper.fetchBankOffers()`
returns `[]` for every adapter. What shows on each row today comes from a
manual seed list, `backend/src/data/bankOffers.seed.js` — real-shaped store
card offers I wrote in, each with a source URL, matched to rows by store and
category. Treat these as illustrative/"as advertised", not live-verified.
