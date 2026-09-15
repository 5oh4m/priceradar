-- PriceRadar canonical schema (workplan §2).
--
-- The running build still serves search from live scrapes and does not persist
-- to these tables yet. This file is the migration target for P0 persistence:
-- the canonical `product` layer is what lets the API return a stable id the
-- first time a variant is searched, and `offer.UNIQUE (store_id, store_sku)`
-- is the database-level guard behind the one-row-per-store rule the aggregator
-- already enforces in memory (see services/priceAggregator.js).

CREATE TABLE IF NOT EXISTS product (
  id          BIGSERIAL PRIMARY KEY,
  brand       TEXT NOT NULL,
  model       TEXT NOT NULL,
  category    TEXT NOT NULL,
  attrs       JSONB NOT NULL,              -- {"storage_gb":256,"ram_gb":6,"color":"black"}
  variant_key TEXT NOT NULL,               -- brand|model|storage|color|...  (see variantKey.js)
  gtin        TEXT,
  image_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (variant_key)
);

CREATE TABLE IF NOT EXISTS store (
  id            SMALLSERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  logo_url      TEXT,
  trust_tier    SMALLINT NOT NULL DEFAULT 3,  -- 1 authorised, 2 marketplace, 3 other
  affiliate_tpl TEXT
);

CREATE TABLE IF NOT EXISTS offer (
  id            BIGSERIAL PRIMARY KEY,
  product_id    BIGINT REFERENCES product(id) ON DELETE CASCADE,
  store_id      SMALLINT REFERENCES store(id) ON DELETE CASCADE,
  store_sku     TEXT,
  url           TEXT NOT NULL,
  title_raw     TEXT,
  price         INTEGER NOT NULL,          -- rupees as INTEGER
  mrp           INTEGER,
  in_stock      BOOLEAN NOT NULL DEFAULT TRUE,
  seller_name   TEXT,
  rating        NUMERIC(2,1),
  rating_count  INTEGER,
  delivery_days SMALLINT,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, store_sku)             -- kills duplicate store rows in a block
);

CREATE INDEX IF NOT EXISTS idx_offer_product ON offer (product_id);

CREATE TABLE IF NOT EXISTS price_point (
  offer_id    BIGINT REFERENCES offer(id) ON DELETE CASCADE,
  price       INTEGER NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (offer_id, observed_at)
);

CREATE TABLE IF NOT EXISTS bank_offer (
  id            BIGSERIAL PRIMARY KEY,
  store_id      SMALLINT REFERENCES store(id) ON DELETE CASCADE,
  issuer        TEXT NOT NULL,
  instrument    TEXT NOT NULL,            -- CREDIT_CARD | CREDIT_CARD_EMI | DEBIT_CARD | UPI | ...
  discount_type TEXT NOT NULL,            -- FLAT | PERCENT | CASHBACK | NO_COST_EMI | EXCHANGE
  value         INTEGER NOT NULL,
  max_discount  INTEGER,
  min_txn       INTEGER,
  tenure_months SMALLINT[],
  scope         TEXT NOT NULL DEFAULT 'STORE_WIDE',  -- STORE_WIDE | CATEGORY | PRODUCT_LIST
  scope_values  TEXT[],
  coupon_code   TEXT,
  settlement    TEXT NOT NULL,            -- INSTANT | CASHBACK  (drives whether it hits `effective`)
  valid_from    DATE,
  valid_to      DATE,
  terms_text    TEXT,
  source_url    TEXT,
  confidence    NUMERIC(3,2),             -- parser confidence 0-1; < 0.70 -> review queue
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_offer_store ON bank_offer (store_id);

-- Seed the stores the scrapers already cover.
INSERT INTO store (slug, name, trust_tier) VALUES
  ('amazon_in',        'Amazon.in',        2),
  ('flipkart',         'Flipkart',         2),
  ('croma',            'Croma',            1),
  ('reliance_digital', 'Reliance Digital', 1),
  ('vijay_sales',      'Vijay Sales',      1)
ON CONFLICT (slug) DO NOTHING;
