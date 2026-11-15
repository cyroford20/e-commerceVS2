const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

router.post(
  '/validate',
  authenticate,
  requireRole('customer', 'store-owner'),
  couponController.validateCoupon
);
router.get('/mine', authenticate, requireRole('customer'), couponController.getMyCoupons);
router.get(
  '/admin/campaigns',
  authenticate,
  requireRole('store-owner'),
  couponController.listCampaigns
);
router.post(
  '/admin/campaigns',
  authenticate,
  requireRole('store-owner'),
  couponController.createCampaign
);
router.put(
  '/admin/campaigns/:id',
  authenticate,
  requireRole('store-owner'),
  couponController.updateCampaign
);

module.exports = router;
