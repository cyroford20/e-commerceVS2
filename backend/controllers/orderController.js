const orderModel = require('../models/orderModel');
const userModel = require('../models/userModel');
const path = require('path');
const fs = require('fs');
const { proofDirectory } = require('../middleware/uploadMiddleware');
const parseId = (value) => {
  if (!/^[1-9]\d*$/.test(String(value || ''))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
};

// POST /api/orders
const createOrder = async (req, res) => {
  try {
    const {
      items,
      delivery_address: deliveryAddress,
      delivery_phone: deliveryPhone,
      delivery_zone_id: deliveryZoneId,
      delivery_instructions: deliveryInstructions,
      payment_method: paymentMethod = 'cod',
      coupon_code: couponCode = null,
    } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
      return res.status(400).json({ message: 'Order must have at least one item.' });
    }

    if (
      typeof deliveryAddress !== 'string' ||
      deliveryAddress.trim().length < 10 || deliveryAddress.trim().length > 2000 ||
      typeof deliveryPhone !== 'string' ||
      deliveryPhone.trim().length < 7 || deliveryPhone.trim().length > 30
    ) {
      return res.status(400).json({
        message: 'A complete delivery address and phone number are required.',
      });
    }

    for (const item of items) {
      if (!item || !Number.isSafeInteger(Number(item.product_id)) || Number(item.product_id) < 1 ||
          !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) < 1) {
        return res.status(400).json({
          message: 'Each item needs a valid product and positive whole-number quantity.',
        });
      }
    }

    if (!Number.isSafeInteger(Number(deliveryZoneId)) || Number(deliveryZoneId) < 1) {
      return res.status(400).json({ message: 'Choose a delivery zone.' });
    }
    if (paymentMethod !== 'cod') {
      return res.status(400).json({ message: 'Cash on delivery is the available payment method.' });
    }
    if (couponCode != null && (
      typeof couponCode !== 'string' || !couponCode.trim() || couponCode.trim().length > 64
    )) {
      return res.status(400).json({ message: 'Enter a valid coupon code.' });
    }

    const order = await orderModel.create(
      userId,
      items,
      deliveryAddress.trim(),
      deliveryPhone.trim(),
      Number(deliveryZoneId),
      typeof deliveryInstructions === 'string' ? deliveryInstructions.trim().slice(0, 1000) : null,
      paymentMethod,
      typeof couponCode === 'string' ? couponCode.trim() : null
    );

    res.status(201).json({
      message: 'Order placed successfully.',
      order,
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(error.status || 500).json({
      message: error.status ? error.message : 'Server error creating order.',
    });
  }
};

// POST /api/orders/pos  (store owner in-store sale)
const createPosOrder = async (req, res) => {
  try {
    const {
      items,
      customer_id: customerId,
      amount_tendered: amountTendered,
      coupon_code: couponCode,
      manual_discount_amount: manualDiscountAmount,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
      return res.status(400).json({ message: 'Sale must have at least one item.' });
    }

    if (couponCode != null && (
      typeof couponCode !== 'string' || !couponCode.trim() || couponCode.trim().length > 64
    )) {
      return res.status(400).json({ message: 'Enter a valid coupon code.' });
    }

    let userId;
    let registeredCustomerId = null;
    if (customerId !== null && customerId !== undefined && String(customerId).trim() !== '') {
      const id = Number(customerId);
      if (!Number.isSafeInteger(id) || id < 1) {
        return res.status(400).json({ message: 'Selected customer was not found.' });
      }
      const customer = await userModel.findById(id);
      if (!customer || customer.role !== 'customer') {
        return res.status(400).json({ message: 'Selected customer was not found.' });
      }
      userId = customer.id;
      registeredCustomerId = customer.id;
    } else {
      const walkIn = await userModel.ensureWalkInCustomer();
      userId = walkIn.id;
    }

    const order = await orderModel.createPos(userId, items, {
      customerId: registeredCustomerId,
      amountTendered,
      couponCode: typeof couponCode === 'string' ? couponCode.trim() : null,
      manualDiscountAmount,
    });

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
    const requestedId = parseId(req.params.id);

    if (!requestedId) return res.status(400).json({ message: 'Invalid customer ID.' });
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
    const orderId = parseId(req.params.id);
    const { status, delivery_person_id: deliveryPersonId } = req.body;
    const allowedStatuses = [
      'pending',
      'assigned',
      'out_for_delivery',
      'delivered',
      'cancelled',
    ];

    if (!orderId || !allowedStatuses.includes(status)) {
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
    const orderId = parseId(req.params.id);
    if (!orderId) {
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
    const orderId = parseId(req.params.id);
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    const accuracy = req.body.accuracy == null ? null : Number(req.body.accuracy);
    if (
      !orderId ||
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
    const orderId = parseId(req.params.id);
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
    const orderId = parseId(req.params.id);
    const {
      status,
      recipient_name: recipientName,
      proof_confirmed: proofConfirmed,
    } = req.body;
    const proofConfirmedValue = proofConfirmed === true || proofConfirmed === 'true';
    const allowedStatuses = ['assigned', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!orderId || !allowedStatuses.includes(status)) {
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
    const eventId = parseId(req.params.eventId);
    if (!eventId) return res.status(400).json({ message: 'Invalid proof ID.' });
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

const legacyDeliveryMutation = (req, res) => res.status(410).json({
  message: 'This delivery workflow has been replaced. Use the shipment delivery module for verified status updates.',
});

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
  legacyDeliveryMutation,
};
