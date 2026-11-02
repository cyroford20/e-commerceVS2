const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

// POST /api/auth/register
router.post('/register', authController.register);

// POST /api/auth/login
router.post('/login', authController.login);

// GET /api/auth/me
router.get('/me', authenticate, authController.me);

// PUT /api/auth/me
router.put('/me', authenticate, authController.updateMe);

// GET /api/auth/customers
router.get(
  '/customers',
  authenticate,
  requireRole('store-owner'),
  authController.listCustomers
);

router.get(
  '/delivery-persons',
  authenticate,
  requireRole('store-owner'),
  authController.listDeliveryPersons
);

router.post(
  '/delivery-persons',
  authenticate,
  requireRole('store-owner'),
  authController.createDeliveryPerson
);

module.exports = router;
