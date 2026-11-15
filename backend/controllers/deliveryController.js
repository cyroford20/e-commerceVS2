const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { proofDirectory, validateProofPhotoFile } = require('../middleware/uploadMiddleware');
const deliveryModel = require('../models/deliveryModel');

const parseId = (value) => {
  if (!/^[1-9]\d*$/.test(String(value || ''))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
};

const sendError = (res, error, fallback) => {
  if (error.code === '23505') return res.status(409).json({ message: 'That record already exists.' });
  console.error(fallback, error);
  res.status(error.status || 500).json({ message: error.status ? error.message : fallback });
};
const validMoney = (amount) => Number.isFinite(amount) && amount >= 0 && amount <= 99999999.99;

const listZones = async (req, res) => {
  try {
    res.json(await deliveryModel.getZones(req.query.all !== 'true'));
  } catch (error) {
    sendError(res, error, 'Could not load delivery zones. Run database/delivery_management.sql first.');
  }
};

const searchPhilippineBarangays = async (req, res) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (query.length < 2 || query.length > 100) {
      return res.status(400).json({ message: 'Enter at least two characters to search barangays.' });
    }
    res.json(await deliveryModel.searchPhilippineBarangays(query));
  } catch (error) {
    sendError(res, error, 'Could not search Philippine barangays.');
  }
};

const savePhilippineZone = async (req, res) => {
  try {
    const psgcCode = typeof req.body.psgc_code === 'string' ? req.body.psgc_code.trim() : '';
    const fee = Number(req.body.delivery_fee);
    const active = req.body.active === undefined ? true : req.body.active;
    if (!/^\d{10}$/.test(psgcCode) || !validMoney(fee) || typeof active !== 'boolean') {
      return res.status(400).json({ message: 'Provide a valid PSGC barangay code, delivery fee, and active flag.' });
    }
    const zone = await deliveryModel.savePhilippineDeliveryZone({
      psgcCode, deliveryFee: fee, active,
    });
    if (!zone) return res.status(404).json({ message: 'Barangay was not found in the Philippine location list.' });
    res.json(zone);
  } catch (error) {
    sendError(res, error, 'Could not save delivery zone.');
  }
};

const createZone = async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const city = typeof req.body.city === 'string' ? req.body.city.trim() : '';
    const barangay = typeof req.body.barangay === 'string' ? req.body.barangay.trim() : '';
    const fee = Number(req.body.delivery_fee);
    if (!name || name.length > 100 || !city || city.length > 100 ||
        !barangay || barangay.length > 100 || !validMoney(fee)) {
      return res.status(400).json({ message: 'Name, city, barangay, and a non-negative delivery fee are required.' });
    }
    res.status(201).json(await deliveryModel.createZone({ name, city, barangay, deliveryFee: fee }));
  } catch (error) {
    sendError(res, error, 'Could not create delivery zone.');
  }
};

const updateZone = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const city = typeof req.body.city === 'string' ? req.body.city.trim() : '';
    const barangay = typeof req.body.barangay === 'string' ? req.body.barangay.trim() : '';
    const fee = Number(req.body.delivery_fee);
    if (!id || !name || name.length > 240 || !city || city.length > 100 ||
        !barangay || barangay.length > 100 ||
        !validMoney(fee) || typeof req.body.active !== 'boolean') {
      return res.status(400).json({ message: 'Provide a valid zone name, city, barangay, fee, and active flag.' });
    }
    const zone = await deliveryModel.updateZone(id, {
      name, city, barangay,
      deliveryFee: fee, active: req.body.active,
    });
    if (!zone) return res.status(404).json({ message: 'Delivery zone not found.' });
    res.json(zone);
  } catch (error) {
    sendError(res, error, 'Could not update delivery zone.');
  }
};

const listVehicles = async (req, res) => {
  try { res.json(await deliveryModel.listVehicles()); }
  catch (error) { sendError(res, error, 'Could not load vehicles.'); }
};

const createVehicle = async (req, res) => {
  try {
    const plateNumber = String(req.body.plate_number || '').trim().toUpperCase();
    const description = String(req.body.description || '').trim();
    if (!plateNumber || plateNumber.length > 24 || description.length > 120) {
      return res.status(400).json({ message: 'Provide a plate number (24 characters max) and description (120 characters max).' });
    }
    res.status(201).json(await deliveryModel.createVehicle({ plateNumber, description }));
  } catch (error) { sendError(res, error, 'Could not create vehicle.'); }
};

const updateVehicle = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const plateNumber = String(req.body.plate_number || '').trim().toUpperCase();
    if (!id || !plateNumber || plateNumber.length > 24 || String(req.body.description || '').trim().length > 120 ||
        typeof req.body.active !== 'boolean') {
      return res.status(400).json({ message: 'Provide a plate number and active flag.' });
    }
    const vehicle = await deliveryModel.updateVehicle(id, {
      plateNumber, description: String(req.body.description || '').trim(), active: req.body.active,
    });
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });
    res.json(vehicle);
  } catch (error) { sendError(res, error, 'Could not update vehicle.'); }
};

const listRiders = async (req, res) => {
  try { res.json(await deliveryModel.listRiders()); }
  catch (error) { sendError(res, error, 'Could not load riders.'); }
};

const createRider = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const phone = String(req.body.phone || '').trim();
    const vehicleId = req.body.vehicle_id ? parseId(req.body.vehicle_id) : null;
    const zoneIds = Array.isArray(req.body.zone_ids) ? req.body.zone_ids.map(parseId) : [];
    if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100 ||
        password.length < 8 || Buffer.byteLength(password, 'utf8') > 72 || phone.length > 30 ||
        (req.body.vehicle_id && !vehicleId) || zoneIds.some((id) => !id)) {
      return res.status(400).json({ message: 'Provide a name, valid email, 8-character password, and valid vehicle/zone IDs.' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const rider = await deliveryModel.createRider({ name, email, passwordHash, phone, vehicleId, zoneIds });
    res.status(201).json(rider);
  } catch (error) { sendError(res, error, 'Could not create rider account.'); }
};

const updateRider = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const vehicleId = req.body.vehicle_id ? parseId(req.body.vehicle_id) : null;
    const zoneIds = Array.isArray(req.body.zone_ids) ? req.body.zone_ids.map(parseId) : [];
    const availability = req.body.availability || 'available';
    if (!id || !String(req.body.name || '').trim() || String(req.body.name || '').trim().length > 100 ||
        String(req.body.phone || '').trim().length > 30 || typeof req.body.active !== 'boolean' ||
        !['available', 'busy', 'unavailable'].includes(availability) ||
        (req.body.vehicle_id && !vehicleId) || zoneIds.some((zoneId) => !zoneId)) {
      return res.status(400).json({ message: 'Provide valid rider details, status, vehicle, and coverage zones.' });
    }
    const rider = await deliveryModel.updateRider(id, {
      name: String(req.body.name).trim(), phone: String(req.body.phone || '').trim(),
      vehicleId, active: req.body.active, availability, zoneIds,
    });
    if (!rider) return res.status(404).json({ message: 'Rider not found.' });
    res.json(rider);
  } catch (error) { sendError(res, error, 'Could not update rider.'); }
};

const dashboard = async (req, res) => {
  try { res.json(await deliveryModel.getDashboard()); }
  catch (error) { sendError(res, error, 'Could not load delivery dashboard.'); }
};

const listShipments = async (req, res) => {
  try {
    const status = String(req.query.status || '').trim();
    const search = String(req.query.search || '').trim().slice(0, 100);
    res.json(await deliveryModel.listShipments({ status, search }));
  } catch (error) { sendError(res, error, 'Could not load shipments.'); }
};

const assignRider = async (req, res) => {
  try {
    const shipmentId = parseId(req.params.id);
    const riderId = parseId(req.body.rider_id);
    if (!shipmentId || !riderId) return res.status(400).json({ message: 'A valid shipment and rider are required.' });
    res.json(await deliveryModel.assignRider(shipmentId, riderId, req.user.id));
  } catch (error) { sendError(res, error, 'Could not assign rider.'); }
};

const autoAssignRider = async (req, res) => {
  try {
    const shipmentId = parseId(req.params.id);
    if (!shipmentId) return res.status(400).json({ message: 'Invalid shipment.' });
    res.json(await deliveryModel.autoAssignRider(shipmentId, req.user.id));
  } catch (error) { sendError(res, error, 'Could not automatically assign a rider.'); }
};

const updateShipmentEta = async (req, res) => {
  try {
    const shipmentId = parseId(req.params.id);
    const date = new Date(req.body.estimated_delivery_at);
    if (!shipmentId || !req.body.estimated_delivery_at || Number.isNaN(date.getTime())) {
      return res.status(400).json({ message: 'Provide a valid estimated delivery date and time.' });
    }
    res.json(await deliveryModel.updateShipmentEta(shipmentId, req.user.id, date.toISOString()));
  } catch (error) { sendError(res, error, 'Could not update estimated delivery time.'); }
};

const riderShipments = async (req, res) => {
  try { res.json(await deliveryModel.listRiderShipments(req.user.id)); }
  catch (error) { sendError(res, error, 'Could not load assigned shipments.'); }
};

const acceptShipment = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid shipment.' });
    res.json(await deliveryModel.acceptShipment(id, req.user.id));
  } catch (error) { sendError(res, error, 'Could not accept shipment.'); }
};

const updateRiderShipment = async (req, res) => {
  let uploadedPath = req.file?.path || null;
  try {
    if (req.file && !(await validateProofPhotoFile(req.file))) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ message: 'Proof photo content must be a valid JPEG, PNG, or WebP image.' });
    }
    uploadedPath = req.file?.path || null;
    const id = parseId(req.params.id);
    const { status, otp, recipient_name: recipientName, proof_confirmed: proofConfirmed, failure_reason: failureReason,
      rescheduled_for: rescheduledFor, actual_cod: actualCod, note } = req.body;
    if (!id || !status) {
      if (uploadedPath) fs.unlink(uploadedPath, () => {});
      return res.status(400).json({ message: 'A valid shipment and status are required.' });
    }
    if (uploadedPath && status !== 'delivered') {
      fs.unlink(uploadedPath, () => {});
      return res.status(400).json({ message: 'A proof photo can only be attached when delivery is completed.' });
    }
    const result = await deliveryModel.updateRiderShipment(id, req.user.id, {
      status, otp, recipientName, proofConfirmed, failureReason, rescheduledFor, actualCod, note,
      photoFilename: req.file?.filename || null,
    });
    res.json(result);
  } catch (error) {
    if (uploadedPath) fs.unlink(uploadedPath, () => {});
    sendError(res, error, 'Could not update shipment.');
  }
};

const updateTracking = async (req, res) => {
  try {
    const shipmentId = parseId(req.params.id);
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    const accuracy = req.body.accuracy == null ? null : Number(req.body.accuracy);
    if (!shipmentId || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
        (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0))) {
      return res.status(400).json({ message: 'Invalid GPS coordinates.' });
    }
    const location = await deliveryModel.recordTracking(shipmentId, req.user.id, { latitude, longitude, accuracy });
    if (!location) return res.status(409).json({ message: 'Location sharing is only available for your active shipment.' });
    res.json(location);
  } catch (error) { sendError(res, error, 'Could not save rider location.'); }
};

const customerShipment = async (req, res) => {
  try {
    const orderId = parseId(req.params.orderId);
    if (!orderId) return res.status(400).json({ message: 'Invalid order.' });
    const shipment = await deliveryModel.getShipmentForCustomer(orderId, req.user.id);
    if (!shipment) return res.status(404).json({ message: 'Shipment not found.' });
    const tracking = await deliveryModel.getTracking(shipment.id);
    res.json({ ...shipment, tracking });
  } catch (error) { sendError(res, error, 'Could not load shipment details.'); }
};

const shipmentProof = async (req, res) => {
  try {
    const shipmentId = parseId(req.params.shipmentId);
    if (!shipmentId) return res.status(400).json({ message: 'Invalid shipment.' });
    const proof = await deliveryModel.getShipmentProof(shipmentId);
    if (!proof?.photo_filename) return res.status(404).json({ message: 'Proof photo not found.' });
    const allowed = req.user.role === 'store-owner' || req.user.id === proof.user_id || req.user.id === proof.rider_user_id;
    if (!allowed) return res.status(403).json({ message: 'You cannot view this proof photo.' });
    res.sendFile(path.basename(proof.photo_filename), { root: proofDirectory });
  } catch (error) { sendError(res, error, 'Could not load proof photo.'); }
};

const notifications = async (req, res) => {
  try { res.json(await deliveryModel.listNotifications(req.user.id)); }
  catch (error) { sendError(res, error, 'Could not load notifications.'); }
};

const markNotificationRead = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid notification.' });
    if (!(await deliveryModel.markNotificationRead(id, req.user.id))) {
      return res.status(404).json({ message: 'Notification not found.' });
    }
    res.status(204).end();
  } catch (error) { sendError(res, error, 'Could not update notification.'); }
};

const remitCod = async (req, res) => {
  try {
    const shipmentId = parseId(req.params.id);
    const amount = Number(req.body.actual_amount);
    if (!shipmentId || !validMoney(amount)) {
      return res.status(400).json({ message: 'Provide a valid remitted amount.' });
    }
    res.json(await deliveryModel.remitCod(shipmentId, req.user.id, amount, req.body.notes));
  } catch (error) { sendError(res, error, 'Could not record COD remittance.'); }
};

const codSummary = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : today;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : today;
    res.json(await deliveryModel.getCodSummary(from, to));
  } catch (error) { sendError(res, error, 'Could not load COD report.'); }
};

module.exports = {
  listZones, searchPhilippineBarangays, savePhilippineZone, createZone, updateZone, listVehicles, createVehicle, updateVehicle,
  listRiders, createRider, updateRider, dashboard, listShipments,
  assignRider, autoAssignRider, riderShipments, acceptShipment,
  updateShipmentEta,
  updateRiderShipment, updateTracking, customerShipment,
  shipmentProof,
  notifications, markNotificationRead, remitCod, codSummary,
};
