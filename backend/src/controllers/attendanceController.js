const Attendance = require('../models/Attendance');
const User = require('../models/User');

// @desc    Clock in (Start shift)
// @route   POST /api/attendance/clock-in
// @access  Private/Worker
exports.clockIn = async (req, res) => {
  try {
    const workerId = req.user.id;

    // Check if already clocked in (has an active attendance log)
    const activeShift = await Attendance.findOne({ worker: workerId, status: 'active' });
    if (activeShift) {
      return res.status(400).json({ success: false, message: 'You are already clocked in' });
    }

    // Create attendance log
    const attendance = await Attendance.create({
      worker: workerId,
      clockIn: new Date(),
      status: 'active'
    });

    // Update worker status
    await User.findByIdAndUpdate(workerId, { status: 'active_shift' });

    res.status(201).json({
      success: true,
      attendance
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Clock out (End shift)
// @route   POST /api/attendance/clock-out
// @access  Private/Worker
exports.clockOut = async (req, res) => {
  try {
    const workerId = req.user.id;

    // Find active attendance log
    const activeShift = await Attendance.findOne({ worker: workerId, status: 'active' });
    if (!activeShift) {
      return res.status(400).json({ success: false, message: 'You are not clocked in' });
    }

    const clockOutTime = new Date();
    const diffMs = clockOutTime - new Date(activeShift.clockIn);
    const diffHrs = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2)); // round to 2 decimal places

    // Update attendance
    const attendance = await Attendance.findByIdAndUpdate(
      activeShift._id,
      {
        clockOut: clockOutTime,
        totalHours: diffHrs,
        status: 'completed'
      },
      { new: true }
    );

    // Update worker status to offline
    await User.findByIdAndUpdate(workerId, { status: 'offline' });

    res.status(200).json({
      success: true,
      attendance
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get attendance records (Worker sees their own, Admin sees all)
// @route   GET /api/attendance/report
// @access  Private
exports.getAttendanceReport = async (req, res) => {
  try {
    let filter = {};

    // Workers can only see their own attendance
    if (req.user.role === 'worker') {
      filter.worker = req.user.id;
    } else if (req.user.role === 'admin' && req.query.workerId) {
      // Admin can filter by workerId
      filter.worker = req.query.workerId;
    }

    const records = await Attendance.find(filter)
      .populate('worker', 'name email role status')
      .sort('-clockIn');

    // Calculate total hours
    const totalHoursCalculated = records.reduce((sum, item) => sum + (item.totalHours || 0), 0);

    res.status(200).json({
      success: true,
      count: records.length,
      totalHours: parseFloat(totalHoursCalculated.toFixed(2)),
      records
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
