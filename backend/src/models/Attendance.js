const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  worker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  clockIn: {
    type: Date,
    required: true,
    default: Date.now
  },
  clockOut: {
    type: Date
  },
  totalHours: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'completed'],
    default: 'active'
  }
});

AttendanceSchema.index({ worker: 1, clockIn: -1 });

module.exports = mongoose.model('Attendance', AttendanceSchema);
