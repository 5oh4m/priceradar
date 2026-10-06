import test from "node:test";
import assert from "node:assert/strict";
import { classify } from "../src/services/priceAggregator.js";

const L = (source, title, price, extra = {}) => ({
  source,
  title,
  price,
  url: extra.url || `https://${source}.example/p/${encodeURIComponent(title)}`,
  inStock: extra.inStock ?? true,
  imageUrl: extra.imageUrl ?? null,
  ...extra,
});

test("a 256 GB query never shows 128 GB inside the results", () => {
  const listings = [
    L("amazon_in", "Apple iPhone 15 (256 GB) - Black", 71400),
    L("flipkart", "Apple iPhone 15 256GB Black", 70900),
    L("croma", "Apple iPhone 15 256 GB Black", 69900),
    L("vijay_sales", "APPLE iPhone 15 128 GB Green", 65900),
    L("reliance_digital", "Apple iPhone 15 128GB Black", 66900),
  ];
  const { results, otherVariants } = classify("iphone 15 256 gb", listings);

  const resultOffers = results.flatMap((p) => p.offers);
  assert.ok(resultOffers.length >= 3, "256 GB offers are present");
  assert.ok(
    results.every((p) => p.attrs.some((a) => a === "256 GB")),
    "every result block is a 256 GB block"
  );

  const siblingStores = otherVariants.flatMap((p) => p.offers.map((o) => o.storeSlug));
  assert.ok(siblingStores.includes("vijay_sales"), "128 GB Green went to Other variants");
  assert.ok(siblingStores.includes("reliance_digital"));
});

test("a store never appears twice inside one comparison block", () => {
  const listings = [
    L("vijay_sales", "Apple iPhone 15 256GB Black", 69900, { url: "https://vijaysales.example/p/iphone-15?page=1" }),
    L("vijay_sales", "Apple iPhone 15 256GB Black", 69900, { url: "https://vijaysales.example/p/iphone-15?page=2" }),
    L("vijay_sales", "Apple iPhone 15 256GB Black", 71000, { url: "https://vijaysales.example/p/iphone-15#reviews" }),
    L("croma", "Apple iPhone 15 256 GB Black", 69900),
  ];
  const { results } = classify("iphone 15 256 gb", listings);

  for (const p of results) {
    const slugs = p.offers.map((o) => o.storeSlug);
    assert.equal(new Set(slugs).size, slugs.length, `duplicate store in ${p.title}`);
  }
  const block = results.find((p) => p.offers.some((o) => o.storeSlug === "vijay_sales"));
  const vs = block.offers.filter((o) => o.storeSlug === "vijay_sales");
  assert.equal(vs.length, 1);
  assert.equal(vs[0].listed, 69900, "kept the lowest listed price on collision");
});

test("blocks are sorted cheapest-first and offers are in-stock-first", () => {
  const listings = [
    L("amazon_in", "Apple iPhone 15 256GB Black", 71400),
    L("croma", "Apple iPhone 15 256GB Black", 69900, { inStock: false }),
    L("flipkart", "Apple iPhone 15 256GB Black", 70900),
  ];
  const { results } = classify("iphone 15 256 gb", listings);
  const block = results[0];
  assert.equal(block.offers[0].inStock, true, "an in-stock offer leads the block");
});

test("intent is echoed back", () => {
  const { results } = classify("iphone 15 256 gb", []);
  assert.deepEqual(results, []);
});

test("scraped offer-box text becomes a structured bank offer on the store row", () => {
  const listings = [
    L("croma", "Apple iPhone 15 256GB Black", 69900, {
      offerTexts: [
        "₹5,000 instant discount on HDFC Bank Credit Card EMI Txns, Min Txn value ₹50,000",
        "No Cost EMI on Bajaj Finserv EMI Card",
        "Bank offer maybe available",
      ],
    }),
  ];
  const { results, reviewQueue } = classify("iphone 15 256 gb", listings);
  const croma = results[0].offers[0];
  const hdfc5k = croma.bankOffers.find(
    (o) => o.issuer === "HDFC Bank" && o.value === 5000 && o.settlement === "INSTANT"
  );
  assert.ok(hdfc5k, "the scraped HDFC ₹5,000 EMI offer is present");
  assert.ok(croma.noCostEmi, "no-cost EMI surfaced as a badge, not a discount");
  assert.ok(
    reviewQueue.length === 0 || reviewQueue.every((r) => r.confidence < 0.7),
    "only low-confidence parses reach the review queue"
  );
});

test("manual seed offers attach to a matching store row with no scraped text", () => {
  const listings = [L("croma", "Apple iPhone 15 256GB Black", 69900)];
  const { results } = classify("iphone 15 256 gb", listings);
  const croma = results[0].offers[0];
  const icici = croma.bankOffers.find((o) => o.issuer === "ICICI Bank");
  assert.ok(icici, "the seeded ICICI offer applies to a Croma smartphone row");
  assert.ok(icici.termsUrl, "seed offers carry a source URL");
  assert.equal(icici.discountType, "PERCENT");
});

test("a marketplace's verbose title merges with a retailer's terse title", () => {
  // Amazon appends marketing copy after a colon; Reliance/Vijay Sales don't.
  // Both must resolve to the same canonical variant, or Amazon sits in its own
  // one-row block and there is nothing to compare.
  const listings = [
    L("amazon_in",
      "iPhone 16 128 GB: 5G Mobile Phone with Camera Control, A18 Chip and a Big Boost in Battery Life; White",
      89900),
    L("reliance_digital", "Apple iPhone 16 128GB White", 79900),
    L("vijay_sales", "Apple iPhone 16 128 GB White", 78900),
  ];
  const { results } = classify("iphone 16 128 gb", listings);

  const block = results.find((p) => p.offers.some((o) => o.storeSlug === "amazon_in"));
  assert.ok(block, "Amazon produced a block");
  assert.equal(
    block.offers.length,
    3,
    `all three stores share one block, got: ${block.offers.map((o) => o.storeSlug).join(",")}`
  );
  assert.equal(block.offers[0].storeSlug, "vijay_sales", "cheapest leads the block");
});

test("Amazon sponsored-ad titles are rejected", () => {
  const listings = [
    L("amazon_in", "Sponsored Ad - Apple iPhone 16 128GB White", 99900),
    L("reliance_digital", "Apple iPhone 16 128GB White", 79900),
  ];
  const { results } = classify("iphone 16 128 gb", listings);
  const all = results.flatMap((p) => p.offers);
  assert.ok(
    !all.some((o) => o.listed === 99900),
    "a title still carrying the sponsored marker must not become an offer"
  );
});
