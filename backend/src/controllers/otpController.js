const OTPVerification = require('../models/OTPVerification');
const User = require('../models/User');
const emailService = require('../services/emailService');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

// Helper: generate JWT token
const generateToken = (id) => {
  return jwt.sign(
    { id },
    env.jwtSecret || 'super_secret_cleaning_tracker_key_2026',
    { expiresIn: env.jwtExpiresIn || '7d' }
  );
};

// Helper: generate a random 6-digit OTP code
const generate6DigitCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * @desc    Request OTP — unified for Worker and Contractor (login OR registration)
 * @route   POST /api/auth/otp/request
 *          POST /api/auth/contractor/request-otp  (legacy alias)
 *          POST /api/auth/contractor/resend-otp   (legacy alias)
 * @access  Public
 */
exports.requestOtp = async (req, res) => {
  try {
    const { email, role, name, phoneNumber, companyName } = req.body;

    // --- Basic validation ---
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required' });
    }

    const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email format' });
    }

    // Normalise role — legacy contractor routes don't send role in body
    let requestedRole = (role === 'worker' || role === 'contractor')
      ? role
      : 'contractor'; // default for legacy contractor routes

    // --- Check if user already exists ---
    const cleanEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: cleanEmail });

    if (existingUser) {
      // Existing user: automatically use their registered role!
      requestedRole = existingUser.role;
      // Existing user login — no extra fields needed, just email + OTP
    } else {
      // If no name is provided, this is a login request for an unregistered email!
      if (!name) {
        return res.status(404).json({
          success: false,
          message: 'This email address is not registered. Please create an account first.'
        });
      }

      // New user registration — require profile fields
      if (!name.trim()) {
        return res.status(400).json({ success: false, message: 'Full Name is required for new registration' });
      }

      const phoneRegex = /^\+?[0-9]{9,15}$/;
      const cleanPhone = String(phoneNumber).replace(/[\s\-().]/g, '');
      if (!phoneNumber) {
        return res.status(400).json({ success: false, message: 'Phone Number is required for new registration' });
      }
      if (!phoneRegex.test(cleanPhone)) {
        return res.status(400).json({ success: false, message: 'Please enter a valid phone number (9–15 digits)' });
      }

      if (requestedRole === 'contractor' && (!companyName || !companyName.trim())) {
        return res.status(400).json({ success: false, message: 'Company Name is required for Contractor registration' });
      }
    }

    // --- Rate limiting: max 5 OTP requests per email per hour ---
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await OTPVerification.countDocuments({
      email: cleanEmail,
      createdAt: { $gte: oneHourAgo }
    });

    if (recentCount >= (env.otpResendLimitPerHour || 5)) {
      return res.status(429).json({
        success: false,
        message: 'Too many OTP requests. Please wait up to an hour before trying again.'
      });
    }

    // --- Gmail SMTP required — OTP must be delivered to the user's real inbox ---
    if (!emailService.isEmailConfigured()) {
      return res.status(503).json({
        success: false,
        message:
          'Email is not configured on the server. Open backend/.env and add Gmail (SMTP_USER + SMTP_PASS App Password) OR Resend (RESEND_API_KEY from resend.com). Then restart the backend with: npm run dev'
      });
    }

    // --- Delete any existing OTP records for this email (fresh start) ---
    await OTPVerification.deleteMany({ email: cleanEmail });

    // --- Generate OTP and hash it ---
    const rawOtp = generate6DigitCode();

    const expiresAt = new Date(Date.now() + (env.otpExpiryMinutes || 5) * 60 * 1000);
    const codeHash = await OTPVerification.generateHash(rawOtp);

    await OTPVerification.create({
      email: cleanEmail,
      role: requestedRole,
      codeHash,
      expiresAt
    });

    // --- Send OTP email ---
    const isLogin = !!existingUser;
    let emailResult;

    try {
      emailResult = await emailService.sendOtpEmail(cleanEmail, rawOtp, requestedRole, isLogin);
    } catch (emailErr) {
      await OTPVerification.deleteMany({ email: cleanEmail });
      console.error('OTP email failed:', emailErr.message);
      return res.status(503).json({
        success: false,
        message: emailErr.message || 'Could not send verification email. Please check your SMTP configuration.'
      });
    }

    res.status(200).json({
      success: true,
      message: `A 6-digit verification code has been sent to ${cleanEmail}. Please check your inbox and spam folder.`,
      isNewUser: !existingUser,
      sentTo: emailResult.to
    });
  } catch (error) {
    console.error('Request OTP Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error generating OTP' });
  }
};

/**
 * @desc    Verify OTP — unified for Worker and Contractor (login OR registration)
 * @route   POST /api/auth/otp/verify
 *          POST /api/auth/contractor/verify-otp  (legacy alias)
 * @access  Public
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { email, role, name, phoneNumber, companyName } = req.body;
    const code = req.body.code ? String(req.body.code).trim() : '';

    if (!email || !code) {
      return res.status(400).json({ success: false, message: 'Email and 6-digit verification code are required' });
    }

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: 'Verification code must be exactly 6 digits' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // --- Find the latest OTP record for this email ---
    const verification = await OTPVerification.findOne({ email: cleanEmail }).sort({ createdAt: -1 });

    if (!verification) {
      return res.status(400).json({ success: false, message: 'No verification request found. Please request a new code.' });
    }

    // --- Check expiry ---
    if (new Date() > verification.expiresAt) {
      await verification.deleteOne();
      return res.status(400).json({ success: false, message: 'Verification code has expired. Please request a new one.' });
    }

    // --- Check attempt limit ---
    const attemptLimit = env.otpLoginAttemptLimit || 5;
    if (verification.attempts >= attemptLimit) {
      await verification.deleteOne();
      return res.status(429).json({
        success: false,
        message: 'Maximum verification attempts exceeded. Please request a new code.'
      });
    }

    // --- Increment attempts before verifying ---
    verification.attempts += 1;
    await verification.save();

    // --- Verify OTP ---
    const isMatch = await verification.verifyCode(code);
    if (!isMatch) {
      const remaining = attemptLimit - verification.attempts;
      return res.status(400).json({
        success: false,
        message: `Invalid verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
      });
    }

    // --- OTP is valid: clean up all OTP records for this email ---
    await OTPVerification.deleteMany({ email: cleanEmail });

    // --- Determine effective role (from OTP record for security) ---
    const effectiveRole = verification.role;

    // --- Login or Register ---
    let user = await User.findOne({ email: cleanEmail });
    let isNewUser = false;

    if (!user) {
      // New user — create account
      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Full Name is required to complete registration' });
      }
      if (!phoneNumber) {
        return res.status(400).json({ success: false, message: 'Phone Number is required to complete registration' });
      }
      if (effectiveRole === 'contractor' && (!companyName || !companyName.trim())) {
        return res.status(400).json({ success: false, message: 'Company Name is required to complete contractor registration' });
      }

      user = await User.create({
        name: name.trim(),
        email: cleanEmail,
        phoneNumber,
        ...(effectiveRole === 'contractor' && { companyName: companyName.trim() }),
        role: effectiveRole
      });

      isNewUser = true;

      // Send welcome email asynchronously (non-blocking)
      emailService.sendWelcomeEmail(user).catch((err) =>
        console.error('Welcome email error:', err.message)
      );
    }

    res.status(200).json({
      success: true,
      isNewUser,
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        ...(user.companyName && { companyName: user.companyName }),
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Verify OTP Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error verifying OTP' });
  }
};
