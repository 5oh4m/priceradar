-- Run this once against your Postgres database to set up tables.

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  canonical_title TEXT NOT NULL,
  brand TEXT,
  model_number TEXT,
  category TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- One row per (product, source website) listing
CREATE TABLE IF NOT EXISTS listings (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  source TEXT NOT NULL,              -- e.g. 'amazon_in', 'flipkart'
  source_product_id TEXT,            -- site's own SKU/ASIN if known
  url TEXT NOT NULL,
  title_on_site TEXT,
  is_trusted BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source, url)
);

-- Price history — keep every scrape so you can show trends later
CREATE TABLE IF NOT EXISTS price_snapshots (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER REFERENCES listings(id) ON DELETE CASCADE,
  price NUMERIC(12,2) NOT NULL,
  in_stock BOOLEAN DEFAULT true,
  scraped_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_listing_time
  ON price_snapshots (listing_id, scraped_at DESC);

-- Cached AI-generated review summary per product (regenerate weekly, not per-request)
CREATE TABLE IF NOT EXISTS review_summaries (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE UNIQUE,
  summary_json JSONB NOT NULL,   -- { pros: [], cons: [], sentiment_score, fake_review_flag, sample_size }
  generated_at TIMESTAMPTZ DEFAULT now()
);

-- Cached AI-generated "better alternatives" per product
CREATE TABLE IF NOT EXISTS suggestions (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE UNIQUE,
  suggestions_json JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now()
);
