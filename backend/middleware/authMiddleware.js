const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');

// Middleware to verify JWT token and load the current account
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Expect header: "Bearer <token>"
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'vape_shop_secret_key_12345'
    );
    const user = await userModel.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

// Restrict a route to specific account roles. Use after authenticate.
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have access to this action.' });
  }
  next();
};

const requireActiveRider = async (req, res, next) => {
  try {
    if (!(await userModel.isActiveDeliveryPerson(req.user.id))) {
      return res.status(403).json({ message: 'This rider account is inactive.' });
    }
    next();
  } catch (error) {
    console.error('Check rider availability error:', error);
    res.status(500).json({ message: 'Could not verify rider account.' });
  }
};

module.exports = { authenticate, requireRole, requireActiveRider };
