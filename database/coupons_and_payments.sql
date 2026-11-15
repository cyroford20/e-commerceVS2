ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(64),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('cod', 'paid', 'cash'));

CREATE TABLE IF NOT EXISTS order_payments (
  id BIGSERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  payment_method VARCHAR(20) NOT NULL CHECK (payment_method = 'cash'),
  amount_due NUMERIC(10, 2) NOT NULL CHECK (amount_due >= 0),
  amount_tendered NUMERIC(10, 2) NOT NULL CHECK (amount_tendered >= amount_due),
  change_amount NUMERIC(10, 2) NOT NULL CHECK (change_amount >= 0),
  collected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupon_campaigns (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(64) NOT NULL,
  discount_type VARCHAR(16) NOT NULL CHECK (discount_type IN ('fixed', 'percent')),
  discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
  minimum_order_total NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (minimum_order_total >= 0),
  maximum_discount_amount NUMERIC(10, 2) CHECK (maximum_discount_amount IS NULL OR maximum_discount_amount > 0),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  max_redemptions_per_customer INTEGER NOT NULL DEFAULT 1 CHECK (max_redemptions_per_customer > 0),
  qualifying_order_count INTEGER CHECK (qualifying_order_count IS NULL OR qualifying_order_count > 0),
  qualification_period VARCHAR(12) CHECK (qualification_period IN ('week', 'month')),
  reward_expiration_days INTEGER NOT NULL DEFAULT 30 CHECK (reward_expiration_days > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (discount_type <> 'percent' OR discount_value <= 100),
  CHECK (expires_at IS NULL OR expires_at > starts_at),
  CHECK (
    (qualifying_order_count IS NULL AND qualification_period IS NULL) OR
    (qualifying_order_count IS NOT NULL AND qualification_period IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS coupon_campaigns_code_unique_idx
  ON coupon_campaigns (UPPER(code));

CREATE TABLE IF NOT EXISTS customer_coupons (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES coupon_campaigns(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(64) NOT NULL UNIQUE,
  period_key VARCHAR(32) NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ,
  UNIQUE (campaign_id, customer_id, period_key)
);

CREATE INDEX IF NOT EXISTS customer_coupons_customer_idx
  ON customer_coupons (customer_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES coupon_campaigns(id),
  customer_id INTEGER REFERENCES users(id),
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  code VARCHAR(64) NOT NULL,
  discount_amount NUMERIC(10, 2) NOT NULL CHECK (discount_amount >= 0),
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS coupon_redemptions_campaign_idx
  ON coupon_redemptions (campaign_id, redeemed_at DESC);
