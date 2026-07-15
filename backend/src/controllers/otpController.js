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
    const { email, role, name, phoneNumber, companyName, tags, locations, state, hourlyRate } = req.body;

    // --- Basic validation ---
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required' });
    }

    const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email format' });
    }

    // Normalise role — legacy contractor routes don't send role in body
    let requestedRole = (role === 'worker' || role === 'contractor' || role === 'client')
      ? role
      : 'contractor'; // default for legacy contractor routes

    // --- Check if user already exists ---
    const cleanEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: cleanEmail });

    if (existingUser) {
      if (existingUser.role !== requestedRole) {
        return res.status(400).json({
          success: false,
          message: 'please create account this email'
        });
      }
      // Existing user login — no extra fields needed, just email + OTP
    } else {
      // If no name is provided, this is a login request for an unregistered email!
      if (!name) {
        return res.status(404).json({
          success: false,
          message: 'please create account this email'
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

    // --- DO NOT delete existing OTP records for this email (allow multiple valid codes) ---
    // await OTPVerification.deleteMany({ email: cleanEmail });

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

    if (process.env.ALLOW_TEST_OTP === 'true') {
      console.log(`[TEST MODE OTP] Email bypassed. Verification Code is: ${rawOtp}`);
      emailResult = { to: cleanEmail };
    } else {
      try {
        emailResult = await emailService.sendOtpEmail(cleanEmail, rawOtp, requestedRole, isLogin);
      } catch (emailErr) {
        console.error('OTP email sending failed:', emailErr.message);
        console.log('[AUTO-FALLBACK] Email failed. Providing verification Code directly: ' + rawOtp);
        return res.status(200).json({
          success: true,
          message: 'Email sending failed. Test mode fallback activated: use code ' + rawOtp,
          isNewUser: !existingUser,
          sentTo: cleanEmail,
          devOtpCode: rawOtp
        });
      }
    }

    const payload = {
      success: true,
      message: `A 6-digit verification code has been sent to ${cleanEmail}. Please check your inbox and spam folder.`,
      isNewUser: !existingUser,
      sentTo: emailResult.to
    };

    if (process.env.ALLOW_TEST_OTP === 'true') {
      payload.devOtpCode = rawOtp;
      payload.message = `Test mode: use code ${rawOtp} (email bypass enabled).`;
    }

    res.status(200).json(payload);
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
    const { email, role, name, phoneNumber, companyName, tags, locations, state, hourlyRate } = req.body;
    const code = req.body.code ? String(req.body.code).trim() : '';

    if (!email || !code) {
      return res.status(400).json({ success: false, message: 'Email and 6-digit verification code are required' });
    }

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: 'Verification code must be exactly 6 digits' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // --- Find all unexpired OTP records for this email ---
    const verifications = await OTPVerification.find({ email: cleanEmail, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });

    if (verifications.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid verification request found or code expired. Please request a new code.' });
    }

    // --- Check attempt limit on the latest verification ---
    const latestVerification = verifications[0];
    const attemptLimit = env.otpLoginAttemptLimit || 5;
    if (latestVerification.attempts >= attemptLimit) {
      await OTPVerification.deleteMany({ email: cleanEmail });
      return res.status(429).json({
        success: false,
        message: 'Maximum verification attempts exceeded. Please request a new code.'
      });
    }

    // --- Increment attempts before verifying ---
    latestVerification.attempts += 1;
    await latestVerification.save();

    // --- Verify OTP against ALL unexpired records ---
    let isMatch = false;
    let matchedVerification = null;
    
    for (const verification of verifications) {
      if (await verification.verifyCode(code)) {
        isMatch = true;
        matchedVerification = verification;
        break;
      }
    }

    if (!isMatch) {
      const remaining = attemptLimit - latestVerification.attempts;
      return res.status(400).json({
        success: false,
        message: `Invalid verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
      });
    }

    // --- OTP is valid: clean up all OTP records for this email ---
    await OTPVerification.deleteMany({ email: cleanEmail });

    // --- Determine effective role (from OTP record for security) ---
    const effectiveRole = matchedVerification.role;

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

      // Parse arrays/strings for tags and locations
      const parsedTags = Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : []);
      const parsedLocations = Array.isArray(locations) ? locations : (typeof locations === 'string' ? locations.split(',').map(l => l.trim()).filter(Boolean) : []);

      user = await User.create({
        name: name.trim(),
        email: cleanEmail,
        phoneNumber,
        role: effectiveRole,
        companyName: effectiveRole === 'contractor' ? (companyName ? companyName.trim() : '') : undefined,
        tags: (effectiveRole === 'contractor' || effectiveRole === 'worker') ? parsedTags : undefined,
        locations: effectiveRole === 'contractor' ? parsedLocations : undefined,
        state: (effectiveRole === 'worker' || effectiveRole === 'client') ? (state ? state.trim() : '') : undefined,
        hourlyRate: effectiveRole === 'worker' ? (parseFloat(hourlyRate) || 25) : undefined
      });

      // Contractor plans are chosen on first login/onboarding rather than auto-assigned on registration
      /*
      if (effectiveRole === 'contractor') {
        const Package = require('../models/Package');
        const subscriptionService = require('../services/subscriptionService');
        const defaultPkg = await Package.findOne({ name: 'Basic' });
        if (defaultPkg) {
          await subscriptionService.initializeSubscription(user, defaultPkg);
        }
      }
      */

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
        role: user.role,
        status: user.status,
        companyName: user.companyName,
        tags: user.tags,
        locations: user.locations,
        state: user.state,
        hourlyRate: user.hourlyRate,
        packageId: user.packageId,
        workerIdNumber: user.workerIdNumber
      }
    });
  } catch (error) {
    console.error('Verify OTP Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error verifying OTP' });
  }
};
