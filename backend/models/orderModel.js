const pool = require('../config/db');

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
  total,
  items,
  channel = 'online',
  deliveryAddress = null,
  deliveryPhone = null
) => {
  await readyChannel();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `INSERT INTO orders
       (user_id, total, channel, delivery_address, delivery_phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, total, channel, deliveryAddress, deliveryPhone]
    );
    const order = orderResult.rows[0];
    await client.query(
      `INSERT INTO order_delivery_events (order_id, status, note)
       VALUES ($1, 'pending', 'Order received')`,
      [order.id]
    );

    for (const item of items) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
        [order.id, item.product_id, item.quantity, item.price]
      );

      await client.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );
    }

    await client.query('COMMIT');
    return order;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// POS sale: price + stock checked from DB inside a transaction
const createPos = async (userId, items) => {
  await readyChannel();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let total = 0;
    const pricedItems = [];

    for (const item of items) {
      const quantity = parseInt(item.quantity, 10);
      const productId = parseInt(item.product_id, 10);

      if (!productId || !quantity || quantity < 1) {
        const err = new Error('Each item needs a valid product_id and quantity.');
        err.status = 400;
        throw err;
      }

      const productResult = await client.query(
        'SELECT id, name, price, stock FROM products WHERE id = $1 FOR UPDATE',
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

      const price = Number(product.price);
      total += price * quantity;
      pricedItems.push({
        product_id: product.id,
        quantity,
        price,
      });
    }

    const orderResult = await client.query(
      `INSERT INTO orders
       (user_id, total, channel, delivery_status)
       VALUES ($1, $2, 'pos', 'delivered')
       RETURNING *`,
      [userId, total]
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

    await client.query('COMMIT');
    return order;
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
    const locationResult = await pool.query(
      `SELECT latitude, longitude, accuracy, recorded_at
       FROM order_delivery_locations
       WHERE order_id = $1
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [order.id]
    );
    order.delivery_location = locationResult.rows[0] || null;
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
