// src/middleware/roleMiddleware.js
// Middleware to enforce role‑based access control

const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');

// Verify JWT and attach user to request (same as typical auth middleware)
const protect = asyncHandler(async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_cleaning_tracker_key_2026');
    // Attach full user record (including role) to request
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) {
      res.status(401);
      throw new Error('User not found');
    }
    next();
  } catch (err) {
    res.status(401);
    throw new Error('Not authorized, token failed');
  }
});

// Helper to allow only specific roles (e.g., admin, contractor, worker)
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401);
      throw new Error('User not attached to request');
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403);
      throw new Error(`User role '${req.user.role}' not permitted for this route`);
    }
    next();
  };
};

// Admin‑only middleware – also blocks admin from accessing live‑tracking routes
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    // Explicitly deny any admin attempt to hit live‑tracking endpoints
    if (req.path.startsWith('/gps') || req.baseUrl.includes('/gps')) {
      res.status(403);
      throw new Error('Admins are not permitted to access live GPS data');
    }
    // Allow other admin routes
    return next();
  }
  // Non‑admin users fall through to usual role checks elsewhere
  next();
};

module.exports = { protect, authorizeRoles, adminOnly };
