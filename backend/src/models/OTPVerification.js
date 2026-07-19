const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const OTPVerificationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['worker', 'contractor', 'client'],
    required: [true, 'Role is required']
  },
  codeHash: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  attempts: {
    type: Number,
    default: 0
  },
  verified: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 10 * 60 // MongoDB TTL: auto-remove after 10 min
  }
});

// Hash a plain OTP code for secure storage
OTPVerificationSchema.statics.generateHash = async function (code) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(code, salt);
};

// Compare a plain OTP against the stored hash
OTPVerificationSchema.methods.verifyCode = async function (plainCode) {
  return bcrypt.compare(plainCode, this.codeHash);
};

module.exports = mongoose.model('OTPVerification', OTPVerificationSchema);
