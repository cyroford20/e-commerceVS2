const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const { uploadProofPhoto } = require('../middleware/uploadMiddleware');

const handleProofUpload = (req, res, next) => {
  uploadProofPhoto.single('proof_photo')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Proof photo must be 5 MB or smaller.' });
    }
    return res.status(400).json({ message: error.message || 'Invalid proof photo.' });
  });
};

// POST /api/orders  (customers only)
router.post('/', authenticate, requireRole('customer'), orderController.createOrder);

// POST /api/orders/pos  (store owner in-store checkout)
router.post('/pos', authenticate, requireRole('store-owner'), orderController.createPosOrder);

// GET /api/orders  (store owner sees every order)
router.get('/', authenticate, requireRole('store-owner'), orderController.getAllOrders);

// PUT /api/orders/:id/delivery (store owner manages delivery)
router.put('/:id/delivery', authenticate, requireRole('store-owner'), orderController.updateDelivery);

router.get(
  '/assigned',
  authenticate,
  requireRole('delivery-person'),
  orderController.getAssignedDeliveries
);

router.put(
  '/:id/accept',
  authenticate,
  requireRole('delivery-person'),
  orderController.acceptAssignedDelivery
);

router.put(
  '/:id/delivery-status',
  authenticate,
  requireRole('delivery-person'),
  handleProofUpload,
  orderController.updateAssignedDelivery
);

router.put(
  '/:id/delivery-location',
  authenticate,
  requireRole('delivery-person'),
  orderController.updateDeliveryLocation
);

router.get('/proof/:eventId', authenticate, orderController.getProofPhoto);
router.get('/:id/delivery-location', authenticate, orderController.getDeliveryLocation);

// GET /api/orders/user/:id  (customers see their own)
router.get('/user/:id', authenticate, requireRole('customer'), orderController.getUserOrders);

module.exports = router;
