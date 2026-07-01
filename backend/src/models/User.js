const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  phoneNumber: {
    type: String,
    required: [true, 'Please add a phone number'],
    match: [
      /^\+?([0-9]{1,3})?[-. ]?([0-9]{3})[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/,
      'Please add a valid phone number'
    ]
  },
  password: {
    type: String,
    required: false,   // Only admin uses password login; workers & contractors use OTP
    minlength: 6,
    select: false      // Exclude from normal queries
  },
  role: {
    type: String,
    enum: ['admin', 'worker', 'contractor', 'client'],
    default: 'worker'
  },
  companyName: {
    type: String
    // Only for contractors
  },
  tags: {
    type: [String],
    default: []
  },
  locations: {
    type: [String],
    default: []
  },
  state: {
    type: String
  },
  packageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Package'
  },
  contractorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  ratings: [{
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    review: String,
    date: {
      type: Date,
      default: Date.now
    }
  }],
  averageRating: {
    type: Number,
    default: 0
  },
  hourlyRate: {
    type: Number,
    default: 25
  },
  status: {
    type: String,
    enum: ['offline', 'active_shift', 'cleaning', 'available', 'busy', 'on_job'],
    default: 'offline'
  },
  workerIdNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  planExpiresAt: {
    type: Date
  },
  planAutoRenew: {
    type: Boolean,
    default: true
  },
  planStatus: {
    type: String,
    enum: ['active', 'expired', 'cancelled'],
    default: 'active'
  },
  earlySelectCharge: {
    type: Number,
    default: 0
  },
  lastBilledAt: {
    type: Date
  },
  planTotalBilled: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save: enforce single admin limit + hash password if provided
UserSchema.pre('save', async function (next) {
  // Generate a unique workerIdNumber for crew members
  if (this.isNew && this.role === 'worker' && !this.workerIdNumber) {
    try {
      let isUnique = false;
      let candidateId = '';
      while (!isUnique) {
        const rand = Math.floor(100000 + Math.random() * 900000); // 6-digit number
        candidateId = `CW-${rand}`;
        const existing = await mongoose.model('User').findOne({ workerIdNumber: candidateId });
        if (!existing) {
          isUnique = true;
        }
      }
      this.workerIdNumber = candidateId;
    } catch (err) {
      return next(err);
    }
  }

  // Enforce single admin account
  if (this.isNew && this.role === 'admin') {
    try {
      const adminCount = await mongoose.model('User').countDocuments({ role: 'admin' });
      if (adminCount >= 1) {
        return next(new Error('Only one administrator account is allowed in the system'));
      }
    } catch (err) {
      return next(err);
    }
  }

  // Only hash password if it was provided and modified
  if (!this.password || !this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password — used for admin login only
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
