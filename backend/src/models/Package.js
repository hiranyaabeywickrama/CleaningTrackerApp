const mongoose = require('mongoose');

const PackageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: ['Basic', 'Premium'],
  },
  maxWorkers: {
    type: Number,
    required: true,
    // Basic is fixed at 5, Premium is dynamic (set by contractor)
  },
  price: {
    type: Number,
    required: true,
  },
  isDynamic: {
    type: Boolean,
    default: false
  },
  features: {
    type: [String],
    default: []
  },
  pricePerExtraWorker: {
    type: Number,
    default: 10
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Package', PackageSchema);
