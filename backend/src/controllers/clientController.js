const ClientRequest = require('../models/ClientRequest');
const User = require('../models/User');
const Contract = require('../models/Contract');
const Package = require('../models/Package');

/**
 * @desc    Create a new client job request
 * @route   POST /api/client/requests
 * @access  Private/Client
 */
exports.createRequest = async (req, res) => {
  try {
    const { category, description, location, date, time, duration } = req.body;

    if (!category || !description || !location || !date || !time) {
      return res.status(400).json({ success: false, message: 'Please provide all request details' });
    }

    const request = await ClientRequest.create({
      client: req.user.id,
      category,
      description,
      location,
      date: new Date(date),
      time,
      duration: duration ? Number(duration) : undefined
    });

    res.status(201).json({ success: true, request });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get client's requests
 * @route   GET /api/client/requests
 * @access  Private/Client
 */
exports.getRequests = async (req, res) => {
  try {
    const requests = await ClientRequest.find({ client: req.user.id })
      .populate('offers.contractor', 'name companyName email phoneNumber tags locations')
      .sort('-createdAt');

    res.status(200).json({ success: true, count: requests.length, requests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get offers for a specific client request
 * @route   GET /api/client/requests/:id/offers
 * @access  Private/Client
 */
exports.getOffers = async (req, res) => {
  try {
    const request = await ClientRequest.findOne({ _id: req.params.id, client: req.user.id })
      .populate('offers.contractor', 'name companyName email phoneNumber tags locations');

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    res.status(200).json({ success: true, count: request.offers.length, offers: request.offers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Accept contractor offer & create Contract
 * @route   POST /api/client/requests/:id/offers/:offerId/accept
 * @access  Private/Client
 */
exports.acceptOffer = async (req, res) => {
  try {
    const request = await ClientRequest.findOne({ _id: req.params.id, client: req.user.id });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request is no longer pending' });
    }

    const offer = request.offers.id(req.params.offerId);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }

    // Accept this offer and reject others
    offer.status = 'accepted';
    request.offers.forEach(o => {
      if (o._id.toString() !== offer._id.toString()) {
        o.status = 'rejected';
      }
    });

    request.status = 'active';
    await request.save();

    // Look up contractor & their package
    const contractor = await User.findById(offer.contractor);
    let packageId = contractor.packageId;

    if (!packageId) {
      // Find standard basic package
      const basicPkg = await Package.findOne({ name: 'Basic' });
      if (basicPkg) packageId = basicPkg._id;
    }

    // Contractor will select and assign crew members manually later
    const assignedWorkers = [];

    // Create contract
    const contract = await Contract.create({
      contractorId: contractor._id,
      clientId: req.user.id,
      clientRequestId: request._id,
      clientName: req.user.name,
      location: {
        address: request.location,
        coordinates: {
          lat: 40.7128, // Default fallback coordinates (seeder NY default)
          lng: -73.9786
        }
      },
      packageId,
      workers: assignedWorkers,
      requiredWorkersCount: 1,
      isUrgent: false,
      schedule: {
        date: request.date,
        startTime: request.time,
        durationMinutes: request.duration || 120
      },
      notes: `Accepted Client Request: ${request.description}`,
      bidPrice: offer.price,
      status: 'active'
    });

    // Notify Contractor via Socket & persistent database notification
    const io = req.app.get('socketio');
    const { notifyUser } = require('../services/notificationService');
    await notifyUser(io, {
      userId: contractor._id,
      type: 'offer_accepted',
      title: 'Offer Accepted! 🎉',
      message: `Client ${req.user.name} accepted your offer for ${request.category}!`,
      socketEvent: 'contractor_notification',
      data: {
        contractId: contract._id
      }
    });

    res.status(200).json({ success: true, message: 'Offer accepted and contract created.', request, contract });
  } catch (error) {
    console.error('Accept Offer Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get matching contractors list
 * @route   GET /api/client/contractors
 * @access  Private/Client
 */
exports.getContractors = async (req, res) => {
  try {
    const { category, location } = req.query;

    const filter = { role: 'contractor' };

    // Search matches: matching categories tags
    if (category) {
      filter.tags = { $regex: category, $options: 'i' };
    }

    // Match locations (e.g. state or town tags)
    if (location) {
      filter.locations = { $regex: location, $options: 'i' };
    }

    const contractors = await User.find(filter)
      .populate('packageId')
      .select('-password');

    res.status(200).json({ success: true, count: contractors.length, contractors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Rate a contractor
 * @route   POST /api/client/contractors/:id/rate
 * @access  Private/Client
 */
exports.rateContractor = async (req, res) => {
  try {
    const contractor = await User.findById(req.params.id);
    if (!contractor || contractor.role !== 'contractor') {
      return res.status(404).json({ success: false, message: 'Contractor not found' });
    }

    const { rating, review } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    const existingRatingIndex = contractor.ratings.findIndex(r => r.clientId.toString() === req.user.id.toString());
    if (existingRatingIndex !== -1) {
      contractor.ratings[existingRatingIndex].rating = rating;
      contractor.ratings[existingRatingIndex].review = review;
      contractor.ratings[existingRatingIndex].date = Date.now();
    } else {
      contractor.ratings.push({
        clientId: req.user.id,
        rating,
        review
      });
    }

    const totalRatings = contractor.ratings.reduce((sum, r) => sum + r.rating, 0);
    contractor.averageRating = totalRatings / contractor.ratings.length;

    await contractor.save();

    res.status(200).json({ success: true, message: 'Rating submitted successfully', averageRating: contractor.averageRating });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get associated contractors (contractors who have worked for this client)
 * @route   GET /api/client/associated-contractors
 * @access  Private/Client
 */
exports.getAssociatedContractors = async (req, res) => {
  try {
    const Contract = require('../models/Contract');
    // Find all contracts for this client that were accepted or completed
    const contracts = await Contract.find({
      clientPhone: req.user.phoneNumber, // Assuming client matches by phone number, or maybe there's a clientId?
      // Wait, clientRequest doesn't store clientId in Contract directly except clientPhone or clientName.
      // But we can check ClientRequest offers accepted!
    });
    
    // Better way: Find ClientRequests by this user that are assigned
    const ClientRequest = require('../models/ClientRequest');
    const requests = await ClientRequest.find({
      client: req.user.id,
      status: { $in: ['assigned', 'completed'] }
    }).populate('offers.contractor', 'name companyName email phoneNumber tags locations averageRating ratings');

    const contractorsSet = new Map();
    requests.forEach(req => {
      req.offers.forEach(offer => {
        if (offer.status === 'accepted' && offer.contractor) {
          contractorsSet.set(offer.contractor._id.toString(), offer.contractor);
        }
      });
    });

    const associatedContractors = Array.from(contractorsSet.values());

    res.status(200).json({ success: true, count: associatedContractors.length, contractors: associatedContractors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
