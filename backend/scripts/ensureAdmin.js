require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      }
);

const email = 'admin@vapeshop.com';
const password = 'Admin123!';
const name = 'Store Admin';

(async () => {
  const hash = await bcrypt.hash(password, 10);

  await pool.query(
    `UPDATE users SET role = 'customer' WHERE role = 'store-owner' AND email <> $1`,
    [email]
  );

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE users SET name = $1, password = $2, role = 'store-owner' WHERE email = $3`,
      [name, hash, email]
    );
    console.log('Store admin updated:', email);
  } else {
    await pool.query(
      `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, 'store-owner')`,
      [name, email, hash]
    );
    console.log('Store admin created:', email);
  }

  await pool.end();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
