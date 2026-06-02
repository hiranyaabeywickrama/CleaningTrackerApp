const express = require('express');
const { protect, adminOnly, authorizeRoles } = require('../middleware/roleMiddleware');
const {
  getContractors,
  getWorkers,
  getWorkerHistory,
  getAllContracts,
  getReports,
  getPackages,
  updatePackage
} = require('../controllers/adminController');

const router = express.Router();

router.use(protect);
router.use(adminOnly);
router.use(authorizeRoles('admin'));

router.get('/contractors', getContractors);
router.get('/workers', getWorkers);
router.get('/workers/:id/history', getWorkerHistory);
router.get('/contracts', getAllContracts);
router.get('/reports', getReports);
router.get('/packages', getPackages);
router.put('/packages/:id', updatePackage);

module.exports = router;
