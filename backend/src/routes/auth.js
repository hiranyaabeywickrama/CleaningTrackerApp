const express = require('express');
const router = express.Router();
const { login, getProfile, getWorkers } = require('../controllers/authController');
const { requestOtp, verifyOtp } = require('../controllers/otpController');
const { protect, authorize } = require('../middleware/authMiddleware');
const emailService = require('../services/emailService');

router.get('/email-status', (req, res) => {
  res.json({ success: true, ...emailService.getEmailConfigStatus() });
});

// ─── Admin Password Login ────────────────────────────────────────────────────
// Admin is the only role that uses email + password authentication
router.post('/login', login);

// ─── Unified OTP Routes (Worker & Contractor) ────────────────────────────────
// Request OTP: works for both login (existing user) and registration (new user)
router.post('/otp/request', requestOtp);

// Verify OTP: authenticates and returns JWT; creates account for new users
router.post('/otp/verify', verifyOtp);

// ─── Legacy Contractor OTP Routes (backward compatibility aliases) ────────────
router.post('/contractor/request-otp', requestOtp);
router.post('/contractor/resend-otp', requestOtp);
router.post('/contractor/verify-otp', verifyOtp);

// ─── Protected Routes ────────────────────────────────────────────────────────
router.get('/profile', protect, getProfile);
router.get('/workers', protect, authorize('admin', 'contractor'), getWorkers);

module.exports = router;
