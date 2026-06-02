const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Helper: generate JWT token
const generateToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_SECRET || 'super_secret_cleaning_tracker_key_2026',
    { expiresIn: '7d' }
  );
};

/**
 * @desc    Admin login — password-based (Admin only)
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Workers and Contractors must use OTP login — not password
    if (user.role === 'worker' || user.role === 'contractor') {
      return res.status(400).json({
        success: false,
        message: `${user.role === 'worker' ? 'Workers' : 'Contractors'} must sign in using OTP email verification. Please use the OTP login option.`
      });
    }

    // Admin: verify password
    if (!user.password) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    res.status(200).json({
      success: true,
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get current user profile
 * @route   GET /api/auth/profile
 * @access  Private
 */
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get all workers
 * @route   GET /api/auth/workers
 * @access  Private/Admin+Contractor
 */
exports.getWorkers = async (req, res) => {
  try {
    const workers = await User.find({ role: 'worker' }).select('-password');
    res.status(200).json({ success: true, count: workers.length, workers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
