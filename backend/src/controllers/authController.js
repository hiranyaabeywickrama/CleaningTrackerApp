const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Helper: generate JWT token (includes role for socket.io auth)
const generateToken = (id, role) => {
  if (!process.env.JWT_SECRET) {
    console.warn('[SECURITY] JWT_SECRET not set in environment — using fallback. Set JWT_SECRET in .env for production!');
  }
  return jwt.sign(
    { id, role },
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
      token: generateToken(user._id, user.role),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        status: user.status,
        workerIdNumber: user.workerIdNumber
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
    const user = await User.findById(req.user.id).populate('packageId');
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

/**
 * @desc    Update current user profile
 * @route   PUT /api/auth/profile
 * @access  Private
 */
exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { name, phoneNumber, companyName, locations, tags, state, hourlyRate } = req.body;

    if (name) user.name = name.trim();
    if (phoneNumber) user.phoneNumber = phoneNumber.trim();

    // Role-specific fields
    if (user.role === 'contractor') {
      if (companyName !== undefined) user.companyName = companyName.trim();
      if (locations !== undefined) {
        user.locations = Array.isArray(locations) ? locations : locations.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (tags !== undefined) {
        user.tags = Array.isArray(tags) ? tags : tags.split(',').map(s => s.trim()).filter(Boolean);
      }
    } else if (user.role === 'client') {
      if (state !== undefined) user.state = state.trim();
    } else if (user.role === 'worker') {
      if (hourlyRate !== undefined && !isNaN(hourlyRate)) {
        user.hourlyRate = parseFloat(hourlyRate);
      }
      if (state !== undefined) user.state = state.trim();
      if (tags !== undefined) {
        user.tags = Array.isArray(tags) ? tags : tags.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    await user.save();

    // Re-fetch populated package details for contractors
    const updatedUser = await User.findById(user._id).populate('packageId');

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get current user notifications
 * @route   GET /api/auth/notifications
 * @access  Private
 */
exports.getNotifications = async (req, res) => {
  try {
    const Notification = require('../models/Notification');
    const notifications = await Notification.find({ userId: req.user.id })
      .sort('-createdAt')
      .limit(50);
    res.json({ success: true, notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Mark a specific notification as read
 * @route   PUT /api/auth/notifications/:id/read
 * @access  Private
 */
exports.markNotificationRead = async (req, res) => {
  try {
    const Notification = require('../models/Notification');
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { read: true },
      { new: true }
    );
    res.json({ success: true, notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
