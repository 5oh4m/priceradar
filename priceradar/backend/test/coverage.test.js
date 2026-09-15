import test from "node:test";
import assert from "node:assert/strict";
import { classify } from "../src/services/priceAggregator.js";
import { storeMeta } from "../src/services/storeMeta.js";
import { scrapers } from "../src/scrapers/index.js";
import { isOpen, recordFailure, recordSuccess, breakerStatus } from "../src/scrapers/circuitBreaker.js";

test("every registered scraper has store metadata", () => {
  for (const slug of Object.keys(scrapers)) {
    const m = storeMeta(slug);
    assert.ok(m.name && m.name !== slug, `${slug} needs a display name in storeMeta.js`);
    assert.ok([1, 2, 3].includes(m.trustRank), `${slug} needs a trustRank`);
  }
});

test("a newly added store flows through classify with no core changes", () => {
  const listings = [
    { source: "tata_cliq", title: "Apple iPhone 15 256GB Black", price: 70900,
      url: "https://tatacliq.example/p-mp0001", inStock: true },
    { source: "poorvika", title: "Apple iPhone 15 256GB Black", price: 69499,
      url: "https://poorvika.example/apple-iphone-15", inStock: true },
    { source: "sangeetha", title: "Apple iPhone 15 (256 GB) Black", price: 69990,
      url: "https://sangeethamobiles.example/product/apple-iphone-15", inStock: true },
  ];
  const { results } = classify("iphone 15 256 gb", listings);
  const block = results[0];
  const names = block.offers.map((o) => o.storeName).sort();
  assert.deepEqual(names, ["Poorvika", "Sangeetha Mobiles", "Tata CLiQ"]);

  // seed bank offers reach the new stores too
  const poorvika = block.offers.find((o) => o.storeSlug === "poorvika");
  assert.ok(poorvika.bankOffers.some((o) => o.issuer === "ICICI Bank"),
    "seeded ICICI offer applies to a Poorvika smartphone row");
});

test("circuit breaker opens after consecutive failures and resets on success", () => {
  const slug = "__test_store__";
  assert.equal(isOpen(slug), false);
  for (let i = 0; i < 5; i++) recordFailure(slug);
  assert.equal(isOpen(slug), true, "5 consecutive failures opens the breaker");
  recordSuccess(slug);
  assert.equal(isOpen(slug), false, "a success closes it");
  assert.ok(Array.isArray(breakerStatus()));
});
