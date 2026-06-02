const GPSLog = require('../models/GPSLog');
const WorkerAssignment = require('../models/WorkerAssignment');
const Contract = require('../models/Contract');

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`Socket client connected: ${socket.id}`);

    const { role, userId } = socket.handshake.auth || {};

    if (role !== 'contractor' && role !== 'worker') {
      console.warn(`Socket connection rejected: role ${role} not permitted`);
      socket.disconnect(true);
      return;
    }

    socket.on('joinContractRoom', (contractId) => {
      if (role !== 'contractor') return;
      if (!contractId) return;
      socket.join(`contract:${contractId}`);
      console.log(`Contractor ${userId} joined contract room ${contractId}`);
    });

    socket.on('location_update', async ({ contractId, lat, lng, timestamp }) => {
      if (role !== 'worker') return;
      if (!contractId || lat === undefined || lng === undefined) return;

      try {
        const assignment = await WorkerAssignment.findOne({
          contractId,
          workerId: userId,
          response: 'accepted'
        }).populate('contractId');

        if (!assignment) return;

        const contract = assignment.contractId;
        if (!contract) return;

        const clientLat = contract.location.coordinates.lat;
        const clientLng = contract.location.coordinates.lng;

        // Calculate distance using accurate Haversine Formula
        const R = 6371000; // Earth radius in metres
        const phi1 = (clientLat * Math.PI) / 180;
        const phi2 = (lat * Math.PI) / 180;
        const deltaPhi = ((lat - clientLat) * Math.PI) / 180;
        const deltaLambda = ((lng - clientLng) * Math.PI) / 180;

        const a =
          Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
          Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c; // in metres

        const previousStatus = assignment.workerStatus;
        let currentStatus = previousStatus;

        // Geofence radius: 50 meters
        const isBreached = distance > 50;

        if (assignment.checkInTime && !assignment.checkOutTime) {
          // Worker has started job — run geofencing checks
          if (isBreached) {
            // Worker is outside work area
            if (previousStatus === 'Working' || previousStatus === 'Arrived' || previousStatus === 'Traveling' || !previousStatus) {
              currentStatus = 'Left Work Area';
              assignment.workerStatus = 'Left Work Area';
              assignment.totalViolations = (assignment.totalViolations || 0) + 1;
              assignment.outsideStartTime = new Date();
              
              // Log violation
              assignment.violationLogs.push({
                timestamp: new Date(),
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                reason: 'Left Work Area'
              });

              // Emit instant Geofence Breach socket alert to contractor
              io.to(`contract:${contractId}`).emit('geofence_alert', {
                type: 'breach',
                workerId: userId,
                workerName: socket.handshake.auth?.workerName || 'Cleaner',
                message: `⚠️ WARNING: Worker left the work area! Currently ${Math.round(distance)}m away.`,
                distance,
                timestamp: new Date()
              });
            }
          } else {
            // Worker is inside work area
            if (previousStatus === 'Left Work Area' || previousStatus === 'Traveling' || !previousStatus) {
              currentStatus = 'Working';
              assignment.workerStatus = 'Working';
              
              // Calculate outside breach duration
              if (assignment.outsideStartTime) {
                const diffMs = new Date() - assignment.outsideStartTime;
                const diffMins = diffMs / 1000 / 60;
                assignment.timeSpentOutsideMinutes = (assignment.timeSpentOutsideMinutes || 0) + diffMins;
                assignment.outsideStartTime = null;
              }

              // Emit Geofence Return socket alert to contractor
              io.to(`contract:${contractId}`).emit('geofence_alert', {
                type: 'return',
                workerId: userId,
                workerName: socket.handshake.auth?.workerName || 'Cleaner',
                message: `🛡️ SECURED: Worker returned to the work area.`,
                distance,
                timestamp: new Date()
              });
            } else if (previousStatus === 'Arrived') {
              currentStatus = 'Working';
              assignment.workerStatus = 'Working';
            }
          }
        } else {
          // Job not started yet — traveling or arrived
          if (isBreached) {
            assignment.workerStatus = 'Traveling';
            currentStatus = 'Traveling';
          } else {
            assignment.workerStatus = 'Arrived';
            currentStatus = 'Arrived';
          }
        }

        await assignment.save();

        const log = await GPSLog.create({
          workerId: userId,
          contractId,
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          timestamp: timestamp ? new Date(timestamp) : new Date()
        });

        // Calculate dynamic live duration timer parameters
        let workedMins = 0;
        if (assignment.checkInTime) {
          const diffMs = new Date() - assignment.checkInTime;
          let totalMins = diffMs / 1000 / 60;
          if (assignment.outsideStartTime) {
            const extraOutside = (new Date() - assignment.outsideStartTime) / 1000 / 60;
            workedMins = totalMins - (assignment.timeSpentOutsideMinutes || 0) - extraOutside;
          } else {
            workedMins = totalMins - (assignment.timeSpentOutsideMinutes || 0);
          }
        }

        io.to(`contract:${contractId}`).emit('worker_location', {
          userId,
          lat: log.lat,
          lng: log.lng,
          workerStatus: assignment.workerStatus,
          timestamp: log.timestamp,
          distanceToClient: Math.round(distance),
          totalViolations: assignment.totalViolations,
          timeSpentOutsideMinutes: parseFloat((assignment.timeSpentOutsideMinutes || 0).toFixed(2)),
          workedMinutes: Math.max(0, Math.floor(workedMins)),
          checkInTime: assignment.checkInTime
        });
      } catch (err) {
        console.error('Socket location_update error:', err.message);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket client disconnected: ${socket.id}`);
    });
  });
};
