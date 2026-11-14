const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticate, requireRole, requireActiveRider } = require('../middleware/authMiddleware');

// POST /api/orders  (customers only)
router.post('/', authenticate, requireRole('customer'), orderController.createOrder);

// POST /api/orders/pos  (store owner in-store checkout)
router.post('/pos', authenticate, requireRole('store-owner'), orderController.createPosOrder);

// GET /api/orders  (store owner sees every order)
router.get('/', authenticate, requireRole('store-owner'), orderController.getAllOrders);

// PUT /api/orders/:id/delivery (store owner manages delivery)
router.put('/:id/delivery', authenticate, requireRole('store-owner'), orderController.legacyDeliveryMutation);

router.get(
  '/assigned',
  authenticate,
  requireRole('delivery-person'),
  requireActiveRider,
  orderController.getAssignedDeliveries
);

router.put(
  '/:id/accept',
  authenticate,
  requireRole('delivery-person'),
  requireActiveRider,
  orderController.legacyDeliveryMutation
);

router.put(
  '/:id/delivery-status',
  authenticate,
  requireRole('delivery-person'),
  requireActiveRider,
  orderController.legacyDeliveryMutation
);

router.put(
  '/:id/delivery-location',
  authenticate,
  requireRole('delivery-person'),
  requireActiveRider,
  orderController.legacyDeliveryMutation
);

router.get('/proof/:eventId', authenticate, orderController.getProofPhoto);
router.get('/:id/delivery-location', authenticate, orderController.getDeliveryLocation);

// GET /api/orders/user/:id  (customers see their own)
router.get('/user/:id', authenticate, requireRole('customer'), orderController.getUserOrders);

module.exports = router;
