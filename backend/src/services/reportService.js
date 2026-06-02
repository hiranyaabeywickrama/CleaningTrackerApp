const User = require('../models/User');
const Contract = require('../models/Contract');
const WorkerAssignment = require('../models/WorkerAssignment');
const Attendance = require('../models/Attendance');

const generateSummary = async () => {
  const [
    totalWorkers,
    totalContractors,
    activeContracts,
    completedJobs,
    pendingContracts,
    totalAssignments,
    acceptedAssignments,
    rejectedAssignments,
    expiredAssignments
  ] = await Promise.all([
    User.countDocuments({ role: 'worker' }),
    User.countDocuments({ role: 'contractor' }),
    Contract.countDocuments({ status: 'active' }),
    Contract.countDocuments({ status: 'completed' }),
    Contract.countDocuments({ status: 'pending' }),
    WorkerAssignment.countDocuments(),
    WorkerAssignment.countDocuments({ response: 'accepted' }),
    WorkerAssignment.countDocuments({ response: 'rejected' }),
    WorkerAssignment.countDocuments({ response: 'expired' })
  ]);

  const attendanceRecords = await Attendance.countDocuments();

  return {
    totalWorkers,
    totalContractors,
    activeContracts,
    completedJobs,
    pendingContracts,
    totalContracts: activeContracts + completedJobs + pendingContracts,
    totalAssignments,
    acceptedAssignments,
    rejectedAssignments,
    expiredAssignments,
    attendanceRecords,
    workerPerformance: {
      acceptanceRate:
        totalAssignments > 0 ? Math.round((acceptedAssignments / totalAssignments) * 100) : 0
    }
  };
};

module.exports = { generateSummary };
