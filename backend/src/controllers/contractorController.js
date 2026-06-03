const Contract = require('../models/Contract');
const Package = require('../models/Package');
const User = require('../models/User');
const WorkerAssignment = require('../models/WorkerAssignment');
const { notifyUser } = require('../services/notificationService');

/**
 * @desc    Get all available packages
 * @route   GET /api/contractor/packages
 * @access  Private/Contractor
 */
exports.getPackages = async (req, res) => {
  try {
    let packages = await Package.find({});

    // Seed default packages if none exist
    if (packages.length === 0) {
      packages = await Package.create([
        {
          name: 'Basic',
          maxWorkers: 5,
          price: 299,
          isDynamic: false,
          features: ['Up to 5 workers', 'Fixed monthly price', 'Contract management', 'Worker requests'],
          pricePerExtraWorker: 0
        },
        {
          name: 'Premium',
          maxWorkers: 50,
          price: 199,
          isDynamic: true,
          features: ['Choose worker count', 'Dynamic pricing', 'Live GPS tracking', 'Backup waitlist workers'],
          pricePerExtraWorker: 25
        }
      ]);
    }

    res.status(200).json({ success: true, packages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Search workers by worker ID (email) or Name
 * @route   GET /api/contractor/workers/search
 * @access  Private/Contractor
 */
exports.searchWorkers = async (req, res) => {
  try {
    const { query } = req.query;

    // Retrieve all workers matching the search query to display their statuses in cards
    let filter = { role: 'worker' };

    if (query) {
      filter.$or = [
        { email: { $regex: query, $options: 'i' } },
        { name: { $regex: query, $options: 'i' } }
      ];
    }

    const workers = await User.find(filter).select('-password');
    res.status(200).json({ success: true, count: workers.length, workers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Create a new cleaning contract
 * @route   POST /api/contractor/contracts
 * @access  Private/Contractor
 */
exports.createContract = async (req, res) => {
  try {
    const {
      clientName,
      address,
      latitude,
      longitude,
      packageId,
      workers, // Array of worker IDs
      requiredWorkersCount, // Confirmed slots
      isUrgent, // Urgent countdown (5 mins)
      date,
      startTime,
      durationMinutes,
      notes
    } = req.body;

    if (!address || latitude === undefined || longitude === undefined || !packageId || !workers || workers.length === 0 || !date || !startTime || !durationMinutes) {
      return res.status(400).json({ success: false, message: 'Please provide all required contract details' });
    }

    const parsedRequiredWorkers = parseInt(requiredWorkersCount) || 1;
    if (workers.length < parsedRequiredWorkers) {
      return res.status(400).json({
        success: false,
        message: `You must select at least the required worker count of ${parsedRequiredWorkers} to enable waitlisting/backup features.`
      });
    }

    // Verify package
    const pkg = await Package.findById(packageId);
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Selected package not found' });
    }

    // Enforce basic package limit (max 5 workers)
    if (!pkg.isDynamic && parsedRequiredWorkers > pkg.maxWorkers) {
      return res.status(400).json({ 
        success: false, 
        message: `Basic Package permits a maximum of ${pkg.maxWorkers} workers. Please upgrade to the Premium Package.` 
      });
    }

    // Fetch all requested workers
    const requestedWorkers = await User.find({
      _id: { $in: workers },
      role: 'worker'
    });

    const unavailableWorkers = requestedWorkers.filter(w => !['available', 'active_shift'].includes(w.status));
    
    if (unavailableWorkers.length > 0) {
      const details = unavailableWorkers.map(w => `${w.name} (${w.status.toUpperCase().replace('_', ' ')})`).join(', ');
      return res.status(400).json({
        success: false,
        message: `The following selected workers are unavailable: ${details}. Please select available/online cleaners.`
      });
    }

    if (requestedWorkers.length !== workers.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more selected worker IDs are invalid or do not exist.'
      });
    }

    // Client name defaults to contractor's own name/company if not specified
    const finalClientName = clientName || req.user.companyName || req.user.name;

    // Create Contract
    const contract = await Contract.create({
      contractorId: req.user.id,
      clientName: finalClientName,
      location: {
        address,
        coordinates: {
          lat: parseFloat(latitude),
          lng: parseFloat(longitude)
        }
      },
      packageId,
      workers,
      requiredWorkersCount: parsedRequiredWorkers,
      isUrgent: !!isUrgent,
      schedule: {
        date: new Date(date),
        startTime,
        durationMinutes: parseInt(durationMinutes)
      },
      notes
    });

    // Create Worker Assignments with standard (2 hours = 120 mins) or urgent (5 mins) timers
    const timerMinutes = !!isUrgent ? 5 : 120;
    const responseDeadline = new Date(Date.now() + timerMinutes * 60 * 1000); 
    const assignments = [];

    for (const workerId of workers) {
      const assignment = await WorkerAssignment.create({
        contractId: contract._id,
        workerId,
        responseDeadline
      });
      assignments.push(assignment);

      const io = req.app.get('socketio');

      await notifyUser(io, {
        userId: workerId,
        type: 'contract_request',
        title: isUrgent ? 'Urgent Contract Request' : 'New Contract Request',
        message: isUrgent 
          ? `You have 5 minutes to respond to an urgent cleaning contract at ${address}.`
          : `You have 2 hours to respond to a cleaning contract at ${address}.`,
        data: {
          assignmentId: assignment._id,
          contractId: contract._id,
          clientName: finalClientName,
          address,
          date,
          startTime,
          durationMinutes,
          isUrgent: !!isUrgent,
          responseDeadline,
          notes
        },
        socketEvent: 'worker_assignment'
      });
    }

    res.status(201).json({
      success: true,
      message: `Contract successfully drafted. Requests dispatched to selected workers with a ${isUrgent ? '5-minute' : '2-hour'} response deadline.`,
      contract,
      assignments
    });
  } catch (error) {
    console.error('Create Contract Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get contractor's own cleaning contracts
 * @route   GET /api/contractor/contracts
 * @access  Private/Contractor
 */
exports.getContracts = async (req, res) => {
  try {
    const now = new Date();

    const contracts = await Contract.find({ contractorId: req.user.id })
      .populate('workers', 'name email phoneNumber status')
      .populate('packageId')
      .sort('-createdAt');

    // Fetch and dynamically update/append assignments for each contract
    const contractsWithAssignments = [];
    for (let contract of contracts) {
      // Auto-expire assignments where response deadline has passed and it is still pending
      await WorkerAssignment.updateMany(
        {
          contractId: contract._id,
          response: 'pending',
          responseDeadline: { $lt: now }
        },
        { response: 'expired' }
      );

      const assignments = await WorkerAssignment.find({ contractId: contract._id })
        .populate('workerId', 'name email phoneNumber status');

      contractsWithAssignments.push({
        ...contract.toObject(),
        assignments: assignments.map(a => ({
          _id: a._id,
          workerId: a.workerId,
          response: a.response,
          responseDeadline: a.responseDeadline,
          createdAt: a.createdAt
        }))
      });
    }

    res.status(200).json({ success: true, count: contractsWithAssignments.length, contracts: contractsWithAssignments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
