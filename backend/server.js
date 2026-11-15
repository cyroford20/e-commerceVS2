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

const seedPhilippineBarangays = async () => {
  const sourceVersion = '2026-10-12';
  const imported = await pool.query(
    'SELECT record_count FROM philippine_geography_sources WHERE version = $1',
    [sourceVersion]
  );
  if (imported.rows[0]?.record_count === 42010) return;

  const locations = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../database/philippine_barangays.json'), 'utf8'
  ));
  if (locations.length !== 42010 || new Set(locations.map((location) => location.psgc_code)).size !== 42010) {
    throw new Error('Philippine barangay reference data failed count or PSGC code validation.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO philippine_barangays (psgc_code, barangay, city, province, region)
       SELECT item.psgc_code, item.barangay, item.city, item.province, item.region
       FROM jsonb_to_recordset($1::jsonb) AS item(
         psgc_code text, barangay text, city text, province text, region text
       )
       ON CONFLICT (psgc_code) DO UPDATE SET
         barangay = EXCLUDED.barangay, city = EXCLUDED.city,
         province = EXCLUDED.province, region = EXCLUDED.region,
         updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(locations)]
    );
    await client.query('DELETE FROM philippine_geography_sources');
    await client.query(
      'INSERT INTO philippine_geography_sources (version, record_count) VALUES ($1, $2)',
      [sourceVersion, locations.length]
    );
    await client.query('COMMIT');
    console.log(`Imported ${locations.length} Philippine barangays from PSGC snapshot ${sourceVersion}.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
  await seedPhilippineBarangays();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

startServer().catch((error) => {
  console.error('Could not initialize database schema:', error);
  process.exit(1);
});
