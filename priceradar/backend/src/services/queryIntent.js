/**
 * Stage 1 of product matching — parse the user's raw search string into intent.
 *
 *   "iphone 15 256 gb"  ->  { brand: "apple", model: "15",
 *                             attrs: { storage_gb: 256 } }
 *
 * The attrs object is produced by the same extractors the title normalizer
 * uses, so query intent and a scraped title can be compared field by field.
 */

import { detectBrand } from "./brands.js";
import { extractAttrs, ALL_COLOR_WORDS } from "./attrs.js";

const NOISE_TOKENS = new Set([
  "gb", "tb", "ram", "rom", "storage", "internal", "5g", "4g", "lte", "wifi", "wi-fi",
  "cellular", "renewed", "refurbished", "pack", "of", "set", "combo", "new", "latest",
  "model", "with", "and", "the", "buy", "price", "online", "in", "india", "smartphone",
  "mobile", "phone", "dual", "sim",
]);

export function parseQueryIntent(query) {
  const raw = String(query || "").trim();
  const lower = raw.toLowerCase().replace(/[–—]/g, "-");

  const { brand, aliases } = detectBrand(lower);
  const attrs = extractAttrs(lower);

  const aliasTokens = new Set(
    aliases.flatMap((a) => a.toLowerCase().trim().split(/\s+/)).filter(Boolean)
  );

  const attrNumbers = new Set(
    [attrs.storage_gb, attrs.ram_gb, attrs.pack_size, attrs.model_year]
      .filter((n) => n !== undefined)
      .map(String)
  );

  const modelTokens = lower
    .split(/\s+/)
    .map((t) => t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter(Boolean)
    .filter((t) => {
      if (aliasTokens.has(t)) return false;
      if (NOISE_TOKENS.has(t)) return false;
      if (ALL_COLOR_WORDS.has(t)) return false;
      if (/^\d+\s*(gb|tb)$/.test(t)) return false;
      if (attrNumbers.has(t)) return false;
      return true;
    });

  return {
    raw,
    brand,
    aliases,
    attrs,
    modelTokens,
    model: modelTokens.join(" "),
  };
}
