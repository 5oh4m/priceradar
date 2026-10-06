/**
 * PriceRadar aggregator.
 *
 * Response contract (consumed by the React app):
 *
 *   {
 *     query, generatedAt,
 *     intent:  { brand, model, attrs },
 *     storeErrors: [{ store, message }],
 *     reviewQueue: [ parsed bank offers below the confidence threshold ],
 *     results:       Product[],   // exact matches for the query intent
 *     otherVariants: Product[]    // same model, a different storage/colour/...
 *   }
 *
 *   Product = {
 *     id, variantKey, title, attrs: string[], brand,
 *     mrp, rating, ratingCount, imageUrl,
 *     offers: StoreOffer[]        // one row per store, sorted, deduped
 *   }
 *
 * The comparison-block UI reads the headline price from the winning row, so
 * there is exactly one price object per store and no separate headline field
 * to drift out of sync.
 */

import stringSimilarity from "string-similarity";
import { scrapers } from "../scrapers/index.js";
import { BRAND_ALIASES } from "./brands.js";
import { parseQueryIntent } from "./queryIntent.js";
import { normalizeTitle } from "./titleNormalizer.js";
import { buildVariantKey, canonicalUrl } from "./variantKey.js";
import { attrsConflict } from "./attrs.js";
import { storeMeta, affiliateUrl } from "./storeMeta.js";
import { parseOfferBullet, toBankOfferDto, REVIEW_THRESHOLD } from "./bankOfferParser.js";
import { bankOffersForStore, guessCategory } from "./bankOffers.js";
import { isOpen, recordSuccess, recordFailure } from "../scrapers/circuitBreaker.js";

const SEARCH_TIMEOUT_MS = parseInt(process.env.SCRAPE_SEARCH_TIMEOUT_MS || "12000", 10);

/** Reject after `ms` so one slow store can't hold up the whole search. */
function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label}: timed out after ${ms}ms`)), ms);
    if (typeof t.unref === "function") t.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

export async function searchAcrossSources(query) {
  const allNames = Object.keys(scrapers);
  const storeErrors = [];

  // Skip stores whose breaker is open — don't pay the timeout for a store that
  // is known to be down.
  const sourceNames = allNames.filter((name) => {
    if (isOpen(name)) {
      storeErrors.push({ store: name, message: "temporarily unavailable" });
      return false;
    }
    return true;
  });

  const settled = await Promise.allSettled(
    sourceNames.map((name) =>
      withTimeout(Promise.resolve().then(() => scrapers[name].search(query)), SEARCH_TIMEOUT_MS, name)
    )
  );

  const listings = [];
  settled.forEach((result, i) => {
    const name = sourceNames[i];
    if (result.status === "fulfilled") {
      recordSuccess(name);
      for (const r of result.value || []) {
        listings.push({ ...r, source: r.source || name });
      }
    } else {
      recordFailure(name);
      console.error(`Scraper "${name}" failed:`, result.reason?.message);
      storeErrors.push({
        store: name,
        message: result.reason?.message || "temporarily unavailable",
      });
    }
  });

  const { results, otherVariants, intent, reviewQueue } = classify(query, listings);

  return {
    query,
    generatedAt: new Date().toISOString(),
    intent: { brand: intent.brand, model: intent.model, attrs: intent.attrs },
    storeErrors,
    reviewQueue,
    results,
    otherVariants,
  };
}

// ---------------------------------------------------------------------------
// Pure classification pipeline (no scraping — unit-testable)
// ---------------------------------------------------------------------------

/**
 * @param {string} query
 * @param {Array} listings  [{ title, price, url, source, inStock, imageUrl, mrp?, offerTexts? }]
 */
export function classify(query, listings) {
  const intent = parseQueryIntent(query);
  const relevant = filterByRelevance(listings || [], query);

  const exact = [];
  const siblings = [];

  for (const listing of relevant) {
    if (!listing || !listing.title || !(Number(listing.price) > 0)) continue;
    // Scrapers strip ad markers, but a regression there must not put a
    // sponsored placement into the comparison as if it were an organic price.
    if (/^\s*sponsored(\s+ad)?\b/i.test(listing.title)) continue;
    const norm = normalizeTitle(listing.title);
    const rec = { listing, norm };
    const conflictKey = attrsConflict(intent.attrs, norm.attrs);
    if (conflictKey) siblings.push({ ...rec, conflictKey });
    else exact.push(rec);
  }

  const reviewQueue = [];
  const results = assembleProducts(exact, reviewQueue);
  const otherVariants = assembleProducts(siblings, reviewQueue);

  return { intent, results, otherVariants, reviewQueue };
}

function assembleProducts(recs, reviewQueue) {
  // ── bucket by canonical variant ────────────────────────────────────────
  //
  // Coarse key is brand + model slug only. Splitting on attributes happens
  // below via attrsConflict, because stores describe the same product with
  // different amounts of detail: Amazon's title says "5G" where Reliance's
  // doesn't. Treating "unstated" as its own value would put the same phone in
  // two blocks and leave nothing to compare. Conflicting values still never
  // merge — that is the hard gate.
  const coarse = new Map();
  for (const { listing, norm } of recs) {
    let key = `${norm.brand || "?"}|${norm.slug || "?"}`;
    if (!norm.slug || norm.slug.length < 2) {
      key += "|~" + fuzzySignature(norm.clean, coarse);
    }
    if (!coarse.has(key)) coarse.set(key, []);
    coarse.get(key).push({ listing, norm });
  }

  const buckets = new Map();
  for (const [coarseKey, group] of coarse) {
    // Most-specific listings first, so well-described variants establish the
    // buckets before a vague title gets absorbed into one of them.
    const ordered = [...group].sort(
      (a, b) => Object.keys(b.norm.attrs).length - Object.keys(a.norm.attrs).length
    );

    const subs = []; // [{ attrs, members }]
    for (const rec of ordered) {
      const fit = subs.find((sub) => attrsConflict(sub.attrs, rec.norm.attrs) === null);
      if (fit) {
        fit.members.push(rec);
        // an unknown on the bucket is filled in by whoever does state it
        for (const [k, v] of Object.entries(rec.norm.attrs)) {
          if (fit.attrs[k] === undefined) fit.attrs[k] = v;
        }
      } else {
        subs.push({ attrs: { ...rec.norm.attrs }, members: [rec] });
      }
    }

    subs.forEach((sub, i) => {
      const key = buildVariantKey({
        brand: sub.members[0].norm.brand,
        slug: sub.members[0].norm.slug,
        attrs: sub.attrs,
      });
      buckets.set(buckets.has(key) ? `${key}#${i}` : key, sub.members);
    });
  }

  const products = [];

  for (const [key, group] of buckets) {
    // ── one offer per store: keep the lowest listed price for that store ──
    const byStore = new Map();
    for (const { listing, norm } of group) {
      const slug = listing.source;
      const prev = byStore.get(slug);
      if (!prev || Number(listing.price) < Number(prev.listing.price)) {
        byStore.set(slug, { listing, norm });
      }
    }

    const merged = mergeAttrs(group.map((g) => g.norm.attrs));
    const brand = group.map((g) => g.norm.brand).find(Boolean) || null;
    const slug = group.map((g) => g.norm.slug).find(Boolean) || "";
    const sampleTitle = group.map((g) => g.listing.title).find(Boolean) || "";
    const category = guessCategory(brand, merged, sampleTitle);

    const offers = [...byStore.values()].map(({ listing }) =>
      toStoreOffer(listing, reviewQueue, { brand, category })
    );
    if (offers.length === 0) continue;

    offers.sort(
      (a, b) =>
        Number(b.inStock) - Number(a.inStock) ||
        a.listed - b.listed ||
        a._trustRank - b._trustRank
    );

    const imageUrl = group.map((g) => g.listing.imageUrl).find(Boolean) || null;
    const mrp = Math.max(
      0,
      ...group.map((g) => Number(g.listing.mrp) || 0),
      ...offers.map((o) => o.listed)
    );

    products.push({
      id: key,
      variantKey: key,
      title: displayTitle(group, brand, slug, merged),
      attrs: chipAttrs(merged),
      brand,
      mrp,
      rating: pickRating(group),
      ratingCount: pickRatingCount(group),
      imageUrl,
      offers: offers.map(({ _trustRank, ...o }) => o),
    });
  }

  products.sort((a, b) => bestPrice(a) - bestPrice(b));
  return products;
}

function toStoreOffer(listing, reviewQueue, ctx = {}) {
  const meta = storeMeta(listing.source);

  // Highest precedence first: manual/admin overrides, then scraped bullets.
  const seeded = bankOffersForStore({
    storeSlug: listing.source,
    brand: ctx.brand ?? null,
    category: ctx.category ?? "other",
  });
  const scraped = (listing.offerTexts || listing.bankOffersRaw || []).map((t) => ({ text: t }));

  const bankOffers = [];
  const seen = new Set();
  let noCostEmi = listing.noCostEmi || undefined;

  for (const src of [...seeded, ...scraped]) {
    const parsed = parseOfferBullet(src.text, listing.source);
    if (!parsed) continue;
    if (src.sourceUrl) parsed.sourceUrl = src.sourceUrl;
    if (parsed.confidence < REVIEW_THRESHOLD) {
      reviewQueue.push({ store: listing.source, url: listing.url, ...parsed });
      continue;
    }
    if (parsed.kind === "NO_COST_EMI") {
      noCostEmi = noCostEmi || (parsed.issuer ? `${parsed.issuer}` : "available");
      continue;
    }
    if (parsed.kind === "EXCHANGE") continue; // separate toggle, not a discount
    const dedupe = `${parsed.issuer}|${parsed.instrument}|${parsed.discountType}|${parsed.value}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    bankOffers.push(toBankOfferDto(parsed));
  }

  return {
    storeSlug: listing.source,
    storeName: meta.name,
    storeColor: meta.color,
    trustTier: meta.trustTier,
    _trustRank: meta.trustRank,
    url: affiliateUrl(listing.url, listing.source),
    canonicalUrl: canonicalUrl(listing.url),
    listed: Math.round(Number(listing.price)),
    coupon: Number(listing.coupon) || undefined,
    inStock: listing.inStock !== false,
    delivery: listing.delivery || "—",
    noCostEmi,
    fetchedAgo: listing.fetchedAgo || "just now",
    bankOffers,
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function bestPrice(product) {
  const inStock = product.offers.filter((o) => o.inStock).map((o) => o.listed);
  const pool = inStock.length ? inStock : product.offers.map((o) => o.listed);
  return Math.min(...pool);
}

function mergeAttrs(list) {
  const out = {};
  for (const a of list) {
    for (const [k, v] of Object.entries(a || {})) {
      if (out[k] === undefined) out[k] = v;
    }
  }
  return out;
}

const PRETTY = {
  iphone: "iPhone", ipad: "iPad", imac: "iMac", macbook: "MacBook", airpods: "AirPods",
  ipod: "iPod", oneplus: "OnePlus", iqoo: "iQOO", realme: "realme", poco: "POCO",
  redmi: "Redmi", oppo: "OPPO", vivo: "vivo", jbl: "JBL", boat: "boAt", rog: "ROG",
  wh: "WH", wf: "WF", xps: "XPS", tv: "TV", 5: "5", 4: "4",
};

function titleCase(s) {
  return String(s || "")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => {
      const lw = w.toLowerCase();
      if (PRETTY[lw]) return PRETTY[lw];
      if (/^[0-9]/.test(w)) return w.toUpperCase();
      return w[0].toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function storageLabel(gb) {
  return gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024} TB` : `${gb} GB`;
}

function chipAttrs(a) {
  const out = [];
  if (a.storage_gb) out.push(storageLabel(a.storage_gb));
  if (a.ram_gb) out.push(`${a.ram_gb} GB RAM`);
  if (a.color) out.push(titleCase(a.color));
  if (a.connectivity === "wifi") out.push("Wi-Fi");
  else if (a.connectivity) out.push(a.connectivity.toUpperCase());
  if (a.model_year) out.push(String(a.model_year));
  if (a.pack_size) out.push(`Pack of ${a.pack_size}`);
  if (a.refurbished) out.push("Renewed");
  return out;
}

function displayTitle(group, brand, slug, a) {
  const base = [brand ? titleCase(brand) : "", slug ? titleCase(slug) : ""]
    .filter(Boolean)
    .join(" ")
    .trim();
  const paren = [];
  if (a.storage_gb) paren.push(storageLabel(a.storage_gb));
  if (a.color) paren.push(titleCase(a.color));
  const built = (base + (paren.length ? ` (${paren.join(", ")})` : "")).trim();
  if (built.length >= 12) return built;
  return group
    .map((g) => g.listing.title)
    .filter(Boolean)
    .sort((x, y) => y.length - x.length)[0];
}

function pickRating(group) {
  const v = group.map((g) => Number(g.listing.rating)).filter((n) => n > 0);
  return v.length ? Math.round((v.reduce((s, n) => s + n, 0) / v.length) * 10) / 10 : null;
}

function pickRatingCount(group) {
  const v = group.map((g) => Number(g.listing.ratingCount)).filter((n) => n > 0);
  return v.length ? Math.max(...v) : null;
}

const _fuzzyReps = [];
function fuzzySignature(clean, _buckets) {
  const norm = String(clean || "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
  for (const rep of _fuzzyReps) {
    if (stringSimilarity.compareTwoStrings(norm, rep) >= 0.82) return rep;
  }
  _fuzzyReps.push(norm);
  return norm;
}

// ---------------------------------------------------------------------------
// Relevance pre-filter  (kept from the previous build, lightly cleaned)
// ---------------------------------------------------------------------------

function extractQueryTerms(query) {
  const lower = query.toLowerCase().trim();
  const allTerms = lower.split(/\s+/).filter(Boolean);

  let detectedBrand = null;
  let brandAliases = [];
  for (const [brand, aliases] of Object.entries(BRAND_ALIASES)) {
    for (const alias of aliases) {
      if (lower.includes(alias.trim())) {
        detectedBrand = brand;
        brandAliases = aliases;
        break;
      }
    }
    if (detectedBrand) break;
  }

  const modelTerms = allTerms.filter((term) => {
    if (!detectedBrand) return true;
    return !brandAliases.some((alias) => alias.trim().split(/\s+/).includes(term));
  });

  return { brand: detectedBrand, brandAliases, modelTerms, allTerms };
}

function relevanceScore(title, queryInfo) {
  const normTitle = title
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9 +]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const { brand, brandAliases, modelTerms, allTerms } = queryInfo;

  let score = 0;

  const accessoryTerms = ["case", "cover", "protector", "glass", "charger", "cable", "adapter", "strap", "band"];
  const queryHasAccessory = allTerms.some((term) => accessoryTerms.includes(term));
  const titleHasAccessory = accessoryTerms.some(
    (term) => normTitle.includes(` ${term}`) || normTitle.startsWith(`${term} `)
  );
  if (titleHasAccessory && !queryHasAccessory) return 0;

  if (brand) {
    const brandMatch = brandAliases.some((alias) => normTitle.includes(alias.trim()));
    if (brandMatch) score += 0.4;
    else return 0;
  }

  if (modelTerms.length > 0) {
    let modelMatched = false;
    const perTerm = 0.6 / modelTerms.length;
    for (const term of modelTerms) {
      if (/^\d+$/.test(term)) {
        const suffixes = "(?:r|s|pro|plus|ultra|max|fe|lite|se|mini|x)";
        const regex = new RegExp(`\\b${term}\\b|\\b${term}${suffixes}\\b|\\b${suffixes}${term}\\b`, "i");
        if (regex.test(normTitle)) {
          score += perTerm;
          modelMatched = true;
        }
      } else if (normTitle.includes(term)) {
        score += perTerm;
        modelMatched = true;
      }
    }
    if (!modelMatched) return 0;
  } else if (brand) {
    score += 0.6;
  }

  return score;
}

export function filterByRelevance(listings, query, minScore = 0.35) {
  const queryInfo = extractQueryTerms(query);

  if (!queryInfo.brand && queryInfo.modelTerms.length === 0) {
    return listings.slice(0, 30);
  }

  return listings
    .map((listing) => ({ listing, score: relevanceScore(listing.title || "", queryInfo) }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.listing);
}
