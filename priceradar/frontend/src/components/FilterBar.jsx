/**
 * Sticky sort + filter bar.
 *
 *  - sort by effective price / listed price / delivery speed
 *  - in-stock only
 *  - "Your cards": tick the issuers you hold and every effective price in the
 *    page recomputes to what you can actually get.
 */

const SORTS = [
  ["effective", "Effective price"],
  ["listed", "Listed price"],
  ["delivery", "Delivery speed"],
];

export const ISSUERS = ["HDFC Bank", "ICICI Bank", "SBI Card", "Axis Bank", "Amex", "OneCard"];

export default function FilterBar({
  sortBy,
  onSort,
  inStockOnly,
  onInStockOnly,
  wallet,
  onToggleIssuer,
  resultCount,
}) {
  return (
    <div className="filter-bar">
      <div className="fb-row">
        <label className="fb-group">
          <span className="fb-label">Sort</span>
          <select value={sortBy} onChange={(e) => onSort(e.target.value)}>
            {SORTS.map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </label>

        <label className="fb-group fb-check">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => onInStockOnly(e.target.checked)}
          />
          <span>In stock only</span>
        </label>

        {resultCount != null && <span className="fb-count">{resultCount} products</span>}
      </div>

      <div className="fb-row fb-wallet">
        <span className="fb-label">Your cards</span>
        <div className="fb-chips">
          {ISSUERS.map((issuer) => {
            const on = wallet.has(issuer);
            return (
              <button
                key={issuer}
                type="button"
                className={`fb-chip${on ? " on" : ""}`}
                aria-pressed={on}
                onClick={() => onToggleIssuer(issuer)}
              >
                {issuer}
              </button>
            );
          })}
          {wallet.size > 0 && (
            <button type="button" className="fb-clear" onClick={() => onToggleIssuer(null)}>
              Clear
            </button>
          )}
        </div>
        <span className="fb-hint">
          {wallet.size === 0
            ? "Showing the best offer on any card"
            : "Effective prices show what your cards can get"}
        </span>
      </div>
    </div>
  );
}
