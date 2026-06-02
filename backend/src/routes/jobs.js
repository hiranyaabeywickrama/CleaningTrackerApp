const express = require('express');
const router = express.Router();
const { createJob, assignWorker, getWorkerJobs, getAllJobs, updateJobStatus } = require('../controllers/jobController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post('/create', protect, authorize('admin', 'contractor'), createJob);
router.put('/:id/assign', protect, authorize('admin'), assignWorker);
router.get('/worker', protect, authorize('worker'), getWorkerJobs);
router.get('/all', protect, authorize('admin', 'contractor'), getAllJobs);
router.put('/:id/status', protect, updateJobStatus);

module.exports = router;
