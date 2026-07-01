const WorkerAssignment = require('../models/WorkerAssignment');
const Contract = require('../models/Contract');
const Job = require('../models/Job');
const User = require('../models/User');
const { notifyUser } = require('../services/notificationService');

const activateContractIfReady = async (contractId) => {
  const contract = await Contract.findById(contractId);
  if (!contract || contract.status === 'active') return contract;

  const acceptedCount = await WorkerAssignment.countDocuments({
    contractId,
    response: 'accepted'
  });

  if (acceptedCount >= contract.requiredWorkersCount) {
    contract.status = 'active';
    await contract.save();
  }

  return contract;
};

const createJobForWorker = async (contract, workerId) => {
  const baseDate = new Date(contract.schedule.date);
  const [hours, minutes] = (contract.schedule.startTime || '09:00').split(':');
  baseDate.setHours(parseInt(hours, 10) || 9);
  baseDate.setMinutes(parseInt(minutes, 10) || 0);

  const existingJob = await Job.findOne({
    assignedWorker: workerId,
    contractor: contract.contractorId,
    address: contract.location.address
  });

  if (existingJob) return existingJob;

  return Job.create({
    customerName: contract.clientName,
    address: contract.location.address,
    latitude: contract.location.coordinates.lat,
    longitude: contract.location.coordinates.lng,
    assignedWorker: workerId,
    contractor: contract.contractorId,
    contractId: contract._id,
    startTime: baseDate,
    expectedHours: contract.schedule.durationMinutes / 60 || 2,
    notes: contract.notes,
    status: 'pending'
  });
};

exports.getAssignments = async (req, res) => {
  try {
    const now = new Date();

    await WorkerAssignment.updateMany(
      { workerId: req.user.id, response: 'pending', responseDeadline: { $lt: now } },
      { response: 'expired' }
    );

    const assignments = await WorkerAssignment.find({ workerId: req.user.id })
      .populate({
        path: 'contractId',
        populate: [
          { path: 'contractorId', select: 'name email companyName phoneNumber' },
          { path: 'packageId', select: 'name price maxWorkers' }
        ]
      })
      .sort('-createdAt');

    res.status(200).json({ success: true, count: assignments.length, assignments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.respondToAssignment = async (req, res) => {
  try {
    const { response } = req.body;
    const assignmentId = req.params.id;
    const io = req.app.get('socketio');

    if (!['accepted', 'rejected'].includes(response)) {
      return res.status(400).json({ success: false, message: 'Invalid response. Choose accepted or rejected.' });
    }

    const assignment = await WorkerAssignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Contract request assignment not found' });
    }

    if (assignment.workerId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You are not authorized to respond to this assignment' });
    }

    if (assignment.response !== 'pending') {
      return res.status(400).json({ success: false, message: `You have already ${assignment.response} this request` });
    }

    if (new Date() > assignment.responseDeadline) {
      assignment.response = 'expired';
      await assignment.save();
      return res.status(400).json({ success: false, message: 'Request deadline has expired.' });
    }

    const contract = await Contract.findById(assignment.contractId);
    if (!contract) {
      return res.status(404).json({ success: false, message: 'Associated cleaning contract not found' });
    }

    let finalResponse = response;
    let job = null;

    if (response === 'accepted') {
      const acceptedCount = await WorkerAssignment.countDocuments({
        contractId: contract._id,
        response: 'accepted'
      });

      if (acceptedCount < contract.requiredWorkersCount) {
        assignment.response = 'accepted';
        assignment.workerStatus = 'Traveling';
        await assignment.save();
        await User.findByIdAndUpdate(req.user.id, { status: 'busy' });
        job = await createJobForWorker(contract, req.user.id);
        finalResponse = 'accepted';
      } else {
        assignment.response = 'waitlisted';
        await assignment.save();
        finalResponse = 'waitlisted';
      }
    } else {
      assignment.response = 'rejected';
      await assignment.save();
      finalResponse = 'rejected';

      const nextBackup = await WorkerAssignment.findOne({
        contractId: contract._id,
        response: 'waitlisted'
      }).sort({ updatedAt: 1 });

      if (nextBackup) {
        nextBackup.response = 'accepted';
        nextBackup.workerStatus = 'Traveling';
        await nextBackup.save();
        await User.findByIdAndUpdate(nextBackup.workerId, { status: 'busy' });
        await createJobForWorker(contract, nextBackup.workerId);

        await notifyUser(io, {
          userId: nextBackup.workerId,
          type: 'contract_promoted',
          title: 'Promoted from Waitlist',
          message: 'You have been promoted from the waitlist to the confirmed crew.',
          data: { contractId: contract._id },
          socketEvent: 'worker_notification'
        });

        await notifyUser(io, {
          userId: contract.contractorId,
          type: 'contract_promoted',
          title: 'Backup Worker Promoted',
          message: `Worker ${req.user.name || 'someone'} rejected the job, but a waitlisted worker was promoted.`,
          data: { contractId: contract._id, workerId: nextBackup.workerId },
          socketEvent: 'contractor_notification'
        });
      } else {
        await notifyUser(io, {
          userId: contract.contractorId,
          type: 'worker_rejected_assignment',
          title: 'Worker Rejected Assignment',
          message: `${req.user.name} has rejected your contract request. Please select a replacement.`,
          data: { contractId: contract._id, assignmentId: assignment._id },
          socketEvent: 'contractor_notification'
        });
      }
    }

    const updatedContract = await activateContractIfReady(contract._id);

    if (finalResponse !== 'rejected') {
      await notifyUser(io, {
        userId: contract.contractorId,
        type: finalResponse === 'accepted' ? 'contract_accepted' : 'contract_rejected',
        title: finalResponse === 'waitlisted' ? 'Worker Waitlisted' : `Worker ${finalResponse}`,
        message:
          finalResponse === 'waitlisted'
            ? `${req.user.name} accepted but is on the waitlist (slots filled).`
            : finalResponse === 'rejected'
              ? `${req.user.name} has rejected your contract request. Please assign that job to another crew member.`
              : `${req.user.name} has accepted your contract request.`,
        data: { contractId: contract._id, workerId: req.user._id, response: finalResponse },
        socketEvent: 'contractor_notification'
      });
    }

    if (updatedContract?.status === 'active') {
      await notifyUser(io, {
        userId: contract.contractorId,
        type: 'contract_active',
        title: 'Contract Now Active',
        message: 'Required workers have accepted. Contract is now active with live tracking enabled.',
        data: { contractId: contract._id },
        socketEvent: 'contractor_notification'
      });
    }

    res.status(200).json({
      success: true,
      message:
        finalResponse === 'waitlisted'
          ? 'Roster filled. You have been waitlisted as a backup worker.'
          : `You have successfully ${finalResponse} the contract request.`,
      assignment,
      job,
      contractStatus: updatedContract?.status
    });
  } catch (error) {
    console.error('Worker Respond Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const Notification = require('../models/Notification');
    const notifications = await Notification.find({ userId: req.user.id }).sort('-createdAt').limit(50);
    res.json({ success: true, notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const Notification = require('../models/Notification');
    await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { read: true }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.startAssignmentJob = async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const assignment = await WorkerAssignment.findById(assignmentId).populate('contractId');
    
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    if (assignment.workerId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to start this job' });
    }

    if (assignment.checkInTime) {
      return res.status(400).json({ success: false, message: 'Job has already been started' });
    }

    // Validate allocated time (30 minutes buffer before scheduled start time)
    let startTimeToCheck = null;
    const Job = require('../models/Job');
    const job = await Job.findOne({
      assignedWorker: req.user.id,
      contractId: assignment.contractId?._id || assignment.contractId,
      status: 'pending'
    });

    if (job) {
      startTimeToCheck = job.startTime;
    } else if (assignment.contractId && assignment.contractId.schedule) {
      const schedule = assignment.contractId.schedule;
      const baseDate = new Date(schedule.date);
      const [hours, minutes] = (schedule.startTime || '09:00').split(':');
      baseDate.setHours(parseInt(hours, 10) || 9);
      baseDate.setMinutes(parseInt(minutes, 10) || 0);
      baseDate.setSeconds(0);
      baseDate.setMilliseconds(0);
      startTimeToCheck = baseDate;
    }

    if (startTimeToCheck) {
      const allowedTime = new Date(startTimeToCheck).getTime() - 30 * 60 * 1000;
      if (Date.now() < allowedTime) {
        return res.status(400).json({
          success: false,
          message: 'Cannot start job yet. You can only start up to 30 minutes prior to the scheduled start time.'
        });
      }
    }

    assignment.checkInTime = new Date();
    assignment.workerStatus = 'Working';
    await assignment.save();

    // Also update associated Job if exists
    await Job.findOneAndUpdate(
      { assignedWorker: req.user.id, contractId: assignment.contractId?._id || assignment.contractId, status: 'pending' },
      { status: 'started', actualStartTime: new Date() }
    );

    res.status(200).json({ success: true, message: 'Job started successfully', assignment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.endAssignmentJob = async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const assignment = await WorkerAssignment.findById(assignmentId).populate('contractId');
    
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    if (assignment.workerId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to end this job' });
    }

    if (!assignment.checkInTime) {
      return res.status(400).json({ success: false, message: 'Job has not been started yet' });
    }

    if (assignment.checkOutTime) {
      return res.status(400).json({ success: false, message: 'Job has already been completed' });
    }

    assignment.checkOutTime = new Date();
    assignment.workerStatus = 'Completed';

    // Calculate actual worked duration in minutes
    const diffMs = assignment.checkOutTime - assignment.checkInTime;
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    
    // Time spent outside work area
    let extraOutsideMins = 0;
    if (assignment.outsideStartTime) {
      const outsideMs = assignment.checkOutTime - assignment.outsideStartTime;
      extraOutsideMins = Math.floor(outsideMs / (1000 * 60));
      assignment.timeSpentOutsideMinutes = (assignment.timeSpentOutsideMinutes || 0) + extraOutsideMins;
      assignment.outsideStartTime = null;
    }

    assignment.actualWorkedMinutes = Math.max(0, Math.round(totalMinutes - (assignment.timeSpentOutsideMinutes || 0)));

    // Generate GPS Attendance Summary
    const violations = assignment.totalViolations || 0;
    if (violations === 0) {
      assignment.gpsAttendanceSummary = 'Good';
    } else if (violations <= 2) {
      assignment.gpsAttendanceSummary = 'Minor Issues';
    } else {
      assignment.gpsAttendanceSummary = 'Attendance Warning';
    }

    await assignment.save();

    // Also update associated Job if exists
    await Job.findOneAndUpdate(
      { assignedWorker: req.user.id, contractId: assignment.contractId?._id || assignment.contractId, status: 'started' },
      { 
        status: 'completed', 
        actualEndTime: new Date(), 
        totalHoursWorked: parseFloat((assignment.actualWorkedMinutes / 60).toFixed(2)) 
      }
    );

    // Update worker User status
    await User.findByIdAndUpdate(req.user.id, { status: 'available' });

    // Cascade check
    const contractId = assignment.contractId._id;
    const pendingActiveCrewCount = await WorkerAssignment.countDocuments({
      contractId,
      response: 'accepted',
      workerStatus: { $ne: 'Completed' }
    });

    if (pendingActiveCrewCount === 0) {
      const updatedContract = await Contract.findByIdAndUpdate(contractId, { status: 'completed' }, { new: true }).populate('contractorId');
      
      const io = req.app.get('socketio');
      if (io) {
        const { notifyUser } = require('../services/notificationService');
        
        // Notify Contractor
        if (updatedContract && updatedContract.contractorId) {
          await notifyUser(io, {
            userId: updatedContract.contractorId._id,
            type: 'contract_completed',
            title: 'Contract Completed',
            message: `The cleaning contract at ${updatedContract.location?.address} has been completed by the crew.`,
          });
        }
        
        // Notify Client if applicable
        if (updatedContract && updatedContract.clientRequestId) {
          const ClientRequest = require('../models/ClientRequest');
          const clientReq = await ClientRequest.findByIdAndUpdate(updatedContract.clientRequestId, { status: 'completed' }, { new: true }).populate('clientId');
          
          if (clientReq && clientReq.clientId) {
            await notifyUser(io, {
              userId: clientReq.clientId._id,
              type: 'contract_completed',
              title: 'Service Completed',
              message: `Your requested cleaning service at ${clientReq.location?.address} has been completed.`
            });
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Job completed successfully',
      summary: {
        checkInTime: assignment.checkInTime,
        checkOutTime: assignment.checkOutTime,
        actualWorkedMinutes: assignment.actualWorkedMinutes,
        totalViolations: assignment.totalViolations,
        timeSpentOutsideMinutes: assignment.timeSpentOutsideMinutes,
        gpsAttendanceSummary: assignment.gpsAttendanceSummary
      },
      assignment
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get open freelance jobs matching worker capabilities and state
 * @route   GET /api/worker/freelance
 * @access  Private/Worker
 */
exports.getFreelanceJobsForWorker = async (req, res) => {
  try {
    const FreelanceJob = require('../models/FreelanceJob');
    const capabilities = req.user.tags || [];
    const state = req.user.state || '';

    const filter = {
      status: 'open',
      $or: [
        {
          targetType: 'public',
          ...(capabilities.length > 0 ? { category: { $in: capabilities } } : {}),
          ...(state ? { location: { $regex: state, $options: 'i' } } : {})
        },
        {
          targetType: 'crew',
          contractor: req.user.contractorId
        }
      ]
    };

    const freelanceJobs = await FreelanceJob.find(filter)
      .populate('contractor', 'name companyName email phoneNumber')
      .sort('-createdAt');

    res.status(200).json({ success: true, count: freelanceJobs.length, freelanceJobs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Apply/request for a freelance job opening
 * @route   POST /api/worker/freelance/:id/apply
 * @access  Private/Worker
 */
exports.applyForFreelanceJob = async (req, res) => {
  try {
    const FreelanceJob = require('../models/FreelanceJob');
    const freelanceJob = await FreelanceJob.findById(req.params.id);

    if (!freelanceJob) {
      return res.status(404).json({ success: false, message: 'Freelance job not found' });
    }

    if (freelanceJob.status !== 'open') {
      return res.status(400).json({ success: false, message: 'Freelance job is no longer open for applications' });
    }

    if (freelanceJob.targetType === 'crew') {
      // Direct acceptance flow: worker accepts a crew shift
      freelanceJob.approvedWorker = req.user.id;
      freelanceJob.status = 'filled';
      await freelanceJob.save();

      const Package = require('../models/Package');
      const Contract = require('../models/Contract');
      const WorkerAssignment = require('../models/WorkerAssignment');
      const Job = require('../models/Job');
      const User = require('../models/User');

      const contractorUser = await User.findById(freelanceJob.contractor);
      let packageId = contractorUser ? contractorUser.packageId : null;
      if (!packageId) {
        const basicPkg = await Package.findOne({ name: 'Basic' });
        if (basicPkg) packageId = basicPkg._id;
      }

      // Automatically associate the worker to this contractor if not already done
      if (!req.user.contractorId || req.user.contractorId.toString() !== freelanceJob.contractor.toString()) {
        await User.findByIdAndUpdate(req.user.id, { contractorId: freelanceJob.contractor });
      }

      const contract = await Contract.create({
        contractorId: freelanceJob.contractor,
        clientName: `Freelance Job: ${freelanceJob.category}`,
        location: {
          address: freelanceJob.location,
          coordinates: {
            lat: 40.7128,
            lng: -73.9786
          }
        },
        packageId,
        workers: [req.user.id],
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
        workerId: req.user.id,
        response: 'accepted',
        workerStatus: 'Traveling',
        responseDeadline
      });

      const baseDate = new Date(contract.schedule.date);
      const [hours, minutes] = (contract.schedule.startTime || '09:00').split(':');
      baseDate.setHours(parseInt(hours, 10) || 9);
      baseDate.setMinutes(parseInt(minutes, 10) || 0);

      await Job.create({
        customerName: contract.clientName,
        address: contract.location.address,
        latitude: contract.location.coordinates.lat,
        longitude: contract.location.coordinates.lng,
        assignedWorker: req.user.id,
        contractor: freelanceJob.contractor,
        contractId: contract._id,
        startTime: baseDate,
        expectedHours: freelanceJob.hours,
        notes: contract.notes,
        status: 'pending'
      });

      const io = req.app.get('socketio');
      if (io) {
        const { notifyUser } = require('../services/notificationService');
        await notifyUser(io, {
          userId: freelanceJob.contractor,
          type: 'freelance_accepted',
          title: 'Freelance Job Accepted!',
          message: `${req.user.name} has accepted the ${freelanceJob.category} freelance job.`
        });
      }

      return res.status(200).json({ success: true, message: 'Successfully accepted the crew freelance job!', freelanceJob, contract });
    }

    // Public shift: normal application flow
    if (freelanceJob.applicants.includes(req.user.id)) {
      return res.status(400).json({ success: false, message: 'You have already applied for this job' });
    }

    freelanceJob.applicants.push(req.user.id);
    await freelanceJob.save();

    const io = req.app.get('socketio');
    if (io) {
      const { notifyUser } = require('../services/notificationService');
      await notifyUser(io, {
        userId: freelanceJob.contractor,
        type: 'freelance_applied',
        title: 'New Freelance Application',
        message: `${req.user.name} has applied for your ${freelanceJob.category} freelance job.`
      });
    }

    res.status(200).json({ success: true, message: 'Successfully applied for the freelance job!', freelanceJob });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get contractors worker has worked with or is associated with
 * @route   GET /api/worker/contractors
 * @access  Private/Worker
 */
exports.getAssociatedContractors = async (req, res) => {
  try {
    const contractorIds = new Set();
    if (req.user.contractorId) {
      contractorIds.add(req.user.contractorId.toString());
    }

    const assignments = await WorkerAssignment.find({ workerId: req.user.id })
      .populate({
        path: 'contractId',
        select: 'contractorId'
      });

    assignments.forEach(assign => {
      if (assign.contractId && assign.contractId.contractorId) {
        contractorIds.add(assign.contractId.contractorId.toString());
      }
    });

    const contractors = await User.find({ _id: { $in: Array.from(contractorIds) } }).select('name companyName email phoneNumber tags locations');

    res.status(200).json({ success: true, count: contractors.length, contractors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get projects/shifts for a specific contractor
 * @route   GET /api/worker/contractors/:id/projects
 * @access  Private/Worker
 */
exports.getContractorProjectsForWorker = async (req, res) => {
  try {
    const contractorId = req.params.id;
    const Job = require('../models/Job');
    const WorkerAssignment = require('../models/WorkerAssignment');

    const jobs = await Job.find({
      assignedWorker: req.user.id,
      contractor: contractorId
    }).lean();

    const assignments = await WorkerAssignment.find({
      workerId: req.user.id,
      response: { $in: ['accepted', 'completed'] }
    }).populate('contractId').lean();

    const formattedAssignments = assignments
      .filter(a => a.contractId && (a.contractId.contractorId?.toString() === contractorId.toString()))
      .map(a => {
        const c = a.contractId;
        return {
          _id: a._id,
          status: c.status,
          customerName: c.clientName,
          address: c.location?.address,
          startTime: c.schedule?.date,
          totalHoursWorked: a.actualWorkedMinutes ? parseFloat((a.actualWorkedMinutes / 60).toFixed(2)) : 
                            (c.schedule?.durationMinutes ? parseFloat((c.schedule.durationMinutes / 60).toFixed(2)) : 0),
          expectedHours: c.schedule?.durationMinutes ? c.schedule.durationMinutes / 60 : 2
        };
      });

    const allProjects = [...jobs, ...formattedAssignments].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    res.status(200).json({ success: true, count: allProjects.length, jobs: allProjects });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
