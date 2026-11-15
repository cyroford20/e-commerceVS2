const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const jwtSecret = require('../config/jwtSecret');
const { requireRole } = require('../utils/roleAuthorization');

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
      jwtSecret
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
