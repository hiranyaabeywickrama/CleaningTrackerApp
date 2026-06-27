const express = require('express');
const router = express.Router();
const {
  getPackages,
  searchWorkers,
  createContract,
  getContracts,
  getClientRequests,
  submitOffer,
  getContractorWorkers,
  addWorkerToRoster,
  getWorkerRosterProfile,
  postFreelanceJob,
  getFreelanceJobs,
  approveFreelanceWorker,
  upgradePackage,
  selectPackage,
  assignWorkerToContract,
  setRenewOption,
  renewPackage,
  getSubscription,
  handoverContract
} = require('../controllers/contractorController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Require contractor authentication for all endpoints
router.use(protect);
router.use(authorize('contractor'));

router.get('/packages', getPackages);
router.post('/package/upgrade', upgradePackage);
router.post('/package/select', selectPackage);
router.post('/package/renew-option', setRenewOption);
router.post('/package/renew', renewPackage);
router.get('/package/subscription', getSubscription);
router.get('/workers/search', searchWorkers);
router.get('/workers', getContractorWorkers);
router.post('/workers/add', addWorkerToRoster);
router.get('/workers/:id/profile', getWorkerRosterProfile);
router.post('/contracts', createContract);
router.get('/contracts', getContracts);
router.get('/client-requests', getClientRequests);
router.post('/client-requests/:id/offer', submitOffer);
router.post('/freelance', postFreelanceJob);
router.get('/freelance', getFreelanceJobs);
router.post('/freelance/:id/approve/:workerId', approveFreelanceWorker);
router.post('/workers/:id/assign', assignWorkerToContract);
router.put('/contracts/:id/handover', handoverContract);

module.exports = router;
