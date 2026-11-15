const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pool = require('./config/db');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const deliveryRoutes = require('./routes/deliveryRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

const ensureBarcodeSchema = async () => {
  await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(64)');
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique_idx
    ON products(barcode)
    WHERE barcode IS NOT NULL
  `);

  const result = await pool.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'products'
        AND column_name = 'barcode'
    ) AS barcode_column,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'products'
        AND indexname = 'products_barcode_unique_idx'
    ) AS barcode_index
  `);
  if (!result.rows[0]?.barcode_column || !result.rows[0]?.barcode_index) {
    throw new Error('Barcode schema verification failed: the barcode column or unique index is unavailable.');
  }
  console.log('Verified products.barcode column and unique index.');
};

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/delivery', deliveryRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Vape Shop API is running!' });
});

// Apply idempotent delivery additions before accepting requests.
const startServer = async () => {
  await ensureBarcodeSchema();
  const productSchema = fs.readFileSync(
    path.resolve(__dirname, '../database/product_management.sql'),
    'utf8'
  );
  await pool.query(productSchema);
  const deliverySchema = fs.readFileSync(
    path.resolve(__dirname, '../database/delivery_management.sql'),
    'utf8'
  );
  await pool.query(deliverySchema);
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

startServer().catch((error) => {
  console.error('Could not initialize database schema:', error);
  process.exit(1);
});
