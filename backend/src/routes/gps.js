const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { logGps, getContractGpsHistory } = require('../controllers/gpsController');

// Workers log GPS during active accepted contracts
router.post('/log', protect, authorize('worker'), logGps);

// Contractors view GPS for their own contracts only (admins blocked)
router.get('/contract/:contractId', protect, authorize('contractor'), getContractGpsHistory);

module.exports = router;
