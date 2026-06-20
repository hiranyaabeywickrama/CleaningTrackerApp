const Contract = require('../models/Contract');
const Package = require('../models/Package');
const User = require('../models/User');
const WorkerAssignment = require('../models/WorkerAssignment');
const { notifyUser } = require('../services/notificationService');
const subscriptionService = require('../services/subscriptionService');

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
      isUrgent, // Urgent countdown (10 mins)
      date,
      startTime,
      durationMinutes,
      notes
    } = req.body;

    if (!address || latitude === undefined || longitude === undefined || !packageId || !workers || workers.length === 0 || !date || !startTime || !durationMinutes) {
      return res.status(400).json({ success: false, message: 'Please provide all required contract details' });
    }

    const contractor = await User.findById(req.user.id);
    if (contractor.planExpiresAt && new Date(contractor.planExpiresAt) <= new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Your subscription has expired. Please renew your plan to create new contracts.'
      });
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

    // Create Worker Assignments with standard (2 hours = 120 mins) or urgent (10 mins) timers
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
          ? `You have 10 minutes to respond to an urgent cleaning contract at ${address}.`
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
          workerStatus: a.workerStatus,
          checkInTime: a.checkInTime,
          checkOutTime: a.checkOutTime,
          actualWorkedMinutes: a.actualWorkedMinutes,
          totalViolations: a.totalViolations,
          timeSpentOutsideMinutes: a.timeSpentOutsideMinutes,
          gpsAttendanceSummary: a.gpsAttendanceSummary,
          createdAt: a.createdAt
        }))
      });
    }

    res.status(200).json({ success: true, count: contractsWithAssignments.length, contracts: contractsWithAssignments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get client requests matching contractor tags and locations
 * @route   GET /api/contractor/client-requests
 * @access  Private/Contractor
 */
exports.getClientRequests = async (req, res) => {
  try {
    const ClientRequest = require('../models/ClientRequest');
    const tags = req.user.tags || [];
    const locations = req.user.locations || [];
    
    const filter = { status: 'pending' };

    if (tags.length > 0) {
      filter.category = { $in: tags };
    }
    
    if (locations.length > 0) {
      const escapedLocs = locations
        .map(loc => loc.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
        .filter(Boolean);
      if (escapedLocs.length > 0) {
        filter.location = { $regex: escapedLocs.join('|'), $options: 'i' };
      }
    }

    const requests = await ClientRequest.find(filter)
      .populate('client', 'name email phoneNumber')
      .sort('-createdAt');

    res.status(200).json({ success: true, count: requests.length, requests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Submit price bid offer for client request
 * @route   POST /api/contractor/client-requests/:id/offer
 * @access  Private/Contractor
 */
exports.submitOffer = async (req, res) => {
  try {
    const { price } = req.body;
    if (!price || isNaN(price)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid price offer' });
    }

    const ClientRequest = require('../models/ClientRequest');
    const request = await ClientRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ success: false, message: 'Client request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Client request is no longer open for offers' });
    }

    const existingOffer = request.offers.find(o => o.contractor.toString() === req.user.id);
    if (existingOffer) {
      existingOffer.price = parseFloat(price);
      existingOffer.createdAt = Date.now();
    } else {
      request.offers.push({
        contractor: req.user.id,
        price: parseFloat(price),
        status: 'pending'
      });
    }

    await request.save();

    res.status(200).json({ success: true, message: 'Offer submitted successfully', request });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get contractor's own workers
 * @route   GET /api/contractor/workers
 * @access  Private/Contractor
 */
exports.getContractorWorkers = async (req, res) => {
  try {
    const workers = await User.find({ role: 'worker', contractorId: req.user.id }).select('-password');
    res.status(200).json({ success: true, count: workers.length, workers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Add a worker to contractor's roster
 * @route   POST /api/contractor/workers/add
 * @access  Private/Contractor
 */
exports.addWorkerToRoster = async (req, res) => {
  try {
    const { workerId } = req.body;
    if (!workerId) {
      return res.status(400).json({ success: false, message: 'Worker ID is required' });
    }

    const worker = await User.findOne({ _id: workerId, role: 'worker' });
    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    if (worker.contractorId && worker.contractorId.toString() === req.user.id) {
      return res.status(400).json({ success: false, message: 'Worker is already in your roster' });
    }

    const currentPkg = await Package.findById(req.user.packageId) || await Package.findOne({ name: 'Basic' });
    const limit = currentPkg ? currentPkg.maxWorkers : 5;

    const currentWorkersCount = await User.countDocuments({ role: 'worker', contractorId: req.user.id });

    if (currentWorkersCount >= limit) {
      return res.status(400).json({
        success: false,
        message: `Package limit reached. Your current package permits a maximum of ${limit} workers. Please upgrade to a Premium package.`
      });
    }

    worker.contractorId = req.user.id;
    await worker.save();

    res.status(200).json({ success: true, message: `Successfully added ${worker.name} to your crew.`, worker });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get detailed worker profile with payouts
 * @route   GET /api/contractor/workers/:id/profile
 * @access  Private/Contractor
 */
exports.getWorkerRosterProfile = async (req, res) => {
  try {
    const worker = await User.findOne({ _id: req.params.id, role: 'worker', contractorId: req.user.id }).select('-password');
    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found in your roster' });
    }

    const { startDate, endDate } = req.query;

    const Job = require('../models/Job');
    const filter = {
      assignedWorker: worker._id,
      contractor: req.user.id
    };

    if (startDate && endDate) {
      filter.startTime = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const jobs = await Job.find(filter).sort('-startTime');

    let totalHours = 0;
    const completedJobs = jobs.filter(j => j.status === 'completed');
    completedJobs.forEach(job => {
      totalHours += job.totalHoursWorked || 0;
    });

    const hourlyRate = worker.hourlyRate || 25;
    const totalPayout = parseFloat((totalHours * hourlyRate).toFixed(2));

    res.status(200).json({
      success: true,
      worker,
      stats: {
        totalJobsCount: jobs.length,
        completedJobsCount: completedJobs.length,
        totalHours,
        totalPayout,
        hourlyRate
      },
      jobs
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Post a freelance job opening
 * @route   POST /api/contractor/freelance
 * @access  Private/Contractor
 */
exports.postFreelanceJob = async (req, res) => {
  try {
    const { category, location, hours, pricePerHour, date, time, description, targetType } = req.body;

    const actualTargetType = targetType === 'crew' ? 'crew' : 'public';
    const actualPricePerHour = actualTargetType === 'crew' ? (parseFloat(pricePerHour) || 25) : parseFloat(pricePerHour);

    if (!category || !location || !hours || actualPricePerHour === undefined || isNaN(actualPricePerHour) || !date || !time || !description) {
      return res.status(400).json({ success: false, message: 'Please provide all freelance job details' });
    }

    const FreelanceJob = require('../models/FreelanceJob');
    const freelanceJob = await FreelanceJob.create({
      contractor: req.user.id,
      category,
      location,
      hours: parseFloat(hours),
      pricePerHour: actualPricePerHour,
      date: new Date(date),
      time,
      description,
      targetType: actualTargetType
    });

    res.status(201).json({ success: true, freelanceJob });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get freelance jobs posted by contractor
 * @route   GET /api/contractor/freelance
 * @access  Private/Contractor
 */
exports.getFreelanceJobs = async (req, res) => {
  try {
    const FreelanceJob = require('../models/FreelanceJob');
    const freelanceJobs = await FreelanceJob.find({ contractor: req.user.id })
      .populate('applicants', 'name email phoneNumber tags state status hourlyRate')
      .populate('approvedWorker', 'name email phoneNumber')
      .sort('-createdAt');

    res.status(200).json({ success: true, count: freelanceJobs.length, freelanceJobs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Approve a freelance job applicant
 * @route   POST /api/contractor/freelance/:id/approve/:workerId
 * @access  Private/Contractor
 */
exports.approveFreelanceWorker = async (req, res) => {
  try {
    const FreelanceJob = require('../models/FreelanceJob');
    const freelanceJob = await FreelanceJob.findOne({ _id: req.params.id, contractor: req.user.id });

    if (!freelanceJob) {
      return res.status(404).json({ success: false, message: 'Freelance job not found' });
    }

    if (freelanceJob.status !== 'open') {
      return res.status(400).json({ success: false, message: 'Freelance job is already filled or completed' });
    }

    const workerId = req.params.workerId;
    if (!freelanceJob.applicants.includes(workerId)) {
      return res.status(400).json({ success: false, message: 'Worker has not applied for this freelance job' });
    }

    freelanceJob.approvedWorker = workerId;
    freelanceJob.status = 'filled';
    await freelanceJob.save();

    let packageId = req.user.packageId;
    if (!packageId) {
      const basicPkg = await Package.findOne({ name: 'Basic' });
      if (basicPkg) packageId = basicPkg._id;
    }

    const worker = await User.findById(workerId);
    if (worker && (!worker.contractorId || worker.contractorId.toString() !== req.user.id)) {
      worker.contractorId = req.user.id;
      await worker.save();
    }

    const contract = await Contract.create({
      contractorId: req.user.id,
      clientName: `Freelance Job: ${freelanceJob.category}`,
      location: {
        address: freelanceJob.location,
        coordinates: {
          lat: 40.7128,
          lng: -73.9786
        }
      },
      packageId,
      workers: [workerId],
      requiredWorkersCount: 1,
      isUrgent: false,
      schedule: {
        date: freelanceJob.date,
        startTime: freelanceJob.time,
        durationMinutes: Math.round(freelanceJob.hours * 60)
      },
      notes: freelanceJob.description,
      status: 'active'
    });

    const responseDeadline = new Date(Date.now() + 120 * 60 * 1000);
    await WorkerAssignment.create({
      contractId: contract._id,
      workerId,
      response: 'accepted',
      workerStatus: 'Traveling',
      responseDeadline
    });

    const Job = require('../models/Job');
    const baseDate = new Date(contract.schedule.date);
    const [hours, minutes] = (contract.schedule.startTime || '09:00').split(':');
    baseDate.setHours(parseInt(hours, 10) || 9);
    baseDate.setMinutes(parseInt(minutes, 10) || 0);

    await Job.create({
      customerName: contract.clientName,
      address: contract.location.address,
      latitude: contract.location.coordinates.lat,
      longitude: contract.location.coordinates.lng,
      assignedWorker: workerId,
      contractor: req.user.id,
      startTime: baseDate,
      expectedHours: freelanceJob.hours,
      notes: contract.notes,
      status: 'pending'
    });

    const io = req.app.get('socketio');
    if (io) {
      io.emit(`worker_notification:${workerId}`, {
        message: `Your freelance application for ${freelanceJob.category} has been approved!`,
        type: 'freelance_approved'
      });
    }

    res.status(200).json({ success: true, message: 'Worker approved. Rota and Job created.', freelanceJob, contract });
  } catch (error) {
    console.error('Approve Freelancer Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Upgrade contractor package subscription
 * @route   POST /api/contractor/package/upgrade
 * @access  Private/Contractor
 */
exports.upgradePackage = async (req, res) => {
  try {
    const premiumPkg = await Package.findOne({ name: 'Premium' });
    if (!premiumPkg) {
      return res.status(404).json({ success: false, message: 'Premium Package not found' });
    }

    const user = await User.findById(req.user.id);
    await subscriptionService.initializeSubscription(user, premiumPkg);
    const summary = subscriptionService.getSubscriptionSummary(user, premiumPkg);

    res.status(200).json({
      success: true,
      message: `Upgraded to Premium! $${premiumPkg.price} charged. Renews on ${summary.renewsOn.toLocaleDateString()}.`,
      package: premiumPkg,
      subscription: summary,
      user
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Select basic or premium plan
 * @route   POST /api/contractor/package/select
 * @access  Private/Contractor
 */
exports.selectPackage = async (req, res) => {
  try {
    const { packageId } = req.body;
    if (!packageId) {
      return res.status(400).json({ success: false, message: 'Package ID is required' });
    }

    const pkg = await Package.findById(packageId);
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }

    const user = await User.findById(req.user.id);
    await subscriptionService.initializeSubscription(user, pkg);
    const summary = subscriptionService.getSubscriptionSummary(user, pkg);

    res.status(200).json({
      success: true,
      message: `${pkg.name} plan active! $${pkg.price} charged. Renews on ${summary.renewsOn.toLocaleDateString()}.`,
      package: pkg,
      subscription: summary,
      user
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get current contractor subscription status
 * @route   GET /api/contractor/package/subscription
 * @access  Private/Contractor
 */
exports.getSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('packageId');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const pkg = user.packageId || await Package.findOne({ name: 'Basic' });
    const subscription = subscriptionService.getSubscriptionSummary(user, pkg);

    res.status(200).json({ success: true, subscription, user, package: pkg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Hand over / assign a contract to a worker
 * @route   POST /api/contractor/workers/:id/assign
 * @access  Private/Contractor
 */
exports.assignWorkerToContract = async (req, res) => {
  try {
    const { contractId } = req.body;
    const workerId = req.params.id;

    if (!contractId) {
      return res.status(400).json({ success: false, message: 'Contract ID is required' });
    }

    const contract = await Contract.findById(contractId);
    if (!contract) {
      return res.status(404).json({ success: false, message: 'Contract not found' });
    }

    if (contract.contractorId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to modify this contract' });
    }

    const worker = await User.findOne({ _id: workerId, role: 'worker', contractorId: req.user.id });
    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found in your roster' });
    }

    const isAssigned = contract.workers.some(w => w.toString() === workerId);
    if (isAssigned) {
      return res.status(400).json({ success: false, message: 'Worker is already assigned to this contract' });
    }

    contract.workers.push(workerId);
    await contract.save();

    const responseDeadline = new Date(Date.now() + 120 * 60 * 1000);
    const assignment = await WorkerAssignment.create({
      contractId: contract._id,
      workerId,
      responseDeadline
    });

    const io = req.app.get('socketio');
    if (io) {
      const { notifyUser } = require('../services/notificationService');
      await notifyUser(io, {
        userId: workerId,
        type: 'contract_request',
        title: 'New Contract Assignment Handover',
        message: `You have been assigned a cleaning contract at ${contract.location.address}.`,
        data: {
          assignmentId: assignment._id,
          contractId: contract._id,
          clientName: contract.clientName,
          address: contract.location.address,
          date: contract.schedule.date,
          startTime: contract.schedule.startTime,
          durationMinutes: contract.schedule.durationMinutes,
          responseDeadline
        },
        socketEvent: 'worker_assignment'
      });
    }

    res.status(200).json({ success: true, message: `Successfully assigned ${worker.name} to the contract.`, contract, assignment });
  } catch (error) {
    console.error('Assign Worker to Contract Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Toggle package subscription auto-renew or cancel renewal
 * @route   POST /api/contractor/package/renew-option
 * @access  Private/Contractor
 */
exports.setRenewOption = async (req, res) => {
  try {
    const { autoRenew } = req.body;
    const user = await User.findById(req.user.id).populate('packageId');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const pkg = user.packageId || await Package.findOne({ name: 'Basic' });
    const summary = subscriptionService.getSubscriptionSummary(user, pkg);

    if (autoRenew === false) {
      user.planAutoRenew = false;
      user.planStatus = 'active';
      await user.save();
      return res.status(200).json({
        success: true,
        message: `Auto-renew cancelled. Your plan stays active until ${summary.renewsOn?.toLocaleDateString()}. No further monthly charges after that.`,
        subscription: subscriptionService.getSubscriptionSummary(user, pkg),
        user
      });
    }

    user.planAutoRenew = true;
    if (user.planStatus === 'expired') {
      user.planStatus = 'active';
    }
    await user.save();
    return res.status(200).json({
      success: true,
      message: `Auto-renew enabled. Next charge of $${summary.nextChargeAmount} on ${summary.renewsOn?.toLocaleDateString()}.`,
      subscription: subscriptionService.getSubscriptionSummary(user, pkg),
      user
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Manually renew subscription plan
 * @route   POST /api/contractor/package/renew
 * @access  Private/Contractor
 */
exports.renewPackage = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('packageId');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const pkg = user.packageId || await Package.findOne({ name: 'Basic' });
    const { chargedAmount } = await subscriptionService.chargeRenewal(user, pkg);
    const summary = subscriptionService.getSubscriptionSummary(user, pkg);

    res.status(200).json({
      success: true,
      message: `Plan renewed for 30 days. $${chargedAmount} charged. Next renewal: ${summary.renewsOn.toLocaleDateString()}.`,
      subscription: summary,
      user
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
