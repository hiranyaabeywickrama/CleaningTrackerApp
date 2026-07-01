const express = require('express');
const router = express.Router();
const { createRequest, getRequests, getOffers, acceptOffer, getContractors, getAssociatedContractors, rateContractor } = require('../controllers/clientController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All client routes require client authentication
router.use(protect);
router.use(authorize('client'));

router.post('/requests', createRequest);
router.get('/requests', getRequests);
router.get('/requests/:id/offers', getOffers);
router.post('/requests/:id/offers/:offerId/accept', acceptOffer);
router.get('/contractors', getContractors);
router.get('/associated-contractors', getAssociatedContractors);
router.post('/contractors/:id/rate', rateContractor);

module.exports = router;
