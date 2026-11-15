-- Product catalog additions. Safe to apply to existing databases.
ALTER TABLE products ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(64);
CREATE INDEX IF NOT EXISTS products_active_id_idx ON products(active, id);
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique_idx
  ON products(barcode)
  WHERE barcode IS NOT NULL;
