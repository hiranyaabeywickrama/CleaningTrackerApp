const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

module.exports = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: parseInt(process.env.SMTP_PORT, 10) || 587,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  smtpFromName: process.env.SMTP_FROM_NAME || 'CleanTrack',
  smtpFromEmail: process.env.SMTP_FROM_EMAIL,
  googleMapsKey: process.env.GOOGLE_MAPS_KEY,
  otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 5,
  otpResendLimitPerHour: parseInt(process.env.OTP_RESEND_LIMIT_PER_HOUR, 10) || 5,
  otpLoginAttemptLimit: parseInt(process.env.OTP_LOGIN_ATTEMPT_LIMIT, 10) || 5
};
