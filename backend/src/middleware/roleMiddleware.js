// src/middleware/roleMiddleware.js
// Middleware to enforce role‑based access control

const { protect, authorize } = require('./authMiddleware');

const authorizeRoles = authorize;

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
