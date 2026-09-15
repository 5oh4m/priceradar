/**
 * Turn a Product into sorted comparison rows and pick the winning row.
 *
 * The headline price in the UI is read from `winner`, and `winner` is always
 * the first in-stock row after sorting — so the headline can never disagree
 * with the top row of the table.
 */

import { computePrice } from "./effectivePrice.js";

const COMPARATORS = {
  effective: (a, b) => a.price.effective - b.price.effective,
  listed: (a, b) => a.price.listed - b.price.listed,
  delivery: (a, b) =>
    Number(b.offer.delivery === "Tomorrow") - Number(a.offer.delivery === "Tomorrow"),
};

export function selectRows(product, { wallet = new Set(), sortBy = "effective", inStockOnly = false } = {}) {
  const scored = (product.offers || []).map((offer) => ({ offer, price: computePrice(offer, wallet) }));
  const visible = inStockOnly ? scored.filter((s) => s.offer.inStock) : scored;

  const cmp = COMPARATORS[sortBy] || COMPARATORS.effective;
  const rows = [...visible].sort(
    (a, b) => Number(b.offer.inStock) - Number(a.offer.inStock) || cmp(a, b)
  );

  if (rows.length === 0) return { rows, winner: null, spread: 0 };

  const winner = rows.find((r) => r.offer.inStock) ?? rows[0];
  const spread = rows[rows.length - 1].price.effective - winner.price.effective;
  return { rows, winner, spread };
}
