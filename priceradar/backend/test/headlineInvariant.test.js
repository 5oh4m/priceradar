import test from "node:test";
import assert from "node:assert/strict";
import { selectRows } from "../../frontend/src/lib/compare.js";

const offer = (o) => ({
  storeSlug: o.s,
  storeName: o.s,
  storeColor: "#000",
  trustTier: "Marketplace",
  url: "#",
  listed: o.listed,
  inStock: o.inStock ?? true,
  delivery: o.delivery || "—",
  fetchedAgo: "now",
  bankOffers: o.bankOffers ?? [],
  coupon: o.coupon,
});

test("headline price equals the top visible row, even when the cheapest is out of stock", () => {
  const product = {
    id: "p",
    offers: [
      offer({ s: "a", listed: 100 }),
      offer({ s: "b", listed: 90, inStock: false }),
      offer({ s: "c", listed: 110 }),
    ],
  };
  const { rows, winner } = selectRows(product, { sortBy: "listed" });
  assert.equal(winner.price.effective, rows[0].price.effective);
  assert.equal(rows[0].offer.inStock, true);
});

test("exactly one instant bank offer is applied; cashback stays out of effective", () => {
  const product = {
    id: "p",
    offers: [
      offer({
        s: "croma",
        listed: 70000,
        bankOffers: [
          { id: 1, issuer: "HDFC Bank", instrument: "Credit Card EMI", discountType: "FLAT", value: 5000, minTxn: 50000, settlement: "INSTANT" },
          { id: 2, issuer: "ICICI Bank", instrument: "Credit Card", discountType: "FLAT", value: 4000, settlement: "INSTANT" },
          { id: 3, issuer: "SBI Card", instrument: "Credit Card", discountType: "FLAT", value: 3000, settlement: "CASHBACK", creditWindow: "credited in 90 days" },
        ],
      }),
    ],
  };
  const { rows } = selectRows(product);
  assert.equal(rows[0].price.bankDiscount, 5000);
  assert.equal(rows[0].price.effective, 65000);
  assert.equal(rows[0].price.deferred.amount, 3000);
  assert.equal(rows[0].price.alternatives.length, 1);
});

test("the wallet filter recomputes to offers the user can actually use", () => {
  const product = {
    id: "p",
    offers: [
      offer({
        s: "croma",
        listed: 70000,
        bankOffers: [
          { id: 1, issuer: "HDFC Bank", instrument: "Credit Card", discountType: "FLAT", value: 5000, settlement: "INSTANT" },
          { id: 2, issuer: "ICICI Bank", instrument: "Credit Card", discountType: "FLAT", value: 4000, settlement: "INSTANT" },
        ],
      }),
    ],
  };
  const onlyIcici = selectRows(product, { wallet: new Set(["ICICI Bank"]) });
  assert.equal(onlyIcici.rows[0].price.bankDiscount, 4000);
  assert.equal(onlyIcici.rows[0].price.applied.issuer, "ICICI Bank");
});
