import test from "node:test";
import assert from "node:assert/strict";
import { parseOfferBullet, REVIEW_THRESHOLD } from "../src/services/bankOfferParser.js";

test("parses the canonical HDFC EMI bullet", () => {
  const o = parseOfferBullet(
    "₹4,000 instant discount on HDFC Bank Credit Card EMI Txns, Min Txn value ₹50,000 · TCA"
  );
  assert.equal(o.issuer, "HDFC Bank");
  assert.equal(o.instrument, "Credit Card EMI");
  assert.equal(o.discountType, "FLAT");
  assert.equal(o.value, 4000);
  assert.equal(o.minTxn, 50000);
  assert.equal(o.settlement, "INSTANT");
  assert.ok(o.confidence >= REVIEW_THRESHOLD, `confidence ${o.confidence}`);
});

test("parses a percent offer with a cap and a minimum", () => {
  const o = parseOfferBullet(
    "10% instant discount up to ₹1,500 on ICICI Bank Credit Cards, min ₹5,000"
  );
  assert.equal(o.issuer, "ICICI Bank");
  assert.equal(o.discountType, "PERCENT");
  assert.equal(o.value, 10);
  assert.equal(o.maxDiscount, 1500);
  assert.equal(o.minTxn, 5000);
  assert.ok(o.confidence >= REVIEW_THRESHOLD);
});

test("cashback is flagged as deferred settlement", () => {
  const o = parseOfferBullet(
    "₹2,000 cashback on Amazon Pay ICICI Bank Credit Card, credited within 90 days"
  );
  assert.equal(o.settlement, "CASHBACK");
  assert.match(o.creditWindow, /90 days/);
});

test("no-cost EMI is not priced as a discount", () => {
  const o = parseOfferBullet("No Cost EMI on Bajaj Finserv EMI Card");
  assert.equal(o.kind, "NO_COST_EMI");
  assert.equal(o.value, 0);
});

test("a vague bank line lands below the review threshold", () => {
  const o = parseOfferBullet("Get ₹2000 off with bank cards");
  assert.ok(o === null || o.confidence < REVIEW_THRESHOLD, JSON.stringify(o));
});

test("garbage returns null", () => {
  assert.equal(parseOfferBullet("Free shipping"), null);
  assert.equal(parseOfferBullet(""), null);
});
