/**
 * Manual / admin bank-offer overrides.
 *
 * Workplan §3 lists this as a first-class offer source ("Manual overrides —
 * Admin table, highest precedence"). It exists because scraper-side offer-box
 * extraction is not wired yet: without it the effective-price engine and the
 * "Your cards" filter have no data to work with.
 *
 * Each entry's `text` is run through services/bankOfferParser.js exactly like a
 * scraped bullet, so the same confidence gate and stacking rules apply. Keep
 * entries store-wide and conservative, always attach `sourceUrl`, and set
 * `validTo` — an expired entry is skipped. These are "as advertised"; verify
 * against the source before trusting a number.
 *
 * Matching: an entry applies to a store row when
 *   store   ∈ stores      (or stores is "*")
 *   brand   ∈ brands       (or brands is "*")
 *   category ∈ categories  (or categories is "*")
 * and today is on/before validTo.
 */

export const SEED_BANK_OFFERS = [
  {
    id: "icici-cc-electronics",
    stores: ["croma", "reliance_digital", "vijay_sales", "tata_cliq", "sangeetha", "poorvika"],
    brands: "*",
    categories: ["smartphone", "tablet", "laptop", "audio", "tv", "wearable"],
    text: "10% instant discount up to ₹3,000 on ICICI Bank Credit Cards and Credit Card EMI transactions, minimum purchase value ₹10,000",
    sourceUrl: "https://www.icicibank.com/offers",
    validTo: "2026-12-31",
  },
  {
    id: "hdfc-cc-emi-highvalue",
    stores: ["croma", "reliance_digital", "amazon_in", "flipkart", "tata_cliq"],
    brands: "*",
    categories: ["smartphone", "laptop", "tv"],
    text: "₹3,000 instant discount on HDFC Bank Credit Card EMI transactions, minimum transaction value ₹50,000",
    sourceUrl: "https://offers.smartbuy.hdfcbank.com/",
    validTo: "2026-12-31",
  },
  {
    id: "hdfc-cc-mid",
    stores: ["croma", "reliance_digital", "vijay_sales", "tata_cliq", "sangeetha", "poorvika"],
    brands: "*",
    categories: "*",
    text: "₹1,500 instant discount on HDFC Bank Credit Card transactions, minimum purchase ₹15,000",
    sourceUrl: "https://offers.smartbuy.hdfcbank.com/",
    validTo: "2026-12-31",
  },
  {
    id: "sbi-cc-emi-flipkart-amazon",
    stores: ["flipkart", "amazon_in", "jiomart"],
    brands: "*",
    categories: ["smartphone", "laptop"],
    text: "5% instant discount up to ₹2,500 on SBI Bank Credit Card EMI transactions, minimum purchase ₹20,000",
    sourceUrl: "https://www.sbicard.com/en/personal/offers.page",
    validTo: "2026-12-31",
  },
  {
    id: "axis-cc-electronics",
    stores: ["croma", "vijay_sales", "tata_cliq"],
    brands: "*",
    categories: ["smartphone", "laptop", "tv"],
    text: "₹2,000 instant discount on Axis Bank Credit Card, minimum purchase value ₹40,000",
    sourceUrl: "https://www.axisbank.com/grab-deals",
    validTo: "2026-12-31",
  },
  {
    id: "kotak-cc-emi-vijaysales",
    stores: ["vijay_sales"],
    brands: "*",
    categories: "*",
    text: "₹1,500 instant discount on Kotak Bank Credit Card EMI, minimum transaction ₹25,000",
    sourceUrl: "https://www.kotak.com/en/offers.html",
    validTo: "2026-12-31",
  },
  {
    id: "bajaj-nocost-emi-phones",
    stores: ["sangeetha", "poorvika", "vijay_sales", "reliance_digital"],
    brands: "*",
    categories: ["smartphone", "laptop", "tablet"],
    text: "No Cost EMI on Bajaj Finserv Insta EMI Card, tenures 3 / 6 / 9 months",
    sourceUrl: "https://www.bajajfinserv.in/emi-store",
    validTo: "2026-12-31",
  },
  {
    id: "amazonpay-icici-cashback",
    stores: ["amazon_in"],
    brands: "*",
    categories: "*",
    text: "5% cashback up to ₹2,000 on Amazon Pay ICICI Bank Credit Card, credited within 60 days",
    sourceUrl: "https://www.amazon.in/l/21925549031",
    validTo: "2026-12-31",
  },
];
