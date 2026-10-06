import React, { useEffect, useRef, useState } from "react";
import { searchProducts } from "../api/client.js";

export default function SearchBar({ onResults, onLoading, onError, preset }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const lastPreset = useRef(null);

  async function run(term) {
    const q = term.trim();
    if (!q) return;
    onError(null);
    onLoading(true);
    setBusy(true);
    try {
      const data = await searchProducts(q);
      onResults(data);
    } catch (err) {
      onError(err.response?.data?.error || "Search failed. Is the backend running?");
    } finally {
      onLoading(false);
      setBusy(false);
    }
  }

  useEffect(() => {
    if (preset && preset !== lastPreset.current) {
      lastPreset.current = preset;
      setQuery(preset);
      run(preset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  return (
    <form
      className="search-bar"
      onSubmit={(e) => {
        e.preventDefault();
        run(query);
      }}
    >
      <input
        type="text"
        placeholder="Search for a product e.g. iPhone 15 256GB"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button type="submit" data-busy={busy}>
        {busy ? "Searching" : "Search"}
      </button>
    </form>
  );
}
