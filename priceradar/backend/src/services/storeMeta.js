/**
 * Presentation + trust metadata per store slug. One place so the frontend
 * never has to keep its own label map.
 *
 * trustRank: 1 = first-party / authorised retailer, 2 = large marketplace,
 *            3 = other. Used as the sort tie-break.
 */

export const STORE_META = {
  amazon_in: { name: "Amazon.in", color: "#ff9900", trustTier: "Marketplace", trustRank: 2 },
  flipkart: { name: "Flipkart", color: "#2874f0", trustTier: "Marketplace", trustRank: 2 },
  croma: { name: "Croma", color: "#12a2b8", trustTier: "Authorised", trustRank: 1 },
  reliance_digital: { name: "Reliance Digital", color: "#e4002b", trustTier: "Authorised", trustRank: 1 },
  vijay_sales: { name: "Vijay Sales", color: "#d21f27", trustTier: "Authorised", trustRank: 1 },
  tata_cliq: { name: "Tata CLiQ", color: "#c4161c", trustTier: "Marketplace", trustRank: 2 },
  jiomart: { name: "JioMart", color: "#008cff", trustTier: "Marketplace", trustRank: 2 },
  sangeetha: { name: "Sangeetha Mobiles", color: "#e42529", trustTier: "Authorised", trustRank: 1 },
  poorvika: { name: "Poorvika", color: "#f5a623", trustTier: "Authorised", trustRank: 1 },
};

export function storeMeta(slug) {
  return (
    STORE_META[slug] || {
      name: slug,
      color: "#6b7280",
      trustTier: "Marketplace",
      trustRank: 3,
    }
  );
}

/**
 * Monetised out-link hook. No affiliate templates wired yet — returns the
 * listing URL unchanged. Add per-store templates here when partner IDs land.
 */
export function affiliateUrl(url /* , slug */) {
  return url;
}
