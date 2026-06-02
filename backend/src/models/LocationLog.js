const mongoose = require('mongoose');

const LocationLogSchema = new mongoose.Schema({
  worker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job'
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    // [longitude, latitude]
    coordinates: {
      type: [Number],
      required: true
    }
  },
  speed: {
    type: Number,
    default: 0
  },
  geofenceStatus: {
    type: String,
    enum: ['inside', 'outside_breach', 'not_applicable'],
    default: 'not_applicable'
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Spatial index for quick searches
LocationLogSchema.index({ location: '2dsphere' });
LocationLogSchema.index({ worker: 1, timestamp: -1 });

module.exports = mongoose.model('LocationLog', LocationLogSchema);
