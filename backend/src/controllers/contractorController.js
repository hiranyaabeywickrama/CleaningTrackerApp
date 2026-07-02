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
      notes,
      pricePerHour
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
      notes,
      pricePerHour: parseFloat(pricePerHour) || 25
    });

    // Create Worker Assignments with standard (24 hours = 1 day) or urgent (5 mins) timers
    const timerMinutes = !!isUrgent ? 5 : 24 * 60;
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
      const expiredAssignments = await WorkerAssignment.find({
        contractId: contract._id,
        response: 'pending',
        responseDeadline: { $lt: now }
      }).populate('workerId');

      for (let exp of expiredAssignments) {
        exp.response = 'expired';
        await exp.save();
        
        const io = req.app.get('socketio');
        await notifyUser(io, {
          userId: contract.contractorId,
          type: 'contract_expired',
          title: 'Worker Response Timeout',
          message: `Worker ${exp.workerId?.name || 'A crew member'} did not respond to the contract within 1 day. Please assign this job to another crew member.`,
          data: { contractId: contract._id, workerId: exp.workerId?._id },
          socketEvent: 'contractor_notification'
        });
      }

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
    
    const filter = { 
      status: 'pending',
      'offers.contractor': { $ne: req.user.id }
    };

    // Removed strict tags and location filtering so contractors can view all pending requests.
    // If needed in the future, advanced search/filter can be implemented on the frontend.

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
      return res.status(400).json({ success: false, message: 'You have already submitted a bid for this request' });
    }

    request.offers.push({
      contractor: req.user.id,
      price: parseFloat(price),
      status: 'pending'
    });

    await request.save();

    const { notifyUser } = require('../services/notificationService');
    const io = req.app.get('socketio');
    if (io) {
      await notifyUser(io, {
        userId: request.client,
        type: 'bid_submitted',
        title: 'New Bid Received! ✉️',
        message: `Contractor ${req.user.companyName || req.user.name} submitted a bid of $${price} for your ${request.category} request.`,
        socketEvent: 'client_notification'
      });
    }

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
    const { date, startTime, durationMinutes } = req.query;
    
    // 1. Fetch roster workers for this contractor
    let workers = await User.find({ role: 'worker', contractorId: req.user.id }).select('-password').lean();

    // 2. If scheduling parameters provided, check for conflicts
    if (date && startTime && durationMinutes) {
      const Contract = require('../models/Contract');
      const WorkerAssignment = require('../models/WorkerAssignment');
      
      // Calculate proposed start and end times in minutes from midnight for easy comparison
      const [pHours, pMins] = startTime.split(':').map(Number);
      const proposedStartMins = pHours * 60 + pMins;
      const proposedEndMins = proposedStartMins + parseInt(durationMinutes, 10);
      
      const targetDateStr = new Date(date).toISOString().split('T')[0];

      // Find all contracts on the same date that have assignments
      // We look at start of day to end of day to find contracts falling on the same date
      const startOfDay = new Date(targetDateStr);
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      const contractsOnDay = await Contract.find({
        'schedule.date': { $gte: startOfDay, $lt: endOfDay }
      }).lean();
      
      const contractIds = contractsOnDay.map(c => c._id);
      
      if (contractIds.length > 0) {
        // Find accepted or pending assignments for our roster workers on these contracts
        const workerIds = workers.map(w => w._id);
        const assignments = await WorkerAssignment.find({
          contractId: { $in: contractIds },
          workerId: { $in: workerIds },
          response: { $in: ['accepted', 'pending'] } // Consider both accepted and pending as busy
        }).lean();

        // Build a map of busy worker IDs
        const busyWorkerIds = new Set();
        
        for (const assignment of assignments) {
          const contract = contractsOnDay.find(c => c._id.toString() === assignment.contractId.toString());
          if (contract && contract.schedule) {
            const [cHours, cMins] = contract.schedule.startTime.split(':').map(Number);
            const contractStartMins = cHours * 60 + cMins;
            const contractEndMins = contractStartMins + contract.schedule.durationMinutes;
            
            // Check for overlap: Overlap happens if (StartA < EndB) and (StartB < EndA)
            if (proposedStartMins < contractEndMins && contractStartMins < proposedEndMins) {
              busyWorkerIds.add(assignment.workerId.toString());
            }
          }
        }
        
        // Mark workers as busy
        workers = workers.map(w => ({
          ...w,
          status: busyWorkerIds.has(w._id.toString()) ? 'busy' : w.status
        }));
      }
    }

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

    const contractor = await User.findById(req.user.id).populate('packageId');
    const currentPkg = (contractor && contractor.packageId) || await Package.findOne({ name: 'Basic' });
    const isPremium = currentPkg && currentPkg.name === 'Premium';
    const limit = isPremium ? Infinity : 5;

    const currentWorkersCount = await User.countDocuments({ role: 'worker', contractorId: req.user.id });

    if (!isPremium && currentWorkersCount >= limit) {
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

    const WorkerAssignment = require('../models/WorkerAssignment');
    const jobs = await Job.find(filter).lean();

    const assignmentFilter = {
      workerId: worker._id,
      response: { $in: ['accepted', 'completed'] }
    };
    
    const assignments = await WorkerAssignment.find(assignmentFilter).populate('contractId').lean();
    
    const formattedAssignments = assignments
      .filter(a => a.contractId && (a.contractId.contractorId?.toString() === req.user.id.toString()))
      .filter(a => {
        if (!startDate || !endDate) return true;
        const sDate = a.contractId.schedule?.date;
        if (!sDate) return false;
        const d = new Date(sDate);
        return d >= new Date(startDate) && d <= new Date(endDate);
      })
      .map(a => {
        const c = a.contractId;
        return {
          _id: a._id,
          contractId: c._id,
          status: c.status,
          customerName: c.clientName,
          address: c.location?.address,
          startTime: c.schedule?.date,
          totalHoursWorked: a.actualWorkedMinutes ? parseFloat((a.actualWorkedMinutes / 60).toFixed(2)) : 
                            (c.schedule?.durationMinutes ? parseFloat((c.schedule.durationMinutes / 60).toFixed(2)) : 0),
          expectedHours: c.schedule?.durationMinutes ? c.schedule.durationMinutes / 60 : 2
        };
      });

    const assignmentContractIds = new Set(formattedAssignments.map(a => a.contractId ? a.contractId.toString() : ''));
    const filteredJobs = jobs.filter(j => !j.contractId || !assignmentContractIds.has(j.contractId.toString()));

    const allProjects = [...filteredJobs, ...formattedAssignments].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    let totalHours = 0;
    const completedJobs = allProjects.filter(j => j.status === 'completed');
    completedJobs.forEach(job => {
      totalHours += job.totalHoursWorked || 0;
    });

    const hourlyRate = worker.hourlyRate || 25;
    const totalPayout = parseFloat((totalHours * hourlyRate).toFixed(2));

    res.status(200).json({
      success: true,
      worker,
      stats: {
        totalJobsCount: allProjects.length,
        completedJobsCount: completedJobs.length,
        totalHours,
        totalPayout,
        hourlyRate
      },
      jobs: allProjects
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
    const contractor = await User.findById(req.user.id).populate('packageId');
    const currentPkg = (contractor && contractor.packageId) || await Package.findOne({ name: 'Basic' });
    const isPremium = currentPkg && currentPkg.name === 'Premium';
    if (!isPremium) {
      return res.status(403).json({
        success: false,
        message: 'Your current package does not permit freelance worker access. Please upgrade to a Premium package.'
      });
    }

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
    
    // Notify workers
    const io = req.app.get('socketio');
    if (io) {
      const { notifyUser } = require('../services/notificationService');
      const targetWorkers = actualTargetType === 'crew' 
        ? await User.find({ role: 'worker', contractorId: req.user.id }).select('_id')
        : await User.find({ role: 'worker' }).select('_id');
        
      for (const w of targetWorkers) {
        await notifyUser(io, {
          userId: w._id,
          type: 'freelance_contract',
          title: 'New Freelance Opportunity!',
          message: `A new ${category} freelance job is available at ${location}.`,
        });
      }
    }
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
    const contractor = await User.findById(req.user.id).populate('packageId');
    const currentPkg = (contractor && contractor.packageId) || await Package.findOne({ name: 'Basic' });
    const isPremium = currentPkg && currentPkg.name === 'Premium';
    if (!isPremium) {
      return res.status(403).json({
        success: false,
        message: 'Your current package does not permit freelance worker access. Please upgrade to a Premium package.'
      });
    }

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

    const responseDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
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
      contractId: contract._id,
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

    const activeAssignment = await WorkerAssignment.findOne({
      contractId,
      workerId,
      response: { $in: ['pending', 'accepted'] }
    });
    if (activeAssignment) {
      return res.status(400).json({ success: false, message: 'Worker is already assigned to this contract' });
    }

    if (!contract.workers.some(w => w.toString() === workerId.toString())) {
      contract.workers.push(workerId);
      await contract.save();
    }

    const responseDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
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

/**
 * @desc    Hand over a completed project to client
 * @route   PUT /api/contractor/contracts/:id/handover
 * @access  Private/Contractor
 */
exports.handoverContract = async (req, res) => {
  try {
    const contractId = req.params.id;
    const contract = await Contract.findById(contractId);

    if (!contract) {
      return res.status(404).json({ success: false, message: 'Contract not found' });
    }

    if (contract.contractorId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to handover this project' });
    }

    contract.status = 'completed';
    await contract.save();

    // Optionally update all associated assignments/jobs
    const WorkerAssignment = require('../models/WorkerAssignment');
    await WorkerAssignment.updateMany(
      { contractId: contract._id, response: 'accepted' },
      { workerStatus: 'Completed' }
    );

    // Update ClientRequest and Notify Client if applicable
    if (contract.clientRequestId) {
      const ClientRequest = require('../models/ClientRequest');
      await ClientRequest.findByIdAndUpdate(contract.clientRequestId, { status: 'completed' });
    }

    if (contract.clientId) {
      const io = req.app.get('socketio');
      const { notifyUser } = require('../services/notificationService');
      await notifyUser(io, {
        userId: contract.clientId,
        type: 'project_completed',
        title: 'Project Completed! 🎉',
        message: 'Your project has been successfully completed and handed over by the contractor.',
        socketEvent: 'client_notification',
        data: { contractId: contract._id }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Project handed over successfully',
      contract
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.reassignWorker = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { workerId } = req.body;

    if (!workerId) {
      return res.status(400).json({ success: false, message: 'New workerId is required' });
    }

    const WorkerAssignment = require('../models/WorkerAssignment');
    const oldAssignment = await WorkerAssignment.findById(assignmentId);
    
    if (!oldAssignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    if (!['rejected', 'expired'].includes(oldAssignment.response)) {
      return res.status(400).json({ success: false, message: 'Only rejected or expired assignments can be reassigned' });
    }

    const contract = await Contract.findById(oldAssignment.contractId);
    if (!contract || contract.contractorId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized to reassign this contract' });
    }

    // Remove old worker from contract workers array if they are there, add new worker
    contract.workers = contract.workers.filter(id => id.toString() !== oldAssignment.workerId.toString());
    if (!contract.workers.includes(workerId)) {
      contract.workers.push(workerId);
    }
    await contract.save();

    // Create new assignment
    const timerMinutes = contract.isUrgent ? 5 : 24 * 60;
    const responseDeadline = new Date(Date.now() + timerMinutes * 60 * 1000); 

    const newAssignment = await WorkerAssignment.create({
      contractId: contract._id,
      workerId,
      responseDeadline
    });

    const io = req.app.get('socketio');
    const { notifyUser } = require('../services/notificationService');

    await notifyUser(io, {
      userId: workerId,
      type: 'contract_request',
      title: contract.isUrgent ? 'Urgent Contract Request' : 'New Contract Request',
      message: contract.isUrgent 
        ? `You have 10 minutes to respond to an urgent cleaning contract at ${contract.location.address}.`
        : `You have 24 hours to respond to a cleaning contract at ${contract.location.address}.`,
      data: {
        assignmentId: newAssignment._id,
        contractId: contract._id,
        clientName: contract.clientName,
        address: contract.location.address,
        date: contract.schedule.date,
        startTime: contract.schedule.startTime,
        durationMinutes: contract.schedule.durationMinutes,
        isUrgent: contract.isUrgent,
        responseDeadline,
        notes: contract.notes
      },
      socketEvent: 'worker_notification'
    });

    // Mark old assignment as replaced to prevent confusion (optional, or just leave it)
    oldAssignment.response = 'expired'; // Or we can add a 'replaced' status later if needed
    await oldAssignment.save();

    res.status(200).json({ success: true, message: 'Worker successfully reassigned', newAssignment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
