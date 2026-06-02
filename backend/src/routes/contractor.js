const express = require('express');
const router = express.Router();
const { getPackages, searchWorkers, createContract, getContracts } = require('../controllers/contractorController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/packages', protect, authorize('contractor'), getPackages);
router.get('/workers/search', protect, authorize('contractor'), searchWorkers);
router.post('/contracts', protect, authorize('contractor'), createContract);
router.get('/contracts', protect, authorize('contractor'), getContracts);

module.exports = router;
