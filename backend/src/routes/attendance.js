const express = require('express');
const router = express.Router();
const { clockIn, clockOut, getAttendanceReport } = require('../controllers/attendanceController');
const { protect } = require('../middleware/authMiddleware');

router.post('/clock-in', protect, clockIn);
router.post('/clock-out', protect, clockOut);
router.get('/report', protect, getAttendanceReport);

module.exports = router;
