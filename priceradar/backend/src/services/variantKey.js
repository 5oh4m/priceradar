/**
 * Stage 3 of product matching — the canonical key.
 *
 * Two listings share a comparison block only if they agree on (or both omit)
 * every hard-gate attribute. This is what keeps a 128 GB listing out of a
 * 256 GB block whatever the title similarity.
 */

export function buildVariantKey({ brand, slug, attrs }) {
  const a = attrs || {};
  return [
    brand || "?",
    slug || "?",
    a.storage_gb ?? "any",
    a.color ?? "any",
    a.ram_gb ?? "any",
    a.connectivity ?? "any",
    a.model_year ?? "any",
    a.pack_size ?? "any",
    a.refurbished ? "refurb" : "new",
  ].join("|");
}

/** Canonicalise a product URL for de-duplication: drop query string + fragment. */
export function canonicalUrl(u) {
  try {
    const url = new URL(u);
    url.hash = "";
    url.search = "";
    return (url.origin + url.pathname).replace(/\/+$/, "").toLowerCase();
  } catch {
    return String(u || "")
      .split(/[?#]/)[0]
      .replace(/\/+$/, "")
      .toLowerCase();
  }
}
