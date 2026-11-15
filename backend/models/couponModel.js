const crypto = require('crypto');
const getPool = () => require('../config/db');
const {
  calculateDiscountCents,
  couponIneligibility,
  periodRange,
  moneyToCents,
  hasMetOrderThreshold,
  isEligibleRewardCustomer,
} = require('../utils/couponRules');

const businessTimeZone = process.env.BUSINESS_TIMEZONE || 'Asia/Manila';
const problem = (message, status = 400) => Object.assign(new Error(message), { status });
const asMoney = (cents) => (cents / 100).toFixed(2);

const listCampaigns = async () => {
  const result = await getPool().query(
    `SELECT c.*,
       (SELECT COUNT(*)::int FROM coupon_redemptions r WHERE r.campaign_id = c.id) AS redemption_count,
       (SELECT COUNT(*)::int FROM customer_coupons cc WHERE cc.campaign_id = c.id) AS issued_reward_count,
       CASE WHEN c.qualifying_order_count IS NULL THEN 0 ELSE (
         SELECT COUNT(*)::int FROM (
           SELECT o.user_id
           FROM orders o
           JOIN users u ON u.id = o.user_id
           WHERE o.delivery_status = 'delivered'
             AND o.payment_status <> 'refunded'
             AND u.role = 'customer' AND u.email <> 'walkin@vapeshop.local'
             AND o.completed_at >= c.starts_at
             AND (c.expires_at IS NULL OR o.completed_at < c.expires_at)
             AND o.completed_at >= (
               date_trunc(c.qualification_period, CURRENT_TIMESTAMP AT TIME ZONE $1) AT TIME ZONE $1
             )
             AND o.completed_at < (
               (date_trunc(c.qualification_period, CURRENT_TIMESTAMP AT TIME ZONE $1) +
                 CASE WHEN c.qualification_period = 'week' THEN INTERVAL '1 week' ELSE INTERVAL '1 month' END)
               AT TIME ZONE $1
             )
           GROUP BY o.user_id
           HAVING COUNT(*) >= c.qualifying_order_count
         ) qualified
       ) END AS qualifying_customer_count
     FROM coupon_campaigns c
     ORDER BY c.created_at DESC, c.id DESC`,
    [businessTimeZone]
  );
  return result.rows;
};

const saveCampaign = async (id, campaign) => {
  const fields = [
    campaign.name,
    campaign.code,
    campaign.discountType,
    campaign.discountValue,
    campaign.minimumOrderTotal,
    campaign.maximumDiscountAmount,
    campaign.startsAt,
    campaign.expiresAt,
    campaign.active,
    campaign.maxRedemptions,
    campaign.maxRedemptionsPerCustomer,
    campaign.qualifyingOrderCount,
    campaign.qualificationPeriod,
    campaign.rewardExpirationDays,
  ];
  const result = id
    ? await getPool().query(
      `UPDATE coupon_campaigns SET
         name = $1, code = $2, discount_type = $3, discount_value = $4,
         minimum_order_total = $5, maximum_discount_amount = $6,
         starts_at = $7, expires_at = $8, active = $9,
         max_redemptions = $10, max_redemptions_per_customer = $11,
         qualifying_order_count = $12, qualification_period = $13,
         reward_expiration_days = $14
       WHERE id = $15 RETURNING *`,
      [...fields, id]
    )
    : await getPool().query(
      `INSERT INTO coupon_campaigns
         (name, code, discount_type, discount_value, minimum_order_total,
          maximum_discount_amount, starts_at, expires_at, active, max_redemptions,
          max_redemptions_per_customer, qualifying_order_count, qualification_period,
          reward_expiration_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      fields
    );
  return result.rows[0] || null;
};

const getMyCoupons = async (customerId) => {
  const result = await getPool().query(
    `SELECT cc.id, cc.code, cc.issued_at, cc.expires_at, cc.redeemed_at,
       c.id AS campaign_id, c.name, c.discount_type, c.discount_value,
       c.minimum_order_total,
       CASE
         WHEN cc.redeemed_at IS NOT NULL THEN 'used'
         WHEN cc.expires_at <= CURRENT_TIMESTAMP THEN 'expired'
         WHEN NOT c.active THEN 'inactive'
         ELSE 'available'
       END AS status
     FROM customer_coupons cc
     JOIN coupon_campaigns c ON c.id = cc.campaign_id
     WHERE cc.customer_id = $1
     ORDER BY cc.issued_at DESC, cc.id DESC`,
    [customerId]
  );
  return result.rows;
};

const publicCoupon = async (client, code, lock) => {
  const result = await client.query(
    `SELECT * FROM coupon_campaigns
     WHERE UPPER(code) = UPPER($1) AND qualifying_order_count IS NULL
     ${lock ? 'FOR UPDATE' : ''}`,
    [code]
  );
  return result.rows[0] || null;
};

const assignedCoupon = async (client, code, customerId, lock) => {
  if (!customerId) return null;
  const result = await client.query(
    `SELECT cc.*, c.id AS campaign_id
     FROM customer_coupons cc
     JOIN coupon_campaigns c ON c.id = cc.campaign_id
     WHERE UPPER(cc.code) = UPPER($1) AND cc.customer_id = $2
     ${lock ? 'FOR UPDATE OF cc' : ''}`,
    [code, customerId]
  );
  return result.rows[0] || null;
};

const getCouponDiscount = async (client, { code, customerId, subtotalCents, lock = false }) => {
  const normalizedCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!normalizedCode) throw problem('Enter a coupon code.');

  let campaign = await publicCoupon(client, normalizedCode, lock);
  let issuedCoupon = null;
  if (!campaign) {
    issuedCoupon = await assignedCoupon(client, normalizedCode, customerId, lock);
    if (!issuedCoupon) {
      throw problem(customerId
        ? 'This coupon is invalid or is not assigned to your account.'
        : 'A registered customer must be selected to use this coupon.');
    }
    const campaignResult = await client.query(
      `SELECT * FROM coupon_campaigns WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
      [issuedCoupon.campaign_id]
    );
    campaign = campaignResult.rows[0];
    if (issuedCoupon.redeemed_order_id || issuedCoupon.redeemed_at) {
      throw problem('This coupon has already been used.');
    }
    if (new Date(issuedCoupon.expires_at) <= new Date()) {
      throw problem('This coupon has expired.');
    }
  }

  const counts = await client.query(
    `SELECT COUNT(*)::int AS uses,
       COUNT(*) FILTER (WHERE customer_id = $2)::int AS customer_uses
     FROM coupon_redemptions WHERE campaign_id = $1`,
    [campaign.id, customerId || null]
  );
  const uses = counts.rows[0];
  const remainingUses = campaign.max_redemptions == null
    ? null
    : Number(campaign.max_redemptions) - Number(uses.uses);
  const reason = couponIneligibility({
    active: campaign.active,
    startsAt: campaign.starts_at,
    expiresAt: issuedCoupon ? issuedCoupon.expires_at : campaign.expires_at,
    remainingUses,
    customerUseLimit: customerId && !issuedCoupon ? campaign.max_redemptions_per_customer : null,
    customerUses: Number(uses.customer_uses),
    minimumOrderTotal: campaign.minimum_order_total,
    subtotal: subtotalCents / 100,
  });
  const messages = {
    inactive: 'This coupon campaign is inactive.',
    not_started: 'This coupon is not valid yet.',
    expired: 'This coupon has expired.',
    usage_limit: 'This coupon has reached its usage limit.',
    already_used: 'You have already used this coupon the allowed number of times.',
    minimum_order: `This coupon requires a minimum order of PHP ${Number(campaign.minimum_order_total).toFixed(2)}.`,
  };
  if (reason) throw problem(messages[reason]);

  const discountCents = calculateDiscountCents(campaign, subtotalCents);
  if (discountCents === null || discountCents <= 0) {
    throw problem('This coupon cannot be applied to the current order.');
  }
  return {
    campaign,
    code: normalizedCode,
    issuedCouponId: issuedCoupon?.id || null,
    discountCents,
  };
};

const recordRedemption = async (client, coupon, customerId, orderId) => {
  await client.query(
    `INSERT INTO coupon_redemptions (campaign_id, customer_id, order_id, code, discount_amount)
     VALUES ($1, $2, $3, $4, $5)`,
    [coupon.campaign.id, customerId, orderId, coupon.code, asMoney(coupon.discountCents)]
  );
  if (coupon.issuedCouponId) {
    await client.query(
      `UPDATE customer_coupons SET redeemed_order_id = $1, redeemed_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND customer_id = $3 AND redeemed_order_id IS NULL`,
      [orderId, coupon.issuedCouponId, customerId]
    );
  }
};

const validateItems = (items) => {
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw problem('Add at least one product to check this coupon.');
  }
  const quantities = new Map();
  for (const item of items) {
    const productId = Number(item?.product_id);
    const quantity = Number(item?.quantity);
    if (!Number.isSafeInteger(productId) || productId < 1 ||
        !Number.isSafeInteger(quantity) || quantity < 1) {
      throw problem('Each item needs a valid product and quantity.');
    }
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }
  return quantities;
};

const previewCoupon = async (code, customerId, items) => {
  const quantities = validateItems(items);
  const client = await getPool().connect();
  try {
    const products = await client.query(
      `SELECT id, price FROM products WHERE id = ANY($1::int[]) AND active = TRUE`,
      [[...quantities.keys()]]
    );
    const byId = new Map(products.rows.map((product) => [Number(product.id), product]));
    let subtotalCents = 0;
    for (const [productId, quantity] of quantities) {
      const product = byId.get(productId);
      if (!product) throw problem(`Product #${productId} is unavailable.`, 404);
      const priceCents = moneyToCents(product.price);
      subtotalCents += priceCents * quantity;
    }
    const coupon = await getCouponDiscount(client, { code, customerId, subtotalCents });
    return {
      code: coupon.code,
      campaign_name: coupon.campaign.name,
      subtotal: asMoney(subtotalCents),
      discount_amount: asMoney(coupon.discountCents),
      total: asMoney(subtotalCents - coupon.discountCents),
    };
  } finally {
    client.release();
  }
};

const issueRewardsForCustomer = async (client, customerId, completedAt = new Date()) => {
  const customer = await client.query(
    `SELECT id, role, email FROM users WHERE id = $1`,
    [customerId]
  );
  if (!isEligibleRewardCustomer(customer.rows[0])) return [];

  const campaigns = await client.query(
    `SELECT id, code, starts_at, qualifying_order_count, qualification_period,
       reward_expiration_days, expires_at
     FROM coupon_campaigns
     WHERE active = TRUE AND qualifying_order_count IS NOT NULL
       AND starts_at <= $1 AND (expires_at IS NULL OR expires_at > $1)`,
    [completedAt]
  );
  const issued = [];
  for (const campaign of campaigns.rows) {
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`${customerId}:${campaign.id}`]
    );
    const range = periodRange(new Date(completedAt), campaign.qualification_period, businessTimeZone);
    const ordersResult = await client.query(
      `SELECT delivery_status, payment_status, channel
       FROM orders
       WHERE user_id = $1
         AND completed_at >= $2 AND completed_at < $3
         AND completed_at >= $4
         AND ($5::timestamptz IS NULL OR completed_at < $5)`,
      [customerId, range.start, range.end, campaign.starts_at, campaign.expires_at]
    );
    if (!hasMetOrderThreshold(ordersResult.rows, Number(campaign.qualifying_order_count))) continue;

    const token = `${String(campaign.code).slice(0, 48)}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    const result = await client.query(
      `INSERT INTO customer_coupons (campaign_id, customer_id, code, period_key, expires_at)
       SELECT id, $2, $3, $4,
         CASE WHEN expires_at IS NULL
           THEN $5::timestamptz
           ELSE LEAST($5::timestamptz, expires_at)
         END
       FROM coupon_campaigns
       WHERE id = $1 AND active = TRUE
         AND starts_at <= $6 AND (expires_at IS NULL OR expires_at > $6)
       ON CONFLICT (campaign_id, customer_id, period_key) DO NOTHING
       RETURNING id`,
      [
        campaign.id,
        customerId,
        token,
        range.key,
        new Date(new Date(completedAt).getTime() + Number(campaign.reward_expiration_days) * 86400000),
        completedAt,
      ]
    );
    if (result.rows[0]) issued.push(result.rows[0].id);
  }
  return issued;
};

module.exports = {
  listCampaigns,
  saveCampaign,
  getMyCoupons,
  previewCoupon,
  getCouponDiscount,
  recordRedemption,
  issueRewardsForCustomer,
};
