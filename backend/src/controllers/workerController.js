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
          message: 'A waitlisted worker was automatically promoted to confirmed roster.',
          data: { contractId: contract._id, workerId: nextBackup.workerId },
          socketEvent: 'contractor_notification'
        });
      }
    }

    const updatedContract = await activateContractIfReady(contract._id);

    await notifyUser(io, {
      userId: contract.contractorId,
      type: finalResponse === 'accepted' ? 'contract_accepted' : 'contract_rejected',
      title: finalResponse === 'waitlisted' ? 'Worker Waitlisted' : `Worker ${finalResponse}`,
      message:
        finalResponse === 'waitlisted'
          ? `${req.user.name} accepted but is on the waitlist (slots filled).`
          : `${req.user.name} has ${finalResponse} your contract request.`,
      data: { contractId: contract._id, workerId: req.user._id, response: finalResponse },
      socketEvent: 'contractor_notification'
    });

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
    const assignment = await WorkerAssignment.findById(assignmentId);
    
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    if (assignment.workerId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to start this job' });
    }

    if (assignment.checkInTime) {
      return res.status(400).json({ success: false, message: 'Job has already been started' });
    }

    assignment.checkInTime = new Date();
    assignment.workerStatus = 'Working';
    await assignment.save();

    // Also update associated Job if exists
    await Job.findOneAndUpdate(
      { assignedWorker: req.user.id, status: 'pending' },
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
      { assignedWorker: req.user.id, status: 'started' },
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
      await Contract.findByIdAndUpdate(contractId, { status: 'completed' });
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
