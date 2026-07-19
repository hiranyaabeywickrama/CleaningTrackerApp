const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  lockedUntil: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
