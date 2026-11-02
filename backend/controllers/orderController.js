const orderModel = require('../models/orderModel');
const userModel = require('../models/userModel');
const path = require('path');
const fs = require('fs');
const { proofDirectory } = require('../middleware/uploadMiddleware');

// POST /api/orders
const createOrder = async (req, res) => {
  try {
    const {
      items,
      total,
      delivery_address: deliveryAddress,
      delivery_phone: deliveryPhone,
    } = req.body;
    const userId = req.user.id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Order must have at least one item.' });
    }

    if (!total || total <= 0) {
      return res.status(400).json({ message: 'Invalid order total.' });
    }

    if (
      typeof deliveryAddress !== 'string' ||
      deliveryAddress.trim().length < 10 ||
      typeof deliveryPhone !== 'string' ||
      deliveryPhone.trim().length < 7
    ) {
      return res.status(400).json({
        message: 'A complete delivery address and phone number are required.',
      });
    }

    for (const item of items) {
      if (!item.product_id || !item.quantity || !item.price) {
        return res.status(400).json({
          message: 'Each item needs product_id, quantity, and price.',
        });
      }
    }

    const order = await orderModel.create(
      userId,
      total,
      items,
      'online',
      deliveryAddress.trim(),
      deliveryPhone.trim()
    );

    res.status(201).json({
      message: 'Order placed successfully.',
      order,
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: 'Server error creating order.' });
  }
};

// POST /api/orders/pos  (store owner in-store sale)
const createPosOrder = async (req, res) => {
  try {
    const { items, customer_id: customerId } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Sale must have at least one item.' });
    }

    let userId;
    if (customerId) {
      const customer = await userModel.findById(customerId);
      if (!customer || customer.role !== 'customer') {
        return res.status(400).json({ message: 'Selected customer was not found.' });
      }
      userId = customer.id;
    } else {
      const walkIn = await userModel.ensureWalkInCustomer();
      userId = walkIn.id;
    }

    const order = await orderModel.createPos(userId, items);

    res.status(201).json({
      message: 'POS sale completed.',
      order,
    });
  } catch (error) {
    console.error('Create POS order error:', error);
    const status = error.status || 500;
    res.status(status).json({
      message: error.status
        ? error.message
        : 'Server error completing POS sale.',
    });
  }
};

// GET /api/orders/user/:id
const getUserOrders = async (req, res) => {
  try {
    const requestedId = parseInt(req.params.id, 10);

    if (req.user.id !== requestedId) {
      return res.status(403).json({ message: 'You can only view your own orders.' });
    }

    const orders = await orderModel.getByUserId(requestedId);
    res.json(orders);
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ message: 'Server error fetching orders.' });
  }
};

// GET /api/orders
const getAllOrders = async (req, res) => {
  try {
    const orders = await orderModel.getAll();
    res.json(orders);
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({ message: 'Server error fetching orders.' });
  }
};

// PUT /api/orders/:id/delivery (store owner)
const updateDelivery = async (req, res) => {
  try {
    const orderId = Number.parseInt(req.params.id, 10);
    const { status, delivery_person_id: deliveryPersonId } = req.body;
    const allowedStatuses = [
      'pending',
      'assigned',
      'out_for_delivery',
      'delivered',
      'cancelled',
    ];

    if (!Number.isInteger(orderId) || !allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid delivery update.' });
    }

    if (deliveryPersonId !== null && deliveryPersonId !== undefined) {
      const person = await userModel.findById(deliveryPersonId);
      if (!person || person.role !== 'delivery-person') {
        return res.status(400).json({ message: 'Invalid delivery person.' });
      }
    }

    const order = await orderModel.updateDelivery(orderId, status, deliveryPersonId || null);
    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }
    res.json(order);
  } catch (error) {
    console.error('Update delivery error:', error);
    res.status(500).json({ message: 'Server error updating delivery.' });
  }
};

const getAssignedDeliveries = async (req, res) => {
  try {
    res.json(await orderModel.listAssigned(req.user.id));
  } catch (error) {
    console.error('Get assigned deliveries error:', error);
    res.status(500).json({ message: 'Server error fetching assigned deliveries.' });
  }
};

const acceptAssignedDelivery = async (req, res) => {
  try {
    const orderId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(orderId)) {
      return res.status(400).json({ message: 'Invalid order.' });
    }
    const order = await orderModel.acceptAssignedDelivery(orderId, req.user.id);
    if (!order) {
      return res.status(409).json({
        message: 'This delivery is no longer available to accept.',
      });
    }
    res.json(order);
  } catch (error) {
    console.error('Accept delivery error:', error);
    res.status(500).json({ message: 'Server error accepting delivery.' });
  }
};

const updateDeliveryLocation = async (req, res) => {
  try {
    const orderId = Number.parseInt(req.params.id, 10);
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    const accuracy = req.body.accuracy == null ? null : Number(req.body.accuracy);
    if (
      !Number.isInteger(orderId) ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180 ||
      (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0))
    ) {
      return res.status(400).json({ message: 'Invalid delivery location.' });
    }
    const location = await orderModel.recordDeliveryLocation(
      orderId,
      req.user.id,
      latitude,
      longitude,
      accuracy
    );
    if (!location) {
      return res.status(409).json({
        message: 'Location sharing is available only for your active deliveries.',
      });
    }
    res.json(location);
  } catch (error) {
    console.error('Update delivery location error:', error);
    res.status(500).json({ message: 'Server error updating delivery location.' });
  }
};

const getDeliveryLocation = async (req, res) => {
  try {
    const orderId = Number.parseInt(req.params.id, 10);
    const location = await orderModel.getDeliveryLocation(orderId);
    if (!location) return res.status(404).json({ message: 'Delivery location not found.' });
    const allowed =
      req.user.role === 'store-owner' ||
      req.user.id === location.user_id ||
      req.user.id === location.delivery_person_id;
    if (!allowed) return res.status(403).json({ message: 'You cannot view this location.' });
    res.json(location);
  } catch (error) {
    console.error('Get delivery location error:', error);
    res.status(500).json({ message: 'Server error fetching delivery location.' });
  }
};

const updateAssignedDelivery = async (req, res) => {
  let uploadedPath = null;
  try {
    uploadedPath = req.file?.path || null;
    const orderId = Number.parseInt(req.params.id, 10);
    const {
      status,
      recipient_name: recipientName,
      proof_confirmed: proofConfirmed,
    } = req.body;
    const proofConfirmedValue = proofConfirmed === true || proofConfirmed === 'true';
    const allowedStatuses = ['assigned', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!Number.isInteger(orderId) || !allowedStatuses.includes(status)) {
      if (uploadedPath) fs.unlink(uploadedPath, () => {});
      return res.status(400).json({ message: 'Invalid delivery status.' });
    }

    if (status === 'delivered') {
      if (
        typeof recipientName !== 'string' ||
        recipientName.trim().length < 2 ||
        recipientName.trim().length > 100 ||
        !proofConfirmedValue
      ) {
        if (uploadedPath) fs.unlink(uploadedPath, () => {});
        return res.status(400).json({
          message: 'Recipient name and delivery confirmation are required.',
        });
      }
    }

    const order = await orderModel.updateAssignedStatus(
      orderId,
      req.user.id,
      status,
      status === 'delivered' ? recipientName.trim() : null,
      status === 'delivered',
      status === 'delivered' ? req.file?.filename || null : null
    );
    if (!order) {
      if (uploadedPath) fs.unlink(uploadedPath, () => {});
      return res.status(404).json({ message: 'Assigned order not found.' });
    }
    res.json(order);
  } catch (error) {
    if (uploadedPath) fs.unlink(uploadedPath, () => {});
    console.error('Update assigned delivery error:', error);
    res.status(500).json({ message: 'Server error updating delivery status.' });
  }
};

const getProofPhoto = async (req, res) => {
  try {
    const eventId = Number.parseInt(req.params.eventId, 10);
    const proof = await orderModel.getProofPhoto(eventId);
    if (!proof) {
      return res.status(404).json({ message: 'Proof photo not found.' });
    }

    const allowed =
      req.user.role === 'store-owner' ||
      req.user.id === proof.user_id ||
      req.user.id === proof.delivery_person_id;
    if (!allowed) {
      return res.status(403).json({ message: 'You cannot view this proof photo.' });
    }

    res.sendFile(path.basename(proof.photo_filename), { root: proofDirectory });
  } catch (error) {
    console.error('Get proof photo error:', error);
    res.status(500).json({ message: 'Server error fetching proof photo.' });
  }
};

module.exports = {
  createOrder,
  createPosOrder,
  getUserOrders,
  getAllOrders,
  updateDelivery,
  getAssignedDeliveries,
  acceptAssignedDelivery,
  updateDeliveryLocation,
  getDeliveryLocation,
  updateAssignedDelivery,
  getProofPhoto,
};
