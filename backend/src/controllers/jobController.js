const Job = require('../models/Job');
const User = require('../models/User');

// @desc    Create a new job (Admin or Contractor)
// @route   POST /api/jobs/create
// @access  Private (Admin or Contractor)
exports.createJob = async (req, res) => {
  try {
    const {
      customerName,
      clientName, // fallback
      address,
      latitude,
      longitude,
      geofenceRadius,
      assignedWorker,
      contractor,
      startTime,
      scheduledTime, // fallback
      expectedHours,
      notes
    } = req.body;

    const parsedCustomerName = customerName || clientName;
    const parsedStartTime = startTime || scheduledTime;

    if (!parsedCustomerName || !address || latitude === undefined || longitude === undefined || !parsedStartTime) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields: customerName, address, latitude, longitude, and startTime' });
    }

    let finalAssignedWorker = assignedWorker || null;
    let finalContractor = contractor || null;

    // If creator is Contractor, bind their user ID
    if (req.user.role === 'contractor') {
      finalContractor = req.user.id;
    }

    // Verify worker exists if provided
    if (finalAssignedWorker) {
      const worker = await User.findById(finalAssignedWorker);
      if (!worker || worker.role !== 'worker') {
        return res.status(404).json({ success: false, message: 'Assigned worker not found or is not a worker' });
      }
    }

    // Verify contractor exists if provided
    if (finalContractor) {
      const contr = await User.findById(finalContractor);
      if (!contr || contr.role !== 'contractor') {
        return res.status(404).json({ success: false, message: 'Contractor not found or is not a contractor' });
      }
    }

    const job = await Job.create({
      customerName: parsedCustomerName,
      address,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      geofenceRadius: geofenceRadius || 200,
      assignedWorker: finalAssignedWorker,
      contractor: finalContractor,
      startTime: new Date(parsedStartTime),
      expectedHours: parseFloat(expectedHours) || 2,
      notes
    });

    res.status(201).json({
      success: true,
      job
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Assign a worker to an existing job (Admin only)
// @route   PUT /api/jobs/:id/assign
// @access  Private/Admin
exports.assignWorker = async (req, res) => {
  try {
    const { assignedWorker } = req.body;
    const jobId = req.params.id;

    if (!assignedWorker) {
      return res.status(400).json({ success: false, message: 'Please provide an assigned worker ID' });
    }

    // Verify worker exists
    const worker = await User.findById(assignedWorker);
    if (!worker || worker.role !== 'worker') {
      return res.status(404).json({ success: false, message: 'Worker not found or is not a worker' });
    }

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const updatedJob = await Job.findByIdAndUpdate(
      jobId,
      { assignedWorker },
      { new: true }
    ).populate('assignedWorker', 'name email status')
     .populate('contractor', 'name email');

    res.status(200).json({
      success: true,
      job: updatedJob
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get assigned jobs for current worker
// @route   GET /api/jobs/worker
// @access  Private/Worker
exports.getWorkerJobs = async (req, res) => {
  try {
    const jobs = await Job.find({ assignedWorker: req.user.id })
      .populate('contractor', 'name email')
      .sort('-startTime');

    res.status(200).json({
      success: true,
      count: jobs.length,
      jobs
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all jobs (Admin can see all, Contractor sees their created ones)
// @route   GET /api/jobs/all
// @access  Private
exports.getAllJobs = async (req, res) => {
  try {
    let filter = {};

    // Contractors can only see jobs they sub-contracted/created
    if (req.user.role === 'contractor') {
      filter.contractor = req.user.id;
    }

    const jobs = await Job.find(filter)
      .populate('assignedWorker', 'name email status')
      .populate('contractor', 'name email')
      .sort('-startTime');

    res.status(200).json({
      success: true,
      count: jobs.length,
      jobs
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update job status (Start / End cleaning)
// @route   PUT /api/jobs/:id/status
// @access  Private/Worker
exports.updateJobStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const jobId = req.params.id;

    if (!['started', 'completed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Choose started or completed.' });
    }

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    // Ensure worker is the one assigned
    if ((!job.assignedWorker || job.assignedWorker.toString() !== req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You are not authorized to update this job' });
    }

    const updateFields = { status };

    if (status === 'started') {
      const allowedTime = new Date(job.startTime).getTime() - 30 * 60 * 1000;
      if (Date.now() < allowedTime) {
        return res.status(400).json({
          success: false,
          message: 'Cannot start job yet. You can only start up to 30 minutes prior to the scheduled start time.'
        });
      }
      updateFields.actualStartTime = new Date();
      
      // Update worker user status
      if (job.assignedWorker) {
        await User.findByIdAndUpdate(job.assignedWorker, { status: 'cleaning' });
      }

      // Sync corresponding WorkerAssignment check-in time and status
      if (job.contractId) {
        const WorkerAssignment = require('../models/WorkerAssignment');
        await WorkerAssignment.findOneAndUpdate(
          { contractId: job.contractId, workerId: req.user.id },
          { checkInTime: updateFields.actualStartTime, workerStatus: 'Working' }
        );
      }
    } else if (status === 'completed') {
      if (job.status !== 'started') {
        return res.status(400).json({ success: false, message: 'Cannot complete a job that has not been started' });
      }

      updateFields.actualEndTime = new Date();
      
      // Calculate total worked hours
      const actualStart = job.actualStartTime ? new Date(job.actualStartTime) : new Date();
      const actualEnd = updateFields.actualEndTime;
      const diffMs = actualEnd - actualStart;
      const diffHrs = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));
      
      updateFields.totalHoursWorked = diffHrs;

      // Update worker user status back to active shift
      if (job.assignedWorker) {
        await User.findByIdAndUpdate(job.assignedWorker, { status: 'active_shift' });
      }

      // Sync corresponding WorkerAssignment check-out details
      if (job.contractId) {
        const WorkerAssignment = require('../models/WorkerAssignment');
        const assignment = await WorkerAssignment.findOne({ contractId: job.contractId, workerId: req.user.id });
        if (assignment && !assignment.checkOutTime) {
          assignment.checkOutTime = updateFields.actualEndTime;
          assignment.workerStatus = 'Completed';
          
          const assignCheckIn = assignment.checkInTime || actualStart;
          const assignmentDiffMs = assignment.checkOutTime - assignCheckIn;
          const totalMinutes = Math.floor(assignmentDiffMs / (1000 * 60));
          
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
        }
      }
    }

    const updatedJob = await Job.findByIdAndUpdate(jobId, updateFields, { new: true })
      .populate('assignedWorker', 'name email status')
      .populate('contractor', 'name email');

    // Emit live update event if socket server is attached
    if (req.app.get('socketio')) {
      const io = req.app.get('socketio');
      io.to('admin:monitor').emit('job_status_change', {
        jobId: updatedJob._id,
        workerId: updatedJob.assignedWorker ? updatedJob.assignedWorker._id : null,
        status: updatedJob.status,
        actualStartTime: updatedJob.actualStartTime,
        actualEndTime: updatedJob.actualEndTime,
        totalHoursWorked: updatedJob.totalHoursWorked
      });
    }

    res.status(200).json({
      success: true,
      job: updatedJob
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
