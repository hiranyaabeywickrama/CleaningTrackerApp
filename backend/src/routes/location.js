const express = require('express');
const router = express.Router();
const { logLocation, getActiveLocations, getLocationHistory } = require('../controllers/locationController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post('/log', protect, authorize('worker'), logLocation);
router.get('/active', protect, authorize('admin'), getActiveLocations);
router.get('/history/:jobId', protect, getLocationHistory);

module.exports = router;
