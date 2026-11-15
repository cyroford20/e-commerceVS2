const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

const ownerOnly = [authenticate, requireRole('store-owner')];
const customerOnly = [authenticate, requireRole('customer')];

// GET /api/products
router.get('/', productController.getAllProducts);
router.get('/admin/catalog', ...ownerOnly, productController.getOwnerProducts);

// Keep this route before /:id so "barcode" is not treated as an id.
router.get('/barcode/conflict', ...ownerOnly, productController.checkBarcodeConflict);
router.get('/barcode', productController.getProductByBarcode);
router.get('/barcode/:barcode', productController.getProductByBarcode);
router.post('/build/validate', ...customerOnly, productController.validateBuildForCart);

// GET /api/products/:id
router.get('/:id', productController.getProductById);

// Store owner catalog management
router.post('/', ownerOnly, productController.createProduct);
router.put('/:id', ownerOnly, productController.updateProduct);
router.delete('/:id', ownerOnly, productController.deleteProduct);

module.exports = router;
