const pool = require('../config/db');
const deliveryModel = require('./deliveryModel');
const couponModel = require('./couponModel');
const { moneyToCents, tenderChangeCents } = require('../utils/couponRules');
const asMoney = (cents) => (cents / 100).toFixed(2);
const MAX_MONEY_CENTS = 9999999999;

// Ensure channel column exists on older databases
const ensureChannelColumn = async () => {
  await pool.query(
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'online'`
  );
  await pool.query(
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_accepted_at TIMESTAMP`
  );
  await pool.query(`
    ALTER TABLE order_delivery_events
      ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS proof_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS photo_filename VARCHAR(255)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_delivery_locations (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      delivery_person_id INTEGER NOT NULL REFERENCES users(id),
      latitude NUMERIC(9, 6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
      longitude NUMERIC(9, 6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
      accuracy NUMERIC(10, 2),
      recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS order_delivery_locations_latest_idx
    ON order_delivery_locations(order_id, recorded_at DESC)
  `);
};

let channelReady = false;
const readyChannel = async () => {
  if (channelReady) return;
  await ensureChannelColumn();
  channelReady = true;
};

// Create a new order with items
const create = async (
  userId,
  items,
  deliveryAddress,
  deliveryPhone,
  deliveryZoneId,
  deliveryInstructions = null,
  paymentMethod = 'cod',
  couponCode = null
) => {
  await readyChannel();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const zoneResult = await client.query(
      `SELECT id, delivery_fee FROM delivery_zones WHERE id = $1 AND active = TRUE FOR SHARE`,
      [deliveryZoneId]
    );
    const zone = zoneResult.rows[0];
    if (!zone) {
      const err = new Error('Choose an active delivery zone.');
      err.status = 400;
      throw err;
    }

    const requestedQuantities = new Map();
    for (const item of items) {
      const productId = Number(item.product_id);
      const quantity = Number(item.quantity);
      if (!Number.isSafeInteger(productId) || productId < 1 ||
          !Number.isSafeInteger(quantity) || quantity < 1) {
        const err = new Error('Each item needs a valid product and quantity.');
        err.status = 400;
        throw err;
      }
      requestedQuantities.set(productId, (requestedQuantities.get(productId) || 0) + quantity);
    }

    const pricedItems = [];
    let itemsTotalCents = 0;
    for (const [productId, quantity] of requestedQuantities) {
      const productResult = await client.query(
        `SELECT id, price, stock FROM products WHERE id = $1 AND active = TRUE FOR UPDATE`, [productId]
      );
      const product = productResult.rows[0];
      if (!product) {
        const err = new Error(`Product #${productId} was not found.`);
        err.status = 404;
        throw err;
      }
      if (Number(product.stock) < quantity) {
        const err = new Error(`Not enough stock for product #${productId}.`);
        err.status = 409;
        throw err;
      }
      const priceCents = moneyToCents(product.price);
      itemsTotalCents += priceCents * quantity;
      pricedItems.push({ productId, quantity, price: asMoney(priceCents) });
    }
    if (itemsTotalCents > MAX_MONEY_CENTS) {
      const err = new Error('The order subtotal exceeds the supported payment amount.');
      err.status = 400;
      throw err;
    }
    const coupon = couponCode
      ? await couponModel.getCouponDiscount(client, {
        code: couponCode,
        customerId: userId,
        subtotalCents: itemsTotalCents,
        lock: true,
      })
      : null;
    const discountCents = coupon?.discountCents || 0;
    const deliveryFeeCents = moneyToCents(zone.delivery_fee);
    const orderTotalCents = itemsTotalCents - discountCents + deliveryFeeCents;
    if (orderTotalCents > MAX_MONEY_CENTS) {
      const err = new Error('The order total exceeds the supported payment amount.');
      err.status = 400;
      throw err;
    }
    const orderTotal = asMoney(orderTotalCents);

    const orderResult = await client.query(
      `INSERT INTO orders
       (user_id, total, subtotal, discount_amount, coupon_code, channel, delivery_address, delivery_phone, delivery_zone_id,
        delivery_fee, delivery_instructions, payment_method, payment_status, delivery_status)
       VALUES ($1, $2, $3, $4, $5, 'online', $6, $7, $8, $9, $10, $11, 'pending', 'ready_for_delivery')
       RETURNING *`,
      [
        userId,
        orderTotal,
        asMoney(itemsTotalCents),
        asMoney(discountCents),
        coupon?.code || null,
        deliveryAddress,
        deliveryPhone,
        zone.id,
        asMoney(deliveryFeeCents),
        deliveryInstructions,
        paymentMethod,
      ]
    );
    const order = orderResult.rows[0];
    await client.query(
      `INSERT INTO order_delivery_events (order_id, status, note)
       VALUES ($1, 'ready_for_delivery', 'Order received; shipment ready for dispatch')`,
      [order.id]
    );

    for (const item of pricedItems) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
        [order.id, item.productId, item.quantity, item.price]
      );

      await client.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1',
        [item.quantity, item.productId]
      );
    }

    const shipment = await deliveryModel.createShipmentForOrder(
      client, order, zone.id, deliveryFeeCents / 100, paymentMethod
    );

    if (coupon) await couponModel.recordRedemption(client, coupon, userId, order.id);
    await client.query('COMMIT');
    return { ...order, shipment, delivery_otp: shipment.delivery_otp };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// POS sale: price + stock checked from DB inside a transaction
const createPos = async (userId, items, {
  customerId = null,
  amountTendered,
  couponCode = null,
  manualDiscountAmount = null,
} = {}) => {
  await readyChannel();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let subtotalCents = 0;
    const pricedItems = [];

    for (const item of items) {
      const quantity = Number(item.quantity);
      const productId = Number(item.product_id);

      if (!Number.isSafeInteger(productId) || productId < 1 ||
          !Number.isSafeInteger(quantity) || quantity < 1) {
        const err = new Error('Each item needs a valid product_id and quantity.');
        err.status = 400;
        throw err;
      }

      const productResult = await client.query(
        'SELECT id, name, price, stock FROM products WHERE id = $1 AND active = TRUE FOR UPDATE',
        [productId]
      );
      const product = productResult.rows[0];

      if (!product) {
        const err = new Error(`Product #${productId} was not found.`);
        err.status = 404;
        throw err;
      }

      if (Number(product.stock) < quantity) {
        const err = new Error(
          `Not enough stock for ${product.name}. Available: ${product.stock}.`
        );
        err.status = 400;
        throw err;
      }

      const priceCents = moneyToCents(product.price);
      subtotalCents += priceCents * quantity;
      pricedItems.push({
        product_id: product.id,
        quantity,
        price: asMoney(priceCents),
      });
    }
    if (subtotalCents > MAX_MONEY_CENTS) {
      const err = new Error('The sale subtotal exceeds the supported payment amount.');
      err.status = 400;
      throw err;
    }

    const hasManualDiscount = manualDiscountAmount !== null &&
      manualDiscountAmount !== undefined && String(manualDiscountAmount).trim() !== '';
    if (couponCode && hasManualDiscount) {
      const err = new Error('Apply either a coupon or a manual discount, not both.');
      err.status = 400;
      throw err;
    }

    let coupon = null;
    let discountCents = 0;
    if (couponCode) {
      coupon = await couponModel.getCouponDiscount(client, {
        code: couponCode,
        customerId,
        subtotalCents,
        lock: true,
      });
      discountCents = coupon.discountCents;
    } else if (hasManualDiscount) {
      discountCents = moneyToCents(manualDiscountAmount);
      if (discountCents === null || discountCents > subtotalCents) {
        const err = new Error('Enter a valid discount no greater than the sale subtotal.');
        err.status = 400;
        throw err;
      }
    }

    const totalDueCents = subtotalCents - discountCents;
    const changeCents = tenderChangeCents(asMoney(totalDueCents), amountTendered);
    if (changeCents === null) {
      const err = new Error(totalDueCents === 0
        ? 'Enter a valid cash amount received (0.00 is valid for a zero-total sale).'
        : 'Amount received must be valid and at least the total due.');
      err.status = 400;
      throw err;
    }
    const tenderedCents = moneyToCents(amountTendered);
    if (tenderedCents > MAX_MONEY_CENTS) {
      const err = new Error('Amount received exceeds the supported payment amount.');
      err.status = 400;
      throw err;
    }

    const orderResult = await client.query(
      `INSERT INTO orders
       (user_id, total, subtotal, discount_amount, coupon_code, channel,
        payment_method, payment_status, delivery_status, completed_at)
       VALUES ($1, $2, $3, $4, $5, 'pos', 'cash', 'paid', 'delivered', CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        userId,
        asMoney(totalDueCents),
        asMoney(subtotalCents),
        asMoney(discountCents),
        coupon?.code || null,
      ]
    );
    const order = orderResult.rows[0];
    await client.query(
      `INSERT INTO order_delivery_events (order_id, status, note)
       VALUES ($1, 'delivered', 'POS order completed')`,
      [order.id]
    );

    for (const item of pricedItems) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
        [order.id, item.product_id, item.quantity, item.price]
      );

      const stockResult = await client.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING id',
        [item.quantity, item.product_id]
      );

      if (!stockResult.rows[0]) {
        const err = new Error('Stock changed during checkout. Try again.');
        err.status = 409;
        throw err;
      }
    }

    await client.query(
      `INSERT INTO order_payments
       (order_id, payment_method, amount_due, amount_tendered, change_amount)
       VALUES ($1, 'cash', $2, $3, $4)`,
      [order.id, asMoney(totalDueCents), asMoney(tenderedCents), asMoney(changeCents)]
    );
    if (coupon) await couponModel.recordRedemption(client, coupon, customerId, order.id);
    if (customerId) {
      await couponModel.issueRewardsForCustomer(client, customerId, order.completed_at);
    }

    await client.query('COMMIT');
    return {
      ...order,
      payment: {
        payment_method: 'cash',
        amount_due: asMoney(totalDueCents),
        amount_tendered: asMoney(tenderedCents),
        change_amount: asMoney(changeCents),
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const attachItems = async (orders) => {
  for (const order of orders) {
    const itemsResult = await pool.query(
      `SELECT oi.*, p.name AS product_name, p.image_url
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1`,
      [order.id]
    );
    order.items = itemsResult.rows;
    const timelineResult = await pool.query(
      `SELECT e.id, e.status, e.note, e.created_at,
             u.name AS delivery_person, e.recipient_name, e.proof_confirmed,
             e.photo_filename
       FROM order_delivery_events e
       LEFT JOIN users u ON u.id = e.delivery_person_id
       WHERE e.order_id = $1
       ORDER BY e.created_at ASC, e.id ASC`,
      [order.id]
    );
    order.delivery_timeline = timelineResult.rows;
    const shipmentResult = await pool.query(
      `SELECT s.id, s.shipment_code, s.status, s.delivery_fee, s.expected_cod,
              s.actual_cod, s.cod_remitted_at, s.created_at, s.estimated_delivery_at,
              z.name AS zone_name, z.city, z.barangay
       FROM shipments s LEFT JOIN delivery_zones z ON z.id = s.delivery_zone_id
       WHERE s.order_id = $1 LIMIT 1`,
      [order.id]
    );
    order.shipment = shipmentResult.rows[0] || null;
    if (order.shipment) {
      const shipmentHistory = await pool.query(
        `SELECT 'shipment-' || e.id::text AS id, e.status, e.note, e.created_at,
                actor.name AS delivery_person, p.recipient_name, (p.shipment_id IS NOT NULL) AS proof_confirmed,
                p.photo_filename
         FROM shipment_events e
         LEFT JOIN users actor ON actor.id = e.actor_user_id
         LEFT JOIN proof_of_delivery p ON p.shipment_id = e.shipment_id AND e.status = 'delivered'
         WHERE e.shipment_id = $1 ORDER BY e.created_at, e.id`,
        [order.shipment.id]
      );
      order.delivery_timeline = [...order.delivery_timeline, ...shipmentHistory.rows]
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }
    const locationResult = await pool.query(
      order.shipment
        ? `SELECT latitude, longitude, accuracy, recorded_at
           FROM delivery_tracking WHERE shipment_id = $1 ORDER BY recorded_at DESC LIMIT 1`
        : `SELECT latitude, longitude, accuracy, recorded_at
           FROM order_delivery_locations WHERE order_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [order.shipment ? order.shipment.id : order.id]
    );
    order.delivery_location = locationResult.rows[0] || null;
    const paymentResult = await pool.query(
      `SELECT payment_method, amount_due, amount_tendered, change_amount, collected_at
       FROM order_payments WHERE order_id = $1`,
      [order.id]
    );
    order.payment = paymentResult.rows[0] || null;
  }
  return orders;
};

const recordDeliveryLocation = async (
  orderId,
  deliveryPersonId,
  latitude,
  longitude,
  accuracy = null
) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const active = await client.query(
      `SELECT 1 FROM orders
       WHERE id = $1 AND delivery_person_id = $2
         AND delivery_status = 'out_for_delivery'`,
      [orderId, deliveryPersonId]
    );
    if (!active.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query('DELETE FROM order_delivery_locations WHERE order_id = $1', [orderId]);
    const result = await client.query(
      `INSERT INTO order_delivery_locations
         (order_id, delivery_person_id, latitude, longitude, accuracy)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING latitude, longitude, accuracy, recorded_at`,
      [orderId, deliveryPersonId, latitude, longitude, accuracy]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const getDeliveryLocation = async (orderId) => {
  const result = await pool.query(
    `SELECT l.latitude, l.longitude, l.accuracy, l.recorded_at,
            o.user_id, o.delivery_person_id, o.delivery_address
     FROM order_delivery_locations l
     JOIN orders o ON o.id = l.order_id
     WHERE l.order_id = $1
     ORDER BY l.recorded_at DESC
     LIMIT 1`,
    [orderId]
  );
  return result.rows[0] || null;
};

const getByUserId = async (userId) => {
  await readyChannel();
  const ordersResult = await pool.query(
    'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return attachItems(ordersResult.rows);
};

const getAll = async () => {
  await readyChannel();
  const ordersResult = await pool.query(
    `SELECT o.*, u.name AS customer_name, u.email AS customer_email
     FROM orders o
     JOIN users u ON u.id = o.user_id
     ORDER BY o.created_at DESC`
  );
  return attachItems(ordersResult.rows);
};

const listAssigned = async (deliveryPersonId) => {
  await readyChannel();
  const ordersResult = await pool.query(
    `SELECT o.*, u.name AS customer_name, u.email AS customer_email
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.delivery_person_id = $1
     ORDER BY o.created_at DESC`,
    [deliveryPersonId]
  );
  return attachItems(ordersResult.rows);
};

const acceptAssignedDelivery = async (orderId, deliveryPersonId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE orders
       SET delivery_accepted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND delivery_person_id = $2
         AND delivery_status = 'assigned'
         AND delivery_accepted_at IS NULL
       RETURNING *`,
      [orderId, deliveryPersonId]
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(
      `INSERT INTO order_delivery_events
       (order_id, status, delivery_person_id, note)
       VALUES ($1, 'assigned', $2, 'Courier accepted delivery assignment')`,
      [orderId, deliveryPersonId]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const updateDelivery = async (orderId, status, deliveryPersonId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE orders
       SET delivery_status = $1,
           delivery_person_id = $2,
           delivery_person = (SELECT name FROM users WHERE id = $2)
       WHERE id = $3
       RETURNING *`,
      [status, deliveryPersonId || null, orderId]
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(
      `INSERT INTO order_delivery_events
       (order_id, status, delivery_person_id, note)
       VALUES ($1, $2, $3, $4)`,
      [orderId, status, deliveryPersonId || null, deliveryPersonId ? 'Delivery assignment updated' : 'Courier unassigned']
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const updateAssignedStatus = async (
  orderId,
  deliveryPersonId,
  status,
  recipientName = null,
  proofConfirmed = false,
  photoFilename = null
) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE orders
       SET delivery_status = $1
       WHERE id = $2 AND delivery_person_id = $3
       RETURNING *`,
      [status, orderId, deliveryPersonId]
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(
      `INSERT INTO order_delivery_events
       (order_id, status, delivery_person_id, note, recipient_name, proof_confirmed, photo_filename)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        orderId,
        status,
        deliveryPersonId,
        status === 'delivered' ? 'Proof of delivery confirmed' : 'Courier updated delivery status',
        recipientName,
        proofConfirmed,
        photoFilename,
      ]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const getProofPhoto = async (eventId) => {
  const result = await pool.query(
    `SELECT e.photo_filename, o.user_id, o.delivery_person_id
     FROM order_delivery_events e
     JOIN orders o ON o.id = e.order_id
     WHERE e.id = $1 AND e.photo_filename IS NOT NULL`,
    [eventId]
  );
  return result.rows[0];
};

module.exports = {
  create,
  createPos,
  getByUserId,
  getAll,
  listAssigned,
  acceptAssignedDelivery,
  updateDelivery,
  updateAssignedStatus,
  recordDeliveryLocation,
  getDeliveryLocation,
  getProofPhoto,
};
