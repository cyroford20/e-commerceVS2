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
  console.error('Could not initialize delivery management schema:', error);
  process.exit(1);
});
