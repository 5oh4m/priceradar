import React, { useMemo, useState } from "react";
import SearchBar from "./components/SearchBar.jsx";
import FilterBar from "./components/FilterBar.jsx";
import Skeletons from "./components/Skeletons.jsx";
import { ComparisonBlock } from "./components/ComparisonBlock.jsx";

const SUGGESTIONS = ["iPhone 15 256GB", "Samsung Galaxy S24 256GB", "OnePlus 12R 5G", "Sony WH-1000XM5"];

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [preset, setPreset] = useState(null);

  const [sortBy, setSortBy] = useState("effective");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [wallet, setWallet] = useState(() => new Set());
  const [tracked, setTracked] = useState(null);

  const results = data?.results ?? [];
  const otherVariants = data?.otherVariants ?? [];
  const storeErrors = data?.storeErrors ?? [];

  const toggleIssuer = (issuer) => {
    setWallet((prev) => {
      if (issuer === null) return new Set();
      const next = new Set(prev);
      if (next.has(issuer)) next.delete(issuer);
      else next.add(issuer);
      return next;
    });
  };

  const blockProps = { wallet, sortBy, inStockOnly, onTrack: onTrack };
  function onTrack(id) {
    const p = [...results, ...otherVariants].find((x) => x.id === id);
    setTracked(p ? p.title : "this product");
    setTimeout(() => setTracked(null), 4000);
  }

  const freshness = useMemo(() => {
    if (!data?.generatedAt) return null;
    const d = new Date(data.generatedAt);
    return Number.isNaN(+d) ? null : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }, [data]);

  return (
    <div className="app">
      <header className="header">
        <h1>PriceRadar</h1>
        <p className="tagline">
          One product, one comparison. Effective price after the bank offer your card can actually use.
        </p>
      </header>

      <SearchBar
        preset={preset}
        onResults={(d) => {
          setData(d);
          setSearched(true);
        }}
        onLoading={setLoading}
        onError={setError}
      />

      {(loading || searched) && (
        <FilterBar
          sortBy={sortBy}
          onSort={setSortBy}
          inStockOnly={inStockOnly}
          onInStockOnly={setInStockOnly}
          wallet={wallet}
          onToggleIssuer={toggleIssuer}
          resultCount={loading ? null : results.length}
        />
      )}

      {tracked && (
        <div className="toast">Tracking “{tracked}”. We’ll email you on a price drop. (demo)</div>
      )}

      {error && <p className="status error">{error}</p>}

      {storeErrors.length > 0 && (
        <div className="store-errors">
          {storeErrors.map((s) => (
            <span key={s.store} className="store-error-chip">
              {labelFor(s.store)} prices temporarily unavailable
            </span>
          ))}
        </div>
      )}

      {loading && <Skeletons count={3} />}

      {!loading && searched && results.length === 0 && !error && (
        <div className="empty">
          <p>No exact matches for that search.</p>
          <p className="empty-sub">Try one of these:</p>
          <div className="empty-chips">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="empty-chip" onClick={() => setPreset(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          {freshness && <p className="freshness">Prices as of {freshness}</p>}
          <div className="block-stack">
            {results.map((product) => (
              <ComparisonBlock key={product.id} product={product} {...blockProps} />
            ))}
          </div>
        </>
      )}

      {!loading && otherVariants.length > 0 && (
        <section className="other-variants">
          <h3>Other variants</h3>
          <p className="ov-sub">Same model, a different storage / colour / connectivity than you searched for.</p>
          <div className="block-stack">
            {otherVariants.map((product) => (
              <ComparisonBlock key={product.id} product={product} {...blockProps} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function labelFor(slug) {
  return (
    {
      amazon_in: "Amazon.in",
      flipkart: "Flipkart",
      croma: "Croma",
      reliance_digital: "Reliance Digital",
      vijay_sales: "Vijay Sales",
    }[slug] || slug
  );
}
