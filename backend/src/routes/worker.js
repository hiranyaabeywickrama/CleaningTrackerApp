const express = require('express');
const router = express.Router();
const {
  getAssignments,
  respondToAssignment,
  getNotifications,
  markNotificationRead,
  startAssignmentJob,
  endAssignmentJob
} = require('../controllers/workerController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/assignments', protect, authorize('worker'), getAssignments);
router.post('/assignments/:id/respond', protect, authorize('worker'), respondToAssignment);
router.get('/notifications', protect, authorize('worker'), getNotifications);
router.put('/notifications/:id/read', protect, authorize('worker'), markNotificationRead);
router.post('/assignments/:id/start', protect, authorize('worker'), startAssignmentJob);
router.post('/assignments/:id/end', protect, authorize('worker'), endAssignmentJob);

module.exports = router;
