const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../config/db');

const WALKIN_EMAIL = 'walkin@vapeshop.local';

// Find user by email
const findByEmail = async (email) => {
  const result = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0];
};

// Find user by id
const findById = async (id) => {
  const result = await pool.query(
    'SELECT id, name, email, role FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0];
};

// Create a new user
const create = async (name, email, hashedPassword, role) => {
  const result = await pool.query(
    'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
    [name, email, hashedPassword, role]
  );
  return result.rows[0];
};

// Update profile name
const updateProfile = async (id, name) => {
  const result = await pool.query(
    'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email, role',
    [name, id]
  );
  return result.rows[0];
};

// Customer accounts for store owner (hide internal walk-in account)
const listCustomers = async () => {
  const result = await pool.query(
    `SELECT
       u.id,
       u.name,
       u.email,
       COUNT(o.id)::int AS order_count,
       COALESCE(SUM(o.total), 0)::numeric AS total_spent
     FROM users u
     LEFT JOIN orders o ON o.user_id = u.id
     WHERE u.role = 'customer' AND u.email <> $1
     GROUP BY u.id
     ORDER BY u.id DESC`,
    [WALKIN_EMAIL]
  );
  return result.rows;
};

const listDeliveryPersons = async () => {
  const result = await pool.query(
    `SELECT id, name, email
     FROM users
     WHERE role = 'delivery-person'
     ORDER BY name ASC`
  );
  return result.rows;
};

// Shared walk-in account used by in-store POS sales
const ensureWalkInCustomer = async () => {
  const existing = await findByEmail(WALKIN_EMAIL);
  if (existing) {
    return { id: existing.id, name: existing.name, email: existing.email, role: existing.role };
  }

  const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  return create('Walk-in Customer', WALKIN_EMAIL, hash, 'customer');
};

module.exports = {
  WALKIN_EMAIL,
  findByEmail,
  findById,
  create,
  updateProfile,
  listCustomers,
  listDeliveryPersons,
  ensureWalkInCustomer,
};
