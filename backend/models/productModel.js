const pool = require('../config/db');

// Get all products
const getAll = async ({ includeInactive = false } = {}) => {
  const result = await pool.query(
    includeInactive
      ? 'SELECT * FROM products ORDER BY active DESC, id ASC'
      : 'SELECT id, name, category, price, stock, image_url FROM products WHERE active = TRUE ORDER BY id ASC'
  );
  return result.rows;
};

// Get a single product by id
const getById = async (id, { includeInactive = false } = {}) => {
  const result = await pool.query(
    includeInactive
      ? 'SELECT * FROM products WHERE id = $1'
      : 'SELECT id, name, category, price, stock, image_url FROM products WHERE id = $1 AND active = TRUE',
    [id]
  );
  return result.rows[0];
};

const getByBarcode = async (barcode) => {
  const result = await pool.query(
    `SELECT id, name, category, price, stock, image_url
     FROM products WHERE barcode = $1 AND active = TRUE`,
    [barcode]
  );
  return result.rows[0];
};

const getBarcodeConflict = async (barcode) => {
  const result = await pool.query(
    'SELECT id, name, active FROM products WHERE barcode = $1',
    [barcode]
  );
  return result.rows[0];
};

const getBuildProducts = async (productIds) => {
  const result = await pool.query(
    `SELECT id, name, category, price, stock, image_url
     FROM products
     WHERE id = ANY($1::int[]) AND active = TRUE
     ORDER BY array_position($1::int[], id)`,
    [productIds]
  );
  return result.rows;
};

// Reduce stock after order
const reduceStock = async (productId, quantity) => {
  await pool.query(
    'UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1',
    [quantity, productId]
  );
};

const create = async ({ name, category, price, stock, image_url, barcode, active = true }) => {
  const result = await pool.query(
    `INSERT INTO products (name, category, price, stock, image_url, barcode, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [name, category || null, price, stock, image_url || null, barcode || null, active]
  );
  return result.rows[0];
};

const update = async (id, { name, category, price, stock, image_url, barcode, active }) => {
  const result = await pool.query(
    `UPDATE products
     SET name = $1, category = $2, price = $3, stock = $4, image_url = $5, barcode = $6,
         active = COALESCE($7, active)
     WHERE id = $8
     RETURNING *`,
    [name, category || null, price, stock, image_url || null, barcode || null, active ?? null, id]
  );
  return result.rows[0];
};

const remove = async (id) => {
  const result = await pool.query(
    'DELETE FROM products WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rows[0];
};

module.exports = {
  getAll,
  getById,
  getByBarcode,
  getBarcodeConflict,
  getBuildProducts,
  reduceStock,
  create,
  update,
  remove,
};
