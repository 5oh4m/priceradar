/**
 * PriceRadar — comparison block
 *
 * One canonical product = one block. Stores are rows inside it, sorted by
 * effective price. There is exactly one price object per row and the headline
 * reads from the winning row, so it can never drift from the table.
 *
 * Ported from the published TypeScript prototype; the effective-price engine
 * and row-selection logic live in ../lib so they can be unit-tested.
 */

import { useMemo, useState } from "react";
import { inr } from "../lib/effectivePrice.js";
import { selectRows } from "../lib/compare.js";

export function ComparisonBlock({ product, wallet, sortBy, inStockOnly, onTrack }) {
  const [expanded, setExpanded] = useState(() => new Set());

  const { rows, winner, spread } = useMemo(
    () => selectRows(product, { wallet, sortBy, inStockOnly }),
    [product, wallet, sortBy, inStockOnly]
  );

  if (rows.length === 0) return null;

  const toggle = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section className="block">
      <div className="block-head">
        <div className="thumb">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt="" loading="lazy" />
          ) : (
            <span className="ph">no image</span>
          )}
        </div>

        <div className="block-id">
          <h2 className="p-title">{product.title}</h2>
          <div className="p-sub">
            {product.rating != null && (
              <span>
                <span className="star">★ {product.rating}</span>
                {product.ratingCount != null && ` (${product.ratingCount.toLocaleString("en-IN")})`}
              </span>
            )}
            <span>{rows.length} {rows.length === 1 ? "store" : "stores"} compared</span>
            {product.mrp > 0 && <span>MRP {inr(product.mrp)}</span>}
          </div>
          <div className="attrs">
            {product.attrs.map((a) => (
              <span className="attr" key={a}>{a}</span>
            ))}
          </div>
        </div>

        <div className="headline">
          <span className="lbl">Best effective price</span>
          <div className="big">{inr(winner.price.effective)}</div>
          {winner.price.effective !== winner.price.listed && (
            <div className="strike">{inr(winner.price.listed)} listed</div>
          )}
          {product.mrp > winner.price.effective && (
            <div className="save-pill">Save {inr(product.mrp - winner.price.effective)} vs MRP</div>
          )}
          <div className="at">at {winner.offer.storeName}</div>
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Store</th>
              <th scope="col" className="num">Listed</th>
              <th scope="col">Best bank offer</th>
              <th scope="col" className="num">Effective</th>
              <th scope="col">Delivery</th>
              <th scope="col" aria-label="Buy" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ offer, price }) => {
              const key = `${product.id}:${offer.storeSlug}`;
              const isWinner = offer === winner.offer;
              const open = expanded.has(key);

              return [
                <tr key={key} className={`${isWinner ? "best " : ""}${offer.inStock ? "" : "oos"}`}>
                  <td>
                    <div className="store-cell">
                      <span className="store-logo" style={{ background: offer.storeColor }}>
                        {offer.storeName[0]}
                      </span>
                      <span>
                        <span className="store-name">
                          {offer.storeName}
                          {isWinner && <span className="badge-best">Best</span>}
                        </span>
                        <span className="store-sub">
                          {offer.trustTier} · {offer.fetchedAgo} ago
                        </span>
                      </span>
                    </div>
                  </td>

                  <td className="listed num">{inr(price.listed)}</td>

                  <td className="offer-cell">
                    {price.applied ? (
                      <span className="offer-chip">
                        <span className="amt">−{inr(price.bankDiscount)}</span>
                        <span className="who">
                          {price.applied.issuer} {price.applied.instrument}
                          {price.applied.termsUrl && (
                            <a
                              className="terms"
                              href={price.applied.termsUrl}
                              target="_blank"
                              rel="nofollow noopener"
                            >
                              terms
                            </a>
                          )}
                        </span>
                      </span>
                    ) : (
                      <span className="offer-none">
                        {wallet.size ? "No offer on your cards" : "No bank offer"}
                      </span>
                    )}

                    {price.couponDiscount > 0 && (
                      <span className="deferred">+ coupon −{inr(price.couponDiscount)} (stacks)</span>
                    )}

                    {price.deferred && (
                      <span className="deferred">
                        {inr(price.deferred.amount)} {price.deferred.issuer} cashback
                        {price.deferred.creditWindow ? ` · ${price.deferred.creditWindow}` : ""} — not deducted
                      </span>
                    )}

                    {offer.noCostEmi && (
                      <span className="deferred">No-cost EMI {offer.noCostEmi}</span>
                    )}

                    {price.alternatives.length > 0 && (
                      <button className="offer-extra" type="button" onClick={() => toggle(key)}>
                        {open ? "Hide" : "Show"} {price.alternatives.length} other bank offer
                        {price.alternatives.length > 1 ? "s" : ""}
                      </button>
                    )}
                  </td>

                  <td className={`eff num${isWinner ? " win" : ""}`}>
                    {inr(price.effective)}
                    <span className="delta">
                      {isWinner ? "cheapest" : `+${inr(price.effective - winner.price.effective)}`}
                    </span>
                  </td>

                  <td className="delivery-cell">{offer.delivery}</td>

                  <td>
                    {offer.inStock ? (
                      <a className="buy" href={offer.url} target="_blank" rel="nofollow sponsored noopener">
                        Buy at {offer.storeName}
                      </a>
                    ) : (
                      <span className="offer-none">Out of stock</span>
                    )}
                  </td>
                </tr>,

                open && price.alternatives.length > 0 && (
                  <tr key={`${key}-detail`} className="detail-row">
                    <td colSpan={6}>
                      <div className="detail-box">
                        <h4>Other offers at {offer.storeName} — only one applies per transaction</h4>
                        <ul>
                          {price.alternatives.map((o) => (
                            <li key={o.id}>
                              <span className="v">−{inr(o.amount)}</span>
                              <span>
                                {o.issuer} {o.instrument}
                                {o.minTxn ? <span className="t"> min {inr(o.minTxn)}</span> : null}
                                {o.discountType === "PERCENT" && (
                                  <span className="t"> {o.value}% up to {inr(o.maxDiscount ?? 0)}</span>
                                )}
                                {o.termsUrl && (
                                  <a className="terms" href={o.termsUrl} target="_blank" rel="nofollow noopener">terms</a>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>

      <div className="block-foot">
        <span className="foot-note">Spread across stores: {inr(spread)}</span>
        <button className="link-btn" type="button" onClick={() => onTrack?.(product.id)}>
          Track this price
        </button>
      </div>
    </section>
  );
}

export default ComparisonBlock;
