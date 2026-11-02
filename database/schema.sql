-- ============================================
-- Vape Shop E-Commerce - Database Schema
-- Run this script in PostgreSQL (psql or pgAdmin)
-- ============================================

-- Create database first (run separately if needed):
-- CREATE DATABASE vape_shop;

-- Connect to vape_shop, then run the rest:

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'customer'
);

-- Existing databases created before roles were added
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'customer';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('customer', 'store-owner', 'delivery-person'));

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50),
  price NUMERIC(10, 2) NOT NULL,
  stock INTEGER DEFAULT 0,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  total NUMERIC(10, 2) NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'online',
  delivery_address TEXT,
  delivery_phone VARCHAR(30),
  delivery_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  delivery_person VARCHAR(100),
  delivery_person_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'online';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_phone VARCHAR(30);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(30) NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_person VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_person_id INTEGER REFERENCES users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_accepted_at TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_channel_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_channel_check
      CHECK (channel IN ('online', 'pos'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_delivery_status_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_delivery_status_check
      CHECK (delivery_status IN ('pending', 'assigned', 'out_for_delivery', 'delivered', 'cancelled'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL,
  price NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS order_delivery_events (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL,
  delivery_person_id INTEGER REFERENCES users(id),
  note TEXT,
  recipient_name VARCHAR(100),
  proof_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  photo_filename VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE order_delivery_events ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(100);
ALTER TABLE order_delivery_events ADD COLUMN IF NOT EXISTS proof_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE order_delivery_events ADD COLUMN IF NOT EXISTS photo_filename VARCHAR(255);

CREATE INDEX IF NOT EXISTS order_delivery_events_order_id_idx
  ON order_delivery_events(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_delivery_locations (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_person_id INTEGER NOT NULL REFERENCES users(id),
  latitude NUMERIC(9, 6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9, 6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy NUMERIC(10, 2),
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS order_delivery_locations_latest_idx
  ON order_delivery_locations(order_id, recorded_at DESC);
