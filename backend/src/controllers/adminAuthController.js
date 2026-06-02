// src/controllers/adminAuthController.js
// Simple admin login (admin must already exist in DB)

const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'super_secret_cleaning_tracker_key_2026', { expiresIn: '30d' });
};

// POST /api/admin/login
const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required' });
  }

  const adminUser = await User.findOne({ email, role: 'admin' }).select('+password');
  if (!adminUser) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
  }

  const isMatch = await adminUser.matchPassword(password);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
  }

  const token = generateToken(adminUser._id);
  res.status(200).json({
    success: true,
    token,
    admin: { id: adminUser._id, name: adminUser.name, email: adminUser.email },
  });
});

module.exports = { adminLogin };
