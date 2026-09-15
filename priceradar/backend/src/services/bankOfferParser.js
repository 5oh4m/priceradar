/**
 * Rules-first extractor for store "offer box" bullet text.
 *
 *   "₹4,000 instant discount on HDFC Bank Credit Card EMI Txns,
 *    Min Txn value ₹50,000 · TCA"
 *      -> { issuer: "HDFC Bank", instrument: "Credit Card EMI",
 *           discountType: "FLAT", value: 4000, minTxn: 50000,
 *           settlement: "INSTANT", confidence: 0.85 }
 *
 * Regex only — no model call. Anything that parses below `confidence 0.7`
 * is routed to a review queue by the aggregator instead of being shown.
 * A wrong offer that inflates savings is worse than no offer at all.
 */

const ISSUERS = [
  ["hdfc", "HDFC Bank"],
  ["icici", "ICICI Bank"],
  ["sbi", "SBI Card"],
  ["state bank of india", "SBI Card"],
  ["axis", "Axis Bank"],
  ["kotak", "Kotak Bank"],
  ["american express", "Amex"],
  ["amex", "Amex"],
  ["onecard", "OneCard"],
  ["one card", "OneCard"],
  ["au small finance", "AU Bank"],
  ["au bank", "AU Bank"],
  ["idfc", "IDFC First Bank"],
  ["yes bank", "Yes Bank"],
  ["federal bank", "Federal Bank"],
  ["rbl", "RBL Bank"],
  ["bank of baroda", "Bank of Baroda"],
  ["bob ", "Bank of Baroda"],
  ["standard chartered", "Standard Chartered"],
  ["citi", "Citi"],
  ["hsbc", "HSBC"],
  ["punjab national", "PNB"],
];

const clamp = (n) => Math.max(0, Math.min(1, Number(n.toFixed(2))));

function num(x) {
  return Math.round(parseFloat(String(x).replace(/[^\d.]/g, "")));
}

/**
 * @param {string} text  raw bullet text
 * @param {string} [storeSlug]
 * @returns {object|null} parsed offer, or null when nothing usable was found
 */
export function parseOfferBullet(text, storeSlug) {
  if (!text || typeof text !== "string") return null;

  const t = text
    .toLowerCase()
    .replace(/₹|rs\.?|inr/g, "₹")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length < 8) return null;

  let confidence = 0.4;

  // ── issuer ───────────────────────────────────────────────────────────────
  let issuer = null;
  for (const [needle, name] of ISSUERS) {
    if (t.includes(needle)) {
      issuer = name;
      confidence += 0.2;
      break;
    }
  }

  // ── instrument ───────────────────────────────────────────────────────────
  let instrument;
  if (/credit cards? emi|cc emi|credit emi/.test(t)) instrument = "Credit Card EMI";
  else if (/debit cards? emi|dc emi|debit emi/.test(t)) instrument = "Debit Card EMI";
  else if (/credit cards?|\bcc\b/.test(t)) instrument = "Credit Card";
  else if (/debit cards?|\bdc\b/.test(t)) instrument = "Debit Card";
  else if (/\bupi\b/.test(t)) instrument = "UPI";
  else if (/net ?banking/.test(t)) instrument = "Net Banking";
  else if (/wallet/.test(t)) instrument = "Wallet";
  else if (/\bemi\b/.test(t)) instrument = "EMI";
  else if (/cards?\b/.test(t)) instrument = "Credit Card"; // issuer + "card" -> safe default
  else {
    instrument = "Credit Card";
    confidence -= 0.1;
  }

  // ── flags we deliberately do not price as a discount ──────────────────────
  const isNoCostEmi = /no ?cost emi|no-cost emi/.test(t);
  const isExchange = /exchange/.test(t) && !/no exchange/.test(t);
  const isCashback = /cashback/.test(t);

  if (isNoCostEmi) confidence += 0.3; // explicit, non-priced badge

  // ── value / type ─────────────────────────────────────────────────────────
  const pct = t.match(/(\d+(?:\.\d+)?)\s*%/);
  const flat = t.match(/₹\s*(\d+(?:\.\d+)?)/);
  const upto = t.match(/up ?to ₹\s*(\d+(?:\.\d+)?)/);
  const minTxnM =
    t.match(
      /min(?:imum)?(?:\s+txn|\s+transaction|\s+purchase|\s+order)?(?:\s+value)?\s*(?:of\s*)?₹\s*(\d+(?:\.\d+)?)/
    ) || t.match(/₹\s*(\d+(?:\.\d+)?)\s*(?:and above|& above|or more|\+)/);

  let discountType = null;
  let value = null;
  if (pct) {
    discountType = "PERCENT";
    value = num(pct[1]);
    confidence += 0.15;
  } else if (flat) {
    discountType = "FLAT";
    value = num(flat[1]);
    confidence += 0.2;
  }

  const maxDiscount = upto ? num(upto[1]) : undefined;
  const minTxn = minTxnM ? num(minTxnM[1]) : undefined;

  // ── settlement ───────────────────────────────────────────────────────────
  let settlement = "INSTANT";
  if (isCashback && !/instant/.test(t)) settlement = "CASHBACK";
  const cw = t.match(/credited?(?:\s+within|\s+in)?\s+(\d+\s+(?:days|working days|hours|weeks|months))/);
  const creditWindow = cw ? `credited in ${cw[1]}` : undefined;

  if (isNoCostEmi && discountType === null) {
    return {
      kind: "NO_COST_EMI",
      issuer,
      instrument: instrument === "Credit Card" ? "EMI" : instrument,
      discountType: "NO_COST_EMI",
      value: 0,
      settlement: "INSTANT",
      confidence: clamp(confidence),
      termsText: text,
      storeSlug,
    };
  }
  if (isExchange && discountType === null) {
    return {
      kind: "EXCHANGE",
      issuer,
      instrument: "Exchange",
      discountType: "EXCHANGE",
      value: value || 0,
      settlement: "INSTANT",
      confidence: clamp(confidence - 0.1),
      termsText: text,
      storeSlug,
    };
  }

  if (discountType === null || value === null || value <= 0) return null;

  if (discountType === "PERCENT" && maxDiscount === undefined) confidence -= 0.1;
  if (minTxn === undefined) confidence -= 0.05;
  if (issuer === null) confidence -= 0.1;

  return {
    kind: settlement === "CASHBACK" ? "CASHBACK" : discountType,
    issuer,
    instrument,
    discountType,
    value,
    maxDiscount,
    minTxn,
    settlement,
    creditWindow,
    confidence: clamp(confidence),
    termsText: text,
    storeSlug,
  };
}

let _dtoId = 1;

/** Map a parsed offer to the BankOffer DTO the frontend engine consumes. */
export function toBankOfferDto(p) {
  return {
    id: _dtoId++,
    issuer: p.issuer || "Bank offer",
    instrument: p.instrument,
    discountType: p.discountType === "PERCENT" ? "PERCENT" : "FLAT",
    value: p.value,
    maxDiscount: p.maxDiscount,
    minTxn: p.minTxn,
    settlement: p.settlement === "CASHBACK" ? "CASHBACK" : "INSTANT",
    creditWindow: p.creditWindow,
    termsUrl: p.sourceUrl,
  };
}

export const REVIEW_THRESHOLD = 0.7;
