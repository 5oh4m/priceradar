/**
 * The effective-price engine (shared by the component and the tests).
 *
 * Indian checkouts apply ONE bank offer per transaction, so instant offers are
 * never summed. Cashback settled later is reported separately and never
 * subtracted from `effective`. No-cost EMI is a badge, not a discount.
 */

export const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");

export function discountOf(o, listed) {
  if (o.minTxn && listed < o.minTxn) return 0;
  if (o.discountType === "FLAT") return o.value;
  const pct = Math.round((listed * o.value) / 100);
  return o.maxDiscount != null ? Math.min(pct, o.maxDiscount) : pct;
}

/**
 * @param {object} offer   StoreOffer
 * @param {Set<string>} wallet   issuers the user holds; empty = anonymous (best across all)
 * @returns PriceBreakdown
 */
export function computePrice(offer, wallet = new Set()) {
  const canUse = (o) => wallet.size === 0 || wallet.has(o.issuer);
  const bankOffers = offer.bankOffers || [];

  const usable = bankOffers.filter((o) => o.settlement === "INSTANT" && canUse(o));

  let applied = null;
  let bankDiscount = 0;
  for (const o of usable) {
    const d = discountOf(o, offer.listed);
    if (d > bankDiscount) {
      bankDiscount = d;
      applied = o;
    }
  }

  const deferred =
    bankOffers
      .filter((o) => o.settlement === "CASHBACK" && canUse(o))
      .map((o) => ({ ...o, amount: discountOf(o, offer.listed) }))
      .sort((a, b) => b.amount - a.amount)[0] ?? null;

  const alternatives = bankOffers
    .filter((o) => o !== applied && o.settlement === "INSTANT")
    .map((o) => ({ ...o, amount: discountOf(o, offer.listed) }))
    .filter((o) => o.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const couponDiscount = offer.coupon ?? 0;

  return {
    listed: offer.listed,
    bankDiscount,
    couponDiscount,
    effective: offer.listed - bankDiscount - couponDiscount,
    applied,
    deferred,
    alternatives,
  };
}
