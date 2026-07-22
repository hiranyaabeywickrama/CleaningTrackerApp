const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Contract = require('../models/Contract');
const Package = require('../models/Package');
const WorkerAssignment = require('../models/WorkerAssignment');
const Attendance = require('../models/Attendance');
const reportService = require('../services/reportService');

// GET /api/admin/contractors
const getContractors = asyncHandler(async (req, res) => {
  const contractors = await User.find({ role: 'contractor' })
    .select('name email phoneNumber companyName createdAt status')
    .lean();

  const contractorIds = contractors.map((c) => c._id);
  const contracts = await Contract.find({ contractorId: { $in: contractorIds } })
    .populate('packageId', 'name maxWorkers price isDynamic')
    .lean();

  const result = contractors.map((c) => {
    const contractorContracts = contracts.filter(
      (ct) => (ct.contractorId?._id || ct.contractorId)?.toString() === c._id.toString()
    );
    const activeContracts = contractorContracts.filter((ct) =>
      ['pending', 'active'].includes(ct.status)
    );

    return {
      contractorId: c._id,
      name: c.name,
      companyName: c.companyName,
      email: c.email,
      phoneNumber: c.phoneNumber,
      activeContracts: activeContracts.length,
      totalContracts: contractorContracts.length,
      packages: [...new Set(contractorContracts.map((ct) => ct.packageId?.name).filter(Boolean))],
      registrationDate: c.createdAt,
      status: c.status
    };
  });

  res.json({ success: true, contractors: result });
});

// GET /api/admin/workers
const getWorkers = asyncHandler(async (req, res) => {
  const workers = await User.find({ role: 'worker' })
    .select('name email phoneNumber status createdAt')
    .lean();

  const assignments = await WorkerAssignment.find()
    .select('workerId contractId response')
    .lean();

  const completedContracts = await Contract.countDocuments({ status: 'completed' });

  const result = workers.map((w) => {
    const workerAssignments = assignments.filter(
      (a) => a.workerId && (a.workerId._id || a.workerId).toString() === w._id.toString()
    );
    const accepted = workerAssignments.filter((a) => a.response === 'accepted').length;

    return {
      workerId: w._id,
      workerCode: w._id.toString().slice(-6).toUpperCase(),
      name: w.name,
      email: w.email,
      phoneNumber: w.phoneNumber,
      availability: ['available', 'active_shift'].includes(w.status) ? 'Available' : w.status,
      assignedContracts: accepted,
      completedJobs: completedContracts,
      rating: null,
      status: w.status,
      registeredAt: w.createdAt
    };
  });

  res.json({ success: true, workers: result });
});

// GET /api/admin/workers/:id/history
const getWorkerHistory = asyncHandler(async (req, res) => {
  const workerId = req.params.id;

  const assignments = await WorkerAssignment.find({ workerId })
    .populate({
      path: 'contractId',
      populate: [{ path: 'contractorId', select: 'name companyName email' }, { path: 'packageId', select: 'name price' }]
    })
    .sort('-createdAt')
    .lean();

  const attendance = await Attendance.find({ worker: workerId })
    .sort('-clockIn')
    .limit(50)
    .lean();

  const decisions = {
    accepted: assignments.filter((a) => a.response === 'accepted').length,
    rejected: assignments.filter((a) => a.response === 'rejected').length,
    expired: assignments.filter((a) => a.response === 'expired').length,
    waitlisted: assignments.filter((a) => a.response === 'waitlisted').length,
    pending: assignments.filter((a) => a.response === 'pending').length
  };

  res.json({
    success: true,
    history: {
      assignments: assignments.map((a) => ({
        assignmentId: a._id,
        response: a.response,
        responseDeadline: a.responseDeadline,
        contract: a.contractId,
        createdAt: a.createdAt
      })),
      attendance,
      decisions,
      performance: {
        totalRequests: assignments.length,
        acceptanceRate:
          assignments.length > 0
            ? Math.round((decisions.accepted / assignments.length) * 100)
            : 0
      }
    }
  });
});

// GET /api/admin/contracts
const getAllContracts = asyncHandler(async (req, res) => {
  const contracts = await Contract.find()
    .populate('contractorId', 'name companyName email phoneNumber')
    .populate('packageId', 'name price maxWorkers')
    .populate('workers', 'name email status')
    .sort('-createdAt')
    .lean();

  res.json({ success: true, count: contracts.length, contracts });
});

// GET /api/admin/reports
const getReports = asyncHandler(async (req, res) => {
  const reports = await reportService.generateSummary();
  res.json({ success: true, ...reports });
});

// GET /api/admin/packages
const getPackages = asyncHandler(async (req, res) => {
  const packages = await Package.find().sort('price');
  res.json({ success: true, packages });
});

// PUT /api/admin/packages/:id
const updatePackage = asyncHandler(async (req, res) => {
  const { price, maxWorkers, features } = req.body;
  const pkg = await Package.findByIdAndUpdate(
    req.params.id,
    { ...(price !== undefined && { price }), ...(maxWorkers !== undefined && { maxWorkers }), ...(features && { features }) },
    { new: true, runValidators: true }
  );
  if (!pkg) {
    res.status(404);
    throw new Error('Package not found');
  }
  res.json({ success: true, package: pkg });
});

module.exports = {
  getContractors,
  getWorkers,
  getWorkerHistory,
  getAllContracts,
  getReports,
  getPackages,
  updatePackage
};
