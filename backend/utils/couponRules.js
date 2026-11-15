const moneyToCents = (value) => {
  const text = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
};

const calculateDiscountCents = (coupon, subtotalCents) => {
  const value = Number(coupon.discount_value);
  if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(subtotalCents) || subtotalCents < 0) {
    return null;
  }
  if (subtotalCents < Number(coupon.minimum_order_total || 0) * 100) return null;

  let discountCents = coupon.discount_type === 'percent'
    ? Math.round(subtotalCents * value / 100)
    : moneyToCents(value);
  if (discountCents === null) return null;

  if (coupon.maximum_discount_amount != null) {
    discountCents = Math.min(discountCents, moneyToCents(coupon.maximum_discount_amount));
  }
  return Math.min(subtotalCents, discountCents);
};

const couponIneligibility = ({
  active,
  startsAt,
  expiresAt,
  now = new Date(),
  remainingUses,
  customerUseLimit,
  customerUses = 0,
  minimumOrderTotal = 0,
  subtotal,
}) => {
  if (!active) return 'inactive';
  if (startsAt && new Date(startsAt) > now) return 'not_started';
  if (expiresAt && new Date(expiresAt) <= now) return 'expired';
  if (remainingUses != null && remainingUses <= 0) return 'usage_limit';
  if (customerUseLimit != null && customerUses >= customerUseLimit) return 'already_used';
  if (Number(subtotal) < Number(minimumOrderTotal)) return 'minimum_order';
  return null;
};

const localParts = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
};

const localDateToUtc = (year, month, day, timeZone) => {
  const target = Date.UTC(year, month - 1, day);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = localParts(new Date(candidate), timeZone);
    const represented = Date.UTC(
      parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second
    );
    candidate += target - represented;
  }
  return new Date(candidate);
};

const periodRange = (date, period, timeZone = process.env.BUSINESS_TIMEZONE || 'Asia/Manila') => {
  if (!['week', 'month'].includes(period)) throw new Error('Unsupported coupon qualification period.');
  const parts = localParts(date, timeZone);
  let year = parts.year;
  let month = parts.month;
  let day = parts.day;

  if (period === 'week') {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    day -= (weekday + 6) % 7;
  } else {
    day = 1;
  }

  const startCalendar = new Date(Date.UTC(year, month - 1, day));
  year = startCalendar.getUTCFullYear();
  month = startCalendar.getUTCMonth() + 1;
  day = startCalendar.getUTCDate();
  const next = new Date(Date.UTC(year, month - 1, day + (period === 'week' ? 7 : 0)));
  if (period === 'month') {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  const start = localDateToUtc(year, month, day, timeZone);
  const end = localDateToUtc(
    next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timeZone
  );
  const key = period === 'week'
    ? `week:${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : `month:${year}-${String(month).padStart(2, '0')}`;
  return { start, end, key };
};

const tenderChangeCents = (amountDue, amountTendered) => {
  const dueCents = moneyToCents(amountDue);
  const tenderedCents = moneyToCents(amountTendered);
  if (dueCents === null || tenderedCents === null || tenderedCents < dueCents) return null;
  return tenderedCents - dueCents;
};

const isEligibleCompletedOrder = (order) =>
  order?.delivery_status === 'delivered' &&
  order.payment_status !== 'refunded' &&
  ['online', 'pos'].includes(order.channel);

const countQualifyingCompletedOrders = (orders) =>
  orders.filter(isEligibleCompletedOrder).length;

const hasMetOrderThreshold = (orders, threshold) =>
  Number.isSafeInteger(Number(threshold)) &&
  Number(threshold) > 0 &&
  countQualifyingCompletedOrders(orders) >= Number(threshold);

const isEligibleRewardCustomer = (user) =>
  user?.role === 'customer' && user.email !== 'walkin@vapeshop.local';

module.exports = {
  moneyToCents,
  calculateDiscountCents,
  couponIneligibility,
  periodRange,
  tenderChangeCents,
  isEligibleCompletedOrder,
  countQualifyingCompletedOrders,
  hasMetOrderThreshold,
  isEligibleRewardCustomer,
};
