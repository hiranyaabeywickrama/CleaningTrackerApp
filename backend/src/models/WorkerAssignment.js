const mongoose = require('mongoose');

const WorkerAssignmentSchema = new mongoose.Schema({
  contractId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contract', required: true },
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  response: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'waitlisted', 'expired'],
    default: 'pending',
  },
  workerStatus: {
    type: String,
    enum: ['Traveling', 'Arrived', 'Working', 'Left Work Area', 'Completed'],
    default: 'Traveling'
  },
  checkInTime: { type: Date },
  checkOutTime: { type: Date },
  actualWorkedMinutes: { type: Number, default: 0 },
  totalViolations: { type: Number, default: 0 },
  timeSpentOutsideMinutes: { type: Number, default: 0 },
  gpsAttendanceSummary: { type: String, default: 'Good' },
  outsideStartTime: { type: Date },
  violationLogs: [{
    timestamp: { type: Date, default: Date.now },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    reason: { type: String, default: 'Left Work Area' }
  }],
  responseDeadline: { type: Date, required: true }, // 15 minutes from request
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

WorkerAssignmentSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('WorkerAssignment', WorkerAssignmentSchema);
