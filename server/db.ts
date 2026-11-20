import pg from 'pg'

// numeric -> number, date -> 'YYYY-MM-DD' (không đổi múi giờ)
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)))
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)))
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v)

export function createPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('Thiếu DATABASE_URL (vd postgres://user:pass@localhost:5433/xiaoxin)')
  }
  return new pg.Pool({ connectionString, max: 10 })
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS app_meta (
  id smallint PRIMARY KEY CHECK (id = 1),
  revision bigint NOT NULL DEFAULT 0,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  seq bigint NOT NULL,
  sku text,
  name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit text,
  unit_price numeric,
  category_id text,
  sale_prices jsonb,
  combo_items jsonb,
  image text,
  delivery_date text,
  delivery_slip_image text,
  signed_slip_image text,
  note text,
  created_at timestamptz,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS products_seq_idx ON products (seq);
CREATE INDEX IF NOT EXISTS products_sku_idx ON products (lower(sku));

CREATE TABLE IF NOT EXISTS stock_movements (
  id text PRIMARY KEY,
  seq bigint NOT NULL,
  code text NOT NULL,
  product_id text NOT NULL,
  product_name text NOT NULL,
  sku text,
  type text NOT NULL,
  doc_type text,
  doc_id text,
  reason text NOT NULL,
  quantity numeric NOT NULL,
  before_qty numeric NOT NULL,
  after_qty numeric NOT NULL,
  delta numeric,
  unit_price numeric,
  note text,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS stock_movements_seq_idx ON stock_movements (seq);
CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON stock_movements (product_id);
CREATE INDEX IF NOT EXISTS stock_movements_doc_idx ON stock_movements (doc_id);

CREATE TABLE IF NOT EXISTS stock_documents (
  id text PRIMARY KEY,
  seq bigint NOT NULL,
  code text NOT NULL,
  type text NOT NULL,
  doc_date text NOT NULL,
  created_at timestamptz NOT NULL,
  reason text NOT NULL,
  note text,
  vat_rate numeric,
  image text
);
CREATE INDEX IF NOT EXISTS stock_documents_seq_idx ON stock_documents (seq);

CREATE TABLE IF NOT EXISTS stock_document_lines (
  doc_id text NOT NULL REFERENCES stock_documents (id) ON DELETE CASCADE,
  position integer NOT NULL,
  id text NOT NULL,
  movement_id text NOT NULL,
  product_id text NOT NULL,
  sku text,
  name text NOT NULL,
  unit text,
  quantity numeric NOT NULL,
  unit_price numeric,
  before_qty numeric NOT NULL,
  after_qty numeric NOT NULL,
  via_combo text,
  PRIMARY KEY (doc_id, position)
);
CREATE INDEX IF NOT EXISTS stock_document_lines_product_idx ON stock_document_lines (product_id);

CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY,
  position integer NOT NULL,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS platforms (
  id text PRIMARY KEY,
  position integer NOT NULL,
  name text NOT NULL
);
`

export async function initSchema(pool: pg.Pool): Promise<void> {
  await pool.query(SCHEMA)
}
