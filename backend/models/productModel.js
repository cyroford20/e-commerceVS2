const pool = require('../config/db');

// Get all products
const getAll = async () => {
  const result = await pool.query(
    'SELECT * FROM products ORDER BY id ASC'
  );
  return result.rows;
};

// Get a single product by id
const getById = async (id) => {
  const result = await pool.query(
    'SELECT * FROM products WHERE id = $1',
    [id]
  );
  return result.rows[0];
};

const getByBarcode = async (barcode) => {
  const result = await pool.query(
    'SELECT * FROM products WHERE barcode = $1',
    [barcode]
  );
  return result.rows[0];
};

// Reduce stock after order
const reduceStock = async (productId, quantity) => {
  await pool.query(
    'UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1',
    [quantity, productId]
  );
};

const create = async ({ name, category, price, stock, image_url, barcode }) => {
  const result = await pool.query(
    `INSERT INTO products (name, category, price, stock, image_url, barcode)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name, category || null, price, stock, image_url || null, barcode || null]
  );
  return result.rows[0];
};

const update = async (id, { name, category, price, stock, image_url, barcode }) => {
  const result = await pool.query(
    `UPDATE products
     SET name = $1, category = $2, price = $3, stock = $4, image_url = $5, barcode = $6
     WHERE id = $7
     RETURNING *`,
    [name, category || null, price, stock, image_url || null, barcode || null, id]
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
  reduceStock,
  create,
  update,
  remove,
};
