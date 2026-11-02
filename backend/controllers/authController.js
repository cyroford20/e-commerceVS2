const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');

const signToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET || 'vape_shop_secret_key_12345',
    { expiresIn: '7d' }
  );

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
});

// POST /api/auth/register  (customers only)
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    // Public signup is customer-only. Store owner is a seeded admin account.
    if (req.body.role && req.body.role !== 'customer') {
      return res.status(403).json({ message: 'Store owner accounts cannot be registered here.' });
    }

    // Check if email already exists
    const existingUser = await userModel.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create customer
    const user = await userModel.create(name, email, hashedPassword, 'customer');

    res.status(201).json({
      message: 'Registration successful.',
      token: signToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error during registration.' });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    // Find user
    const user = await userModel.findByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    res.json({
      message: 'Login successful.',
      token: signToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login.' });
  }
};

// GET /api/auth/me
const me = async (req, res) => {
  try {
    const user = await userModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json(user);
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Server error fetching profile.' });
  }
};

// PUT /api/auth/me
const updateMe = async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      return res.status(400).json({ message: 'Name is required.' });
    }

    const user = await userModel.updateProfile(req.user.id, name);
    res.json({
      message: 'Profile updated.',
      user: publicUser(user),
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error updating profile.' });
  }
};

// GET /api/auth/customers  (store owner)
const listCustomers = async (req, res) => {
  try {
    const customers = await userModel.listCustomers();
    res.json(customers);
  } catch (error) {
    console.error('List customers error:', error);
    res.status(500).json({ message: 'Server error fetching customers.' });
  }
};

const listDeliveryPersons = async (req, res) => {
  try {
    res.json(await userModel.listDeliveryPersons());
  } catch (error) {
    console.error('List delivery persons error:', error);
    res.status(500).json({ message: 'Server error fetching delivery persons.' });
  }
};

const createDeliveryPerson = async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!name || !email || password.length < 8) {
      return res.status(400).json({
        message: 'Name, email, and a password of at least 8 characters are required.',
      });
    }

    if (await userModel.findByEmail(email)) {
      return res.status(400).json({ message: 'Email already registered.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const person = await userModel.create(name, email, hash, 'delivery-person');
    res.status(201).json({ user: publicUser(person) });
  } catch (error) {
    console.error('Create delivery person error:', error);
    res.status(500).json({ message: 'Server error creating delivery account.' });
  }
};

module.exports = {
  register,
  login,
  me,
  updateMe,
  listCustomers,
  listDeliveryPersons,
  createDeliveryPerson,
};
