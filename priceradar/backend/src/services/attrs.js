/**
 * Deterministic attribute extractors.
 *
 * Used by BOTH the query-intent parser and the scraped-title normalizer so the
 * two produce the same shape and can be compared field-by-field. That
 * comparison is the "hard gate": a listing whose storage / RAM / colour /
 * model year / connectivity / pack size / new-vs-refurbished disagrees with an
 * attribute the user explicitly asked for is never merged into the results.
 */

export const HARD_GATE_KEYS = [
  "storage_gb",
  "ram_gb",
  "color",
  "model_year",
  "connectivity",
  "pack_size",
  "refurbished",
];

const MULTIWORD_COLORS = [
  "natural titanium", "blue titanium", "white titanium", "black titanium", "desert titanium",
  "space grey", "space gray", "phantom black", "sierra blue", "alpine green", "pacific blue",
  "rose gold", "midnight green", "sky blue", "matte black", "glossy black", "forest green",
  "titan black", "titan grey", "titan gray", "titan violet", "titan yellow", "awesome black",
  "awesome blue", "awesome lavender", "awesome graphite", "cobalt violet", "amber yellow",
];

const COLORS = [
  "black", "white", "blue", "green", "red", "yellow", "purple", "pink", "gold", "silver",
  "grey", "gray", "graphite", "midnight", "starlight", "titanium", "cream", "lavender",
  "mint", "coral", "orange", "bronze", "teal", "ultramarine", "aquamarine", "charcoal",
  "obsidian", "porcelain", "sage", "violet", "indigo", "cyan", "beige", "khaki", "burgundy",
  "emerald", "sapphire", "amber", "ivory", "onyx", "slate",
];

/** Colour phrases, longest first, so "natural titanium" wins over "titanium". */
export const COLOR_MATCH_LIST = [...MULTIWORD_COLORS, ...COLORS];

/** Every individual colour word, for token-level filtering elsewhere. */
export const ALL_COLOR_WORDS = new Set([
  ...MULTIWORD_COLORS.flatMap((c) => c.split(/\s+/)),
  ...COLORS,
]);

const RAM_ONLY = new Set([3, 6, 12, 18, 24]); //  never a phone storage size
const STORAGE_SIZES = new Set([16, 32, 64, 128, 256, 512, 1024, 2048]);

export function extractStorageGb(s) {
  const tb = s.match(/(\d+(?:\.\d+)?)\s*tb\b/);
  if (tb) return Math.round(parseFloat(tb[1]) * 1024);

  const ctx = s.match(/(\d+)\s*gb\s*(?:rom|storage|internal|ssd|hdd|emmc|ufs|inbuilt)\b/);
  if (ctx) return parseInt(ctx[1], 10);

  const tokens = [...s.matchAll(/(\d+)\s*gb\b(?!\s*ram)/g)].map((m) => parseInt(m[1], 10));
  const storageish = tokens.filter((n) => STORAGE_SIZES.has(n) && !RAM_ONLY.has(n));
  if (storageish.length) return Math.max(...storageish);
  return undefined;
}

export function extractRamGb(s) {
  const ctx = s.match(/(\d+)\s*gb\s*ram\b/) || s.match(/\bram[:\s]*(\d+)\s*gb\b/);
  if (ctx) return parseInt(ctx[1], 10);

  const combo = s.match(/\b(\d+)\s*\+\s*\d+\b/); // "8+256"
  if (combo) {
    const a = parseInt(combo[1], 10);
    if (a >= 1 && a <= 24) return a;
  }

  const tokens = [...s.matchAll(/(\d+)\s*gb\b/g)].map((m) => parseInt(m[1], 10));
  const ramish = tokens.filter((n) => RAM_ONLY.has(n));
  if (ramish.length) return Math.min(...ramish);
  return undefined;
}

export function extractColor(s) {
  for (const c of COLOR_MATCH_LIST) {
    const re = new RegExp(`(^|[^a-z])${c.replace(/\s+/g, "\\s+")}([^a-z]|$)`);
    if (re.test(s)) return c === "gray" ? "grey" : c === "space gray" ? "space grey" : c;
  }
  return undefined;
}

export function extractModelYear(s) {
  const m = s.match(/\b(20[12]\d)\b/);
  if (!m) return undefined;
  const y = parseInt(m[1], 10);
  return y >= 2010 && y <= 2035 ? y : undefined;
}

export function extractConnectivity(s) {
  if (/\bwi-?fi\s*\+\s*cellular\b/.test(s) || /\bcellular\b/.test(s)) return "cellular";
  if (/\b5\s?g\b/.test(s)) return "5g";
  if (/\b(4\s?g|lte)\b/.test(s)) return "4g";
  if (/\bwi-?fi\b/.test(s)) return "wifi";
  return undefined;
}

export function extractPackSize(s) {
  const m =
    s.match(/\bpack\s+of\s+(\d+)\b/) ||
    s.match(/\bset\s+of\s+(\d+)\b/) ||
    s.match(/\bcombo\s+of\s+(\d+)\b/) ||
    s.match(/\(\s*(\d+)\s*(?:pcs|pieces|units|count|pack)\s*\)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n > 1 && n <= 50) return n;
  }
  return undefined;
}

export function extractRefurbished(s) {
  return /\b(renewed|refurbished|refurb|pre-?owned|open[-\s]?box|second[-\s]?hand)\b/.test(s)
    ? true
    : undefined;
}

/** Run every extractor over a raw string. Returns only the keys it found. */
export function extractAttrs(str) {
  const s = " " + String(str || "").toLowerCase().replace(/[–—]/g, "-") + " ";
  const out = {};
  const set = (k, v) => {
    if (v !== undefined) out[k] = v;
  };
  set("storage_gb", extractStorageGb(s));
  set("ram_gb", extractRamGb(s));
  set("color", extractColor(s));
  set("model_year", extractModelYear(s));
  set("connectivity", extractConnectivity(s));
  set("pack_size", extractPackSize(s));
  set("refurbished", extractRefurbished(s));
  return out;
}

/**
 * Returns the name of the first hard-gate attribute that is present on BOTH
 * sides and differs, or null if the two attribute sets are compatible.
 * Missing on either side is treated as "no conflict" (titles often omit colour).
 */
export function attrsConflict(a, b) {
  for (const k of HARD_GATE_KEYS) {
    if (a[k] === undefined || b[k] === undefined) continue;
    if (String(a[k]) !== String(b[k])) return k;
  }
  return null;
}
