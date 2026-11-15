const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');
const { authenticate, requireRole, requireActiveRider } = require('../middleware/authMiddleware');
const { uploadProofPhoto } = require('../middleware/uploadMiddleware');

const ownerOnly = [authenticate, requireRole('store-owner')];
const riderOnly = [authenticate, requireRole('delivery-person'), requireActiveRider];
const userOnly = [authenticate];

const handleProofUpload = (req, res, next) => {
  uploadProofPhoto.single('proof_photo')(req, res, (error) => {
    if (!error) return next();
    return res.status(400).json({ message: error.code === 'LIMIT_FILE_SIZE'
      ? 'Proof photo must be 5 MB or smaller.'
      : error.message || 'Invalid proof photo.' });
  });
};

router.get('/zones', deliveryController.listZones);
router.get('/admin/dashboard', ...ownerOnly, deliveryController.dashboard);
router.get('/admin/locations', ...ownerOnly, deliveryController.searchPhilippineBarangays);
router.get('/admin/shipments', ...ownerOnly, deliveryController.listShipments);
router.post('/admin/shipments/:id/assign', ...ownerOnly, deliveryController.assignRider);
router.post('/admin/shipments/:id/auto-assign', ...ownerOnly, deliveryController.autoAssignRider);
router.put('/admin/shipments/:id/eta', ...ownerOnly, deliveryController.updateShipmentEta);
router.get('/admin/riders', ...ownerOnly, deliveryController.listRiders);
router.post('/admin/riders', ...ownerOnly, deliveryController.createRider);
router.put('/admin/riders/:id', ...ownerOnly, deliveryController.updateRider);
router.get('/admin/vehicles', ...ownerOnly, deliveryController.listVehicles);
router.post('/admin/vehicles', ...ownerOnly, deliveryController.createVehicle);
router.put('/admin/vehicles/:id', ...ownerOnly, deliveryController.updateVehicle);
router.post('/admin/zones', ...ownerOnly, deliveryController.createZone);
router.post('/admin/zones/from-psgc', ...ownerOnly, deliveryController.savePhilippineZone);
router.put('/admin/zones/:id', ...ownerOnly, deliveryController.updateZone);
router.get('/admin/cod', ...ownerOnly, deliveryController.codSummary);
router.post('/admin/shipments/:id/cod-remittance', ...ownerOnly, deliveryController.remitCod);

router.get('/rider/shipments', ...riderOnly, deliveryController.riderShipments);
router.put('/rider/shipments/:id/accept', ...riderOnly, deliveryController.acceptShipment);
router.put('/rider/shipments/:id/status', ...riderOnly, handleProofUpload, deliveryController.updateRiderShipment);
router.post('/rider/shipments/:id/location', ...riderOnly, deliveryController.updateTracking);

router.get('/customer/orders/:orderId/shipment', ...userOnly, deliveryController.customerShipment);
router.get('/shipments/:shipmentId/proof', ...userOnly, deliveryController.shipmentProof);
router.get('/notifications', ...userOnly, deliveryController.notifications);
router.put('/notifications/:id/read', ...userOnly, deliveryController.markNotificationRead);

module.exports = router;
