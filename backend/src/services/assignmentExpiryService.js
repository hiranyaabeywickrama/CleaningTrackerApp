const WorkerAssignment = require('../models/WorkerAssignment');
const Contract = require('../models/Contract');
const { notifyUser } = require('./notificationService');

const processExpiredAssignments = async (io) => {
  const now = new Date();

  const expiredAssignments = await WorkerAssignment.find({
    response: 'pending',
    responseDeadline: { $lt: now }
  }).populate('contractId');

  if (!expiredAssignments.length) return { expired: 0 };

  const contractIds = new Set();

  for (const assignment of expiredAssignments) {
    assignment.response = 'expired';
    await assignment.save();

    const contract = assignment.contractId;
    if (!contract) continue;

    contractIds.add(contract._id.toString());

    await notifyUser(io, {
      userId: assignment.workerId,
      type: 'contract_expired',
      title: 'Contract Request Expired',
      message: 'You did not respond in time. This contract request has expired.',
      data: { contractId: contract._id, assignmentId: assignment._id },
      socketEvent: 'worker_notification'
    });

    if (contract.contractorId) {
      await notifyUser(io, {
        userId: contract.contractorId,
        type: 'contract_expired',
        title: 'Worker Did Not Respond',
        message: 'A worker did not respond before the deadline. The request has expired.',
        data: { contractId: contract._id, workerId: assignment.workerId },
        socketEvent: 'contractor_notification'
      });
    }
  }

  return { expired: expiredAssignments.length, contractsAffected: contractIds.size };
};

module.exports = { processExpiredAssignments };
