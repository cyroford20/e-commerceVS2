const couponModel = require('../models/couponModel');
const userModel = require('../models/userModel');
const { moneyToCents } = require('../utils/couponRules');

const parseId = (value) => {
  if (!/^[1-9]\d*$/.test(String(value || ''))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
};

const parseCampaign = (body) => {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const discountType = body.discount_type;
  const discountValue = Number(body.discount_value);
  const minimumOrderTotal = body.minimum_order_total === '' || body.minimum_order_total == null
    ? 0
    : Number(body.minimum_order_total);
  const minimumOrderRaw = body.minimum_order_total === '' || body.minimum_order_total == null
    ? '0'
    : body.minimum_order_total;
  const maximumDiscountAmount = body.maximum_discount_amount === '' || body.maximum_discount_amount == null
    ? null
    : Number(body.maximum_discount_amount);
  const maximumDiscountRaw = body.maximum_discount_amount;
  const startsAt = body.starts_at ? new Date(body.starts_at) : new Date();
  const expiresAt = body.expires_at ? new Date(body.expires_at) : null;
  const maxRedemptions = body.max_redemptions === '' || body.max_redemptions == null
    ? null
    : Number(body.max_redemptions);
  const maxRedemptionsPerCustomer = body.max_redemptions_per_customer == null
    ? 1
    : Number(body.max_redemptions_per_customer);
  const qualifyingOrderCount = body.qualifying_order_count === '' || body.qualifying_order_count == null
    ? null
    : Number(body.qualifying_order_count);
  const qualificationPeriod = qualifyingOrderCount == null ? null : body.qualification_period;
  const rewardExpirationDays = body.reward_expiration_days == null
    ? 30
    : Number(body.reward_expiration_days);
  const validMoney = (value) => Number.isFinite(value) && value >= 0 && value <= 99999999.99;

  if (!name || name.length > 120 || !/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(code) ||
      !['fixed', 'percent'].includes(discountType) ||
      !Number.isFinite(discountValue) || discountValue <= 0 ||
      moneyToCents(body.discount_value) === null ||
      (discountType === 'percent' && discountValue > 100) ||
      !validMoney(minimumOrderTotal) || moneyToCents(minimumOrderRaw) === null ||
      (maximumDiscountAmount != null && (
        !validMoney(maximumDiscountAmount) || maximumDiscountAmount <= 0 ||
        moneyToCents(maximumDiscountRaw) === null
      )) ||
      Number.isNaN(startsAt.getTime()) ||
      (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= startsAt)) ||
      (maxRedemptions != null && (!Number.isSafeInteger(maxRedemptions) || maxRedemptions < 1)) ||
      !Number.isSafeInteger(maxRedemptionsPerCustomer) || maxRedemptionsPerCustomer < 1 ||
      (qualifyingOrderCount != null && (!Number.isSafeInteger(qualifyingOrderCount) || qualifyingOrderCount < 1)) ||
      (qualifyingOrderCount != null && !['week', 'month'].includes(qualificationPeriod)) ||
      !Number.isSafeInteger(rewardExpirationDays) || rewardExpirationDays < 1 || rewardExpirationDays > 365 ||
      (body.active !== undefined && typeof body.active !== 'boolean')) {
    return null;
  }

  return {
    name,
    code,
    discountType,
    discountValue,
    minimumOrderTotal,
    maximumDiscountAmount,
    startsAt: startsAt.toISOString(),
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    active: body.active === undefined ? true : body.active,
    maxRedemptions,
    maxRedemptionsPerCustomer,
    qualifyingOrderCount,
    qualificationPeriod,
    rewardExpirationDays,
  };
};

const sendError = (res, error, fallback) => {
  if (error.code === '23505') return res.status(409).json({ message: 'A coupon campaign already uses that code.' });
  console.error(fallback, error);
  return res.status(error.status || 500).json({
    message: error.status ? error.message : fallback,
  });
};

const listCampaigns = async (req, res) => {
  try {
    res.json(await couponModel.listCampaigns());
  } catch (error) {
    sendError(res, error, 'Could not load coupon campaigns.');
  }
};

const createCampaign = async (req, res) => {
  const campaign = parseCampaign(req.body);
  if (!campaign) return res.status(400).json({ message: 'Enter valid coupon campaign settings.' });
  try {
    res.status(201).json(await couponModel.saveCampaign(null, campaign));
  } catch (error) {
    sendError(res, error, 'Could not create coupon campaign.');
  }
};

const updateCampaign = async (req, res) => {
  const id = parseId(req.params.id);
  const campaign = parseCampaign(req.body);
  if (!id || !campaign) return res.status(400).json({ message: 'Enter valid coupon campaign settings.' });
  try {
    const updated = await couponModel.saveCampaign(id, campaign);
    if (!updated) return res.status(404).json({ message: 'Coupon campaign not found.' });
    res.json(updated);
  } catch (error) {
    sendError(res, error, 'Could not update coupon campaign.');
  }
};

const validateCoupon = async (req, res) => {
  try {
    let customerId = req.user.role === 'customer' ? req.user.id : null;
    if (req.user.role === 'store-owner' && req.body.customer_id != null) {
      customerId = parseId(req.body.customer_id);
      if (!customerId) return res.status(400).json({ message: 'Select a valid customer for this coupon.' });
      const customer = await userModel.findById(customerId);
      if (!customer || customer.role !== 'customer') {
        return res.status(400).json({ message: 'Selected customer was not found.' });
      }
    }
    const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
    const result = await couponModel.previewCoupon(code, customerId, req.body.items);
    res.json(result);
  } catch (error) {
    sendError(res, error, 'Could not validate coupon.');
  }
};

const getMyCoupons = async (req, res) => {
  try {
    res.json(await couponModel.getMyCoupons(req.user.id));
  } catch (error) {
    sendError(res, error, 'Could not load your coupons.');
  }
};

module.exports = {
  listCampaigns,
  createCampaign,
  updateCampaign,
  validateCoupon,
  getMyCoupons,
};
