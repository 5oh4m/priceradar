/**
 * Brand knowledge shared by the query-intent parser and the title normalizer.
 *
 * BRAND_ALIASES  — strings that, if present anywhere in a query/title, imply the
 *                  canonical brand. Used for relevance filtering and brand detection.
 * BRAND_NAME_TOKENS — just the manufacturer name(s) to strip when deriving a model
 *                  slug. Product-line words (iphone, redmi, galaxy) are kept.
 */

export const BRAND_ALIASES = {
  oneplus: ["oneplus", "one plus", "1+"],
  samsung: ["samsung", "galaxy"],
  apple: ["apple", "iphone", "ipad", "macbook", "airpods", "imac", "watch ultra"],
  xiaomi: ["xiaomi", "redmi", "poco", "mi "],
  realme: ["realme"],
  oppo: ["oppo", "reno"],
  vivo: ["vivo", "iqoo"],
  google: ["google", "pixel"],
  motorola: ["motorola", "moto "],
  nothing: ["nothing", "cmf "],
  sony: ["sony", "playstation", "ps5", "ps4", "bravia", "wh-1000", "wf-1000"],
  lg: ["lg "],
  hp: ["hp ", "hewlett"],
  dell: ["dell", "inspiron", "xps", "alienware"],
  lenovo: ["lenovo", "ideapad", "thinkpad", "legion"],
  asus: ["asus", "rog ", "zenbook", "vivobook"],
  acer: ["acer", "nitro", "predator"],
  boat: ["boat", "boAt"],
  jbl: ["jbl"],
  marshall: ["marshall"],
  dyson: ["dyson"],
  canon: ["canon", "eos"],
  nikon: ["nikon"],
};

export const BRAND_NAME_TOKENS = {
  oneplus: ["oneplus", "one plus"],
  samsung: ["samsung"],
  apple: ["apple"],
  xiaomi: ["xiaomi", "mi"],
  realme: ["realme"],
  oppo: ["oppo"],
  vivo: ["vivo"],
  google: ["google"],
  motorola: ["motorola", "moto"],
  nothing: ["nothing"],
  sony: ["sony"],
  lg: ["lg"],
  hp: ["hp", "hewlett packard", "hewlett-packard"],
  dell: ["dell"],
  lenovo: ["lenovo"],
  asus: ["asus"],
  acer: ["acer"],
  boat: ["boat"],
  jbl: ["jbl"],
  marshall: ["marshall"],
  dyson: ["dyson"],
  canon: ["canon"],
  nikon: ["nikon"],
};

/** Detect the canonical brand from an already-lowercased string. */
export function detectBrand(lowerStr) {
  const hay = " " + String(lowerStr || "").toLowerCase() + " ";
  for (const [brand, aliases] of Object.entries(BRAND_ALIASES)) {
    for (const alias of aliases) {
      const a = alias.trim().toLowerCase();
      if (!a) continue;
      const esc = a.replace(/[+]/g, "\\+").replace(/\s+/g, "\\s+");
      const re = new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i");
      if (re.test(hay)) return { brand, aliases };
    }
  }
  return { brand: null, aliases: [] };
}
