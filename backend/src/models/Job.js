const mongoose = require('mongoose');

const JobSchema = new mongoose.Schema({
  customerName: {
    type: String,
    required: [true, 'Please add a customer name'],
    trim: true
  },
  address: {
    type: String,
    required: [true, 'Please add an address']
  },
  // Double access: direct fields + GeoJSON for index optimization
  latitude: {
    type: Number,
    required: [true, 'Please specify latitude']
  },
  longitude: {
    type: Number,
    required: [true, 'Please specify longitude']
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    // GeoJSON [longitude, latitude] order
    coordinates: {
      type: [Number],
      required: true
    }
  },
  geofenceRadius: {
    type: Number,
    default: 200,
    required: true
  },
  assignedWorker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Optional initially, Admin assigns later
  },
  contractor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Contractor associated with job
  },
  startTime: {
    type: Date,
    required: [true, 'Please specify a scheduled start time']
  },
  expectedHours: {
    type: Number,
    required: [true, 'Please specify expected hours duration'],
    default: 2
  },
  status: {
    type: String,
    enum: ['pending', 'started', 'completed'],
    default: 'pending'
  },
  actualStartTime: {
    type: Date // Time when cleaner pressed "Start Cleaning"
  },
  actualEndTime: {
    type: Date // Time when cleaner pressed "End Cleaning"
  },
  totalHoursWorked: {
    type: Number,
    default: 0
  },
  notes: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Sync GeoJSON location object before saving
JobSchema.pre('validate', function (next) {
  if (this.latitude !== undefined && this.longitude !== undefined) {
    this.location = {
      type: 'Point',
      coordinates: [this.longitude, this.latitude]
    };
  }
  next();
});

// Set geospatial index for location
JobSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Job', JobSchema);
