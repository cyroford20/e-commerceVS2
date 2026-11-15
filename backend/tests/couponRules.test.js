const test = require('node:test');
const assert = require('node:assert/strict');
const {
  moneyToCents,
  calculateDiscountCents,
  couponIneligibility,
  periodRange,
  tenderChangeCents,
  countQualifyingCompletedOrders,
  hasMetOrderThreshold,
  isEligibleRewardCustomer,
} = require('../utils/couponRules');
const couponModel = require('../models/couponModel');

test('cash tender accepts exact and zero-total payments but rejects short or invalid amounts', () => {
  assert.equal(tenderChangeCents('125.50', '125.50'), 0);
  assert.equal(tenderChangeCents('125.50', '150.00'), 2450);
  assert.equal(tenderChangeCents('0.00', '0'), 0);
  assert.equal(tenderChangeCents('125.50', '125.49'), null);
  assert.equal(tenderChangeCents('0.00', ''), null);
  assert.equal(moneyToCents('1.239'), null);
  assert.equal(moneyToCents('-1'), null);
});

test('coupon discounts respect minimum orders, percentage caps, and subtotal limits', () => {
  assert.equal(calculateDiscountCents({
    discount_type: 'percent',
    discount_value: '20',
    minimum_order_total: '100',
    maximum_discount_amount: '30',
  }, 25000), 3000);
  assert.equal(calculateDiscountCents({
    discount_type: 'fixed',
    discount_value: '50',
    minimum_order_total: '0',
  }, 2000), 2000);
  assert.equal(calculateDiscountCents({
    discount_type: 'fixed',
    discount_value: '10',
    minimum_order_total: '100',
  }, 9999), null);
});

test('coupon eligibility distinguishes inactive, expired, used, and minimum-order cases', () => {
  const now = new Date('2026-04-10T00:00:00Z');
  const base = { active: true, now, subtotal: 100, minimumOrderTotal: 50 };
  assert.equal(couponIneligibility({ ...base, active: false }), 'inactive');
  assert.equal(couponIneligibility({ ...base, expiresAt: '2026-04-09T23:59:59Z' }), 'expired');
  assert.equal(couponIneligibility({ ...base, customerUseLimit: 1, customerUses: 1 }), 'already_used');
  assert.equal(couponIneligibility({ ...base, subtotal: 49 }), 'minimum_order');
  assert.equal(couponIneligibility(base), null);
});

test('calendar week and month ranges use the Manila business timezone', () => {
  const sunday = periodRange(new Date('2026-03-01T15:59:59Z'), 'week', 'Asia/Manila');
  const monday = periodRange(new Date('2026-03-01T16:00:00Z'), 'week', 'Asia/Manila');
  const midweek = periodRange(new Date('2026-03-04T00:00:00Z'), 'week', 'Asia/Manila');
  assert.notEqual(sunday.key, monday.key);
  assert.equal(monday.key, midweek.key);
  assert.equal(monday.start.toISOString(), '2026-03-01T16:00:00.000Z');

  const marchEnd = periodRange(new Date('2026-03-31T15:59:59Z'), 'month', 'Asia/Manila');
  const aprilStart = periodRange(new Date('2026-03-31T16:00:00Z'), 'month', 'Asia/Manila');
  assert.equal(marchEnd.key, 'month:2026-03');
  assert.equal(aprilStart.key, 'month:2026-04');
  assert.equal(marchEnd.end.toISOString(), '2026-03-31T16:00:00.000Z');
});

test('only delivered online and POS orders count toward reward thresholds', () => {
  const orders = [
    { delivery_status: 'delivered', payment_status: 'collected', channel: 'online' },
    { delivery_status: 'delivered', payment_status: 'paid', channel: 'pos' },
    { delivery_status: 'cancelled', channel: 'online' },
    { delivery_status: 'delivered', payment_status: 'refunded', channel: 'online' },
    { delivery_status: 'delivered', channel: 'walk-in' },
  ];
  assert.equal(countQualifyingCompletedOrders(orders), 2);
  assert.equal(hasMetOrderThreshold(orders, 3), false);
  assert.equal(hasMetOrderThreshold(orders, 2), true);

  const fourCompletedOrders = Array.from({ length: 4 }, () => ({
    delivery_status: 'delivered',
    payment_status: 'paid',
    channel: 'pos',
  }));
  assert.equal(hasMetOrderThreshold(fourCompletedOrders, 5), false);
  assert.equal(hasMetOrderThreshold([...fourCompletedOrders, {
    delivery_status: 'delivered',
    payment_status: 'paid',
    channel: 'online',
  }], 5), true);
});

test('walk-in accounts are excluded from reward eligibility', () => {
  assert.equal(isEligibleRewardCustomer({
    role: 'customer',
    email: 'shopper@example.test',
  }), true);
  assert.equal(isEligibleRewardCustomer({
    role: 'customer',
    email: 'walkin@vapeshop.local',
  }), false);
  assert.equal(isEligibleRewardCustomer({ role: 'store-owner', email: 'owner@example.test' }), false);
});

test('reward retries use one customer-campaign-period key and tolerate conflict', async () => {
  let issueAttempts = 0;
  const insertParameters = [];
  const insertStatements = [];
  const client = {
    async query(sql, params = []) {
      if (sql.includes('SELECT id, role, email FROM users')) {
        return { rows: [{ id: 7, role: 'customer', email: 'shopper@example.test' }] };
      }
      if (sql.includes('SELECT id, code, starts_at, qualifying_order_count')) {
        return {
          rows: [{
            id: 3,
            code: 'LOYAL',
            starts_at: '2026-03-01T00:00:00.000Z',
            qualifying_order_count: 2,
            qualification_period: 'week',
            reward_expiration_days: 30,
            expires_at: null,
          }],
        };
      }
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}] };
      if (sql.includes('SELECT delivery_status, payment_status, channel')) {
        return {
          rows: [
            { delivery_status: 'delivered', channel: 'online' },
            { delivery_status: 'delivered', channel: 'pos' },
          ],
        };
      }
      if (sql.includes('INSERT INTO customer_coupons')) {
        issueAttempts += 1;
        insertParameters.push(params);
        insertStatements.push(sql);
        return { rows: issueAttempts === 1 ? [{ id: 99 }] : [] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const completedAt = new Date('2026-03-04T00:00:00Z');

  assert.deepEqual(await couponModel.issueRewardsForCustomer(client, 7, completedAt), [99]);
  assert.deepEqual(await couponModel.issueRewardsForCustomer(client, 7, completedAt), []);
  assert.equal(issueAttempts, 2);
  assert.equal(insertParameters[0][3], insertParameters[1][3]);
  assert.match(insertStatements[0], /ON CONFLICT \(campaign_id, customer_id, period_key\) DO NOTHING/);
});
