/**
 * Resolves the bank offers that apply to a given store row.
 *
 * Sources, highest precedence first:
 *   1. Manual / admin overrides   — data/bankOffers.seed.js
 *   2. Scraped product-page bullets — listing.offerTexts  (not wired in scrapers yet)
 *
 * Everything is returned as { text, sourceUrl } and parsed downstream by
 * bankOfferParser.js, so one confidence gate and one set of stacking rules
 * cover both sources.
 */

import { SEED_BANK_OFFERS } from "../data/bankOffers.seed.js";

const PHONE_BRANDS = new Set([
  "apple", "samsung", "oneplus", "xiaomi", "realme", "oppo", "vivo", "google",
  "nothing", "motorola",
]);
const AUDIO_BRANDS = new Set(["boat", "jbl", "marshall", "sony"]);
const LAPTOP_BRANDS = new Set(["dell", "lenovo", "asus", "acer", "hp", "apple"]);

/** Best-effort category guess from what the matcher already extracted. */
export function guessCategory(brand, attrs = {}, title = "") {
  const t = String(title).toLowerCase();
  if (/\b(laptop|notebook|macbook|ideapad|thinkpad|zenbook|vivobook)\b/.test(t)) return "laptop";
  if (/\b(tablet|ipad|tab\b)\b/.test(t)) return "tablet";
  if (/\b(headphone|earbud|earphone|soundbar|speaker|airpods)\b/.test(t)) return "audio";
  if (/\b(tv|television|smart tv)\b/.test(t)) return "tv";
  if (/\b(watch|band|smartwatch)\b/.test(t)) return "wearable";
  if (attrs.connectivity === "wifi" && attrs.storage_gb) return "tablet";
  if (attrs.storage_gb && (attrs.connectivity === "5g" || attrs.connectivity === "4g")) return "smartphone";
  if (brand && PHONE_BRANDS.has(brand) && attrs.storage_gb) return "smartphone";
  if (brand && AUDIO_BRANDS.has(brand)) return "audio";
  if (brand && LAPTOP_BRANDS.has(brand)) return "laptop";
  return "other";
}

function listMatch(value, list) {
  return list === "*" || (Array.isArray(list) && list.includes(value));
}

function notExpired(validTo) {
  if (!validTo) return true;
  const end = new Date(validTo + "T23:59:59");
  return Number.isNaN(+end) || end.getTime() >= Date.now();
}

/**
 * @param {{ storeSlug: string, brand: string|null, category: string }} ctx
 * @returns {{ text: string, sourceUrl?: string }[]}
 */
export function bankOffersForStore({ storeSlug, brand, category }) {
  const out = [];
  for (const o of SEED_BANK_OFFERS) {
    if (!notExpired(o.validTo)) continue;
    if (!listMatch(storeSlug, o.stores)) continue;
    if (!listMatch(brand, o.brands)) continue;
    if (!listMatch(category, o.categories)) continue;
    out.push({ text: o.text, sourceUrl: o.sourceUrl });
  }
  return out;
}
