-- In-house delivery management additions for the existing PostgreSQL schema.
-- Run after schema.sql. Existing users, orders, and order_items remain canonical.

CREATE TABLE IF NOT EXISTS vehicles (
  id SERIAL PRIMARY KEY,
  plate_number VARCHAR(24) NOT NULL UNIQUE,
  description VARCHAR(120),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rider_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone VARCHAR(30),
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  availability VARCHAR(20) NOT NULL DEFAULT 'available'
    CHECK (availability IN ('available', 'busy', 'unavailable')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS rider_profiles_active_vehicle_unique_idx
  ON rider_profiles(vehicle_id) WHERE vehicle_id IS NOT NULL AND active = TRUE;

CREATE TABLE IF NOT EXISTS delivery_zones (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  city VARCHAR(100) NOT NULL,
  barangay VARCHAR(100) NOT NULL,
  delivery_fee NUMERIC(10, 2) NOT NULL CHECK (delivery_fee >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (city, barangay)
);

CREATE TABLE IF NOT EXISTS rider_zone_coverage (
  rider_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivery_zone_id INTEGER NOT NULL REFERENCES delivery_zones(id) ON DELETE CASCADE,
  PRIMARY KEY (rider_user_id, delivery_zone_id)
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_zone_id INTEGER REFERENCES delivery_zones(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_instructions TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'cod';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'pending';

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('cod', 'paid'));
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'collected', 'remitted', 'paid'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_delivery_status_check CHECK (
  delivery_status IN (
    'pending', 'ready_for_delivery', 'assigned', 'rider_assigned',
    'accepted_by_rider', 'picked_up', 'out_for_delivery', 'delivered',
    'delivery_failed', 'rescheduled', 'return_to_warehouse', 'cancelled'
  )
);

CREATE TABLE IF NOT EXISTS shipments (
  id BIGSERIAL PRIMARY KEY,
  shipment_code VARCHAR(40) NOT NULL UNIQUE,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  delivery_zone_id INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL,
  rider_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ready_for_delivery'
    CHECK (status IN (
      'ready_for_delivery', 'rider_assigned', 'accepted_by_rider', 'picked_up',
      'out_for_delivery', 'delivered', 'delivery_failed', 'rescheduled',
      'return_to_warehouse', 'cancelled'
    )),
  delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  expected_cod NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (expected_cod >= 0),
  actual_cod NUMERIC(10, 2) CHECK (actual_cod IS NULL OR actual_cod >= 0),
  cod_remitted_at TIMESTAMP,
  otp_hash TEXT,
  otp_expires_at TIMESTAMP,
  estimated_delivery_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS shipments_status_created_idx ON shipments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS shipments_rider_status_idx ON shipments(rider_user_id, status);

CREATE TABLE IF NOT EXISTS rider_assignments (
  id BIGSERIAL PRIMARY KEY,
  shipment_id BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  rider_user_id INTEGER NOT NULL REFERENCES users(id),
  assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'assigned'
    CHECK (state IN ('assigned', 'accepted', 'rejected', 'completed', 'reassigned')),
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP,
  ended_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS rider_assignments_shipment_idx
  ON rider_assignments(shipment_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS rider_assignments_rider_idx
  ON rider_assignments(rider_user_id, state, assigned_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS rider_assignments_one_open_per_shipment_idx
  ON rider_assignments(shipment_id) WHERE state IN ('assigned', 'accepted');

CREATE TABLE IF NOT EXISTS delivery_attempts (
  id BIGSERIAL PRIMARY KEY,
  shipment_id BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  rider_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  result VARCHAR(20) NOT NULL CHECK (result IN ('failed', 'delivered')),
  failure_reason VARCHAR(40),
  notes TEXT,
  rescheduled_for TIMESTAMP,
  attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (result = 'failed' AND failure_reason IN (
      'customer_unavailable', 'customer_unreachable', 'incorrect_address',
      'customer_rejected', 'other'
    )) OR (result = 'delivered' AND failure_reason IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS delivery_attempts_shipment_idx
  ON delivery_attempts(shipment_id, attempted_at DESC);

CREATE TABLE IF NOT EXISTS shipment_events (
  id BIGSERIAL PRIMARY KEY,
  shipment_id BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL,
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS shipment_events_shipment_idx
  ON shipment_events(shipment_id, created_at, id);

CREATE TABLE IF NOT EXISTS proof_of_delivery (
  shipment_id BIGINT PRIMARY KEY REFERENCES shipments(id) ON DELETE CASCADE,
  recipient_name VARCHAR(100) NOT NULL,
  photo_filename VARCHAR(255),
  confirmed_by INTEGER NOT NULL REFERENCES users(id),
  delivered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cod_transactions (
  id BIGSERIAL PRIMARY KEY,
  shipment_id BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  rider_user_id INTEGER NOT NULL REFERENCES users(id),
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('collection', 'remittance')),
  expected_amount NUMERIC(10, 2) NOT NULL CHECK (expected_amount >= 0),
  actual_amount NUMERIC(10, 2) NOT NULL CHECK (actual_amount >= 0),
  discrepancy NUMERIC(10, 2) GENERATED ALWAYS AS (actual_amount - expected_amount) STORED,
  notes TEXT,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cod_transactions_rider_idx
  ON cod_transactions(rider_user_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS delivery_notifications (
  id BIGSERIAL PRIMARY KEY,
  shipment_id BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(30) NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS delivery_notifications_recipient_idx
  ON delivery_notifications(recipient_user_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_tracking (
  id BIGSERIAL PRIMARY KEY,
  shipment_id BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  rider_user_id INTEGER NOT NULL REFERENCES users(id),
  latitude NUMERIC(9, 6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9, 6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy NUMERIC(10, 2),
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS delivery_tracking_latest_idx
  ON delivery_tracking(shipment_id, recorded_at DESC);

-- Convert existing delivery-person logins to rider profiles without changing accounts.
INSERT INTO rider_profiles (user_id)
SELECT id FROM users WHERE role = 'delivery-person'
ON CONFLICT (user_id) DO NOTHING;

-- Create shipment records for existing online orders. Old delivery states are mapped
-- to the closest state in the expanded in-house workflow.
INSERT INTO shipments (shipment_code, order_id, delivery_zone_id, rider_user_id, status, delivery_fee, expected_cod, created_at)
SELECT
  'LEGACY-' || o.id,
  o.id,
  o.delivery_zone_id,
  o.delivery_person_id,
  CASE o.delivery_status
    WHEN 'assigned' THEN 'rider_assigned'
    WHEN 'out_for_delivery' THEN 'out_for_delivery'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'ready_for_delivery'
  END,
  COALESCE(o.delivery_fee, 0),
  CASE WHEN o.payment_method = 'cod' THEN o.total ELSE 0 END,
  o.created_at
FROM orders o
WHERE o.channel = 'online'
ON CONFLICT (order_id) DO NOTHING;

UPDATE orders o SET delivery_status = s.status
FROM shipments s
WHERE s.order_id = o.id AND o.channel = 'online';

INSERT INTO rider_assignments (shipment_id, rider_user_id, state, assigned_at, accepted_at)
SELECT s.id, s.rider_user_id,
  CASE WHEN s.status IN ('accepted_by_rider', 'picked_up', 'out_for_delivery') THEN 'accepted'
       WHEN s.status = 'delivered' THEN 'completed'
       ELSE 'assigned' END,
  COALESCE(o.delivery_accepted_at, s.created_at), o.delivery_accepted_at
FROM shipments s JOIN orders o ON o.id = s.order_id
WHERE s.rider_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM rider_assignments a WHERE a.shipment_id = s.id);

UPDATE rider_profiles rp SET availability = 'busy', updated_at = CURRENT_TIMESTAMP
FROM shipments s
WHERE s.rider_user_id = rp.user_id
  AND s.status IN ('accepted_by_rider', 'picked_up', 'out_for_delivery');

INSERT INTO shipment_events (shipment_id, status, note, created_at)
SELECT s.id, s.status, 'Existing order delivery migrated to shipment tracking', s.created_at
FROM shipments s
WHERE NOT EXISTS (SELECT 1 FROM shipment_events e WHERE e.shipment_id = s.id);
