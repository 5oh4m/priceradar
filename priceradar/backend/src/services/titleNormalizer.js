/**
 * Stage 2 of product matching — normalize a scraped listing title.
 *
 * Strips marketing noise, lower-cases, then extracts attributes into the same
 * shape as the query-intent parser and derives:
 *   - brand   : canonical brand slug ("apple")
 *   - slug    : model slug for the canonical key ("iphone-15")
 *   - attrs   : { storage_gb, ram_gb, color, ... }
 */

import { detectBrand, BRAND_NAME_TOKENS } from "./brands.js";
import { extractAttrs, COLOR_MATCH_LIST } from "./attrs.js";

const NOISE_PATTERNS = [
  /\(\s*renewed\s*\)/gi,
  /\brenewed\b/gi,
  /\brefurbished\b/gi,
  /\bpre-?owned\b/gi,
  /\bopen[-\s]?box\b/gi,
  /-\s*latest\s+model\b/gi,
  /\bwith\s+ai\b/gi,
  /\bbrand\s+new\b/gi,
  /\b(buy|best|lowest|online|official|genuine)\b/gi,
  /\bfree\s+delivery\b/gi,
  /\bprice\s+in\s+india\b/gi,
  /\s\|\s.*$/g, // drop everything after a " | "
];

const COLOR_RE = new RegExp(
  `\\b(${COLOR_MATCH_LIST.map((c) => c.replace(/\s+/g, "\\s+")).join("|")})\\b`,
  "gi"
);

function modelSlug(clean, brand) {
  let t = " " + clean + " ";
  const names = BRAND_NAME_TOKENS[brand] || (brand ? [brand] : []);
  for (const n of names) {
    t = t.replace(new RegExp(`\\b${n.replace(/\s+/g, "\\s+")}\\b`, "gi"), " ");
  }
  t = t
    .replace(/\([^)]*\)/g, " ")
    .replace(/\d+(?:\.\d+)?\s*(gb|tb|mah|mp|hz|inch|cm|nits|watt|w|k)\b/gi, " ")
    .replace(/\b\d+\s*\+\s*\d+\b/g, " ")
    .replace(
      /\b(5g|4g|lte|wi-?fi|cellular|dual|sim|ram|rom|storage|internal|smartphone|mobile|phone|tablet|laptop|with|and|the|new|latest|model|edition|series|generation|gen)\b/gi,
      " "
    )
    .replace(COLOR_RE, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
  return t.split(/\s+/).filter(Boolean).slice(0, 4).join("-");
}

export function normalizeTitle(rawTitle) {
  const raw = String(rawTitle || "");
  const lowered = raw.toLowerCase().replace(/[–—]/g, "-").replace(/&amp;/g, "&");

  // Extract attributes BEFORE stripping noise — "renewed" lives in the noise list.
  const attrs = extractAttrs(lowered);

  let clean = lowered;
  for (const re of NOISE_PATTERNS) clean = clean.replace(re, " ");
  clean = clean.replace(/[^a-z0-9+".\-\s()]/g, " ").replace(/\s+/g, " ").trim();

  const { brand, aliases } = detectBrand(clean);
  const slug = modelSlug(clean, brand);

  return { raw, clean, attrs, brand, aliases, slug };
}
