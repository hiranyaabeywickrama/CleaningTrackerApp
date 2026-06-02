const LocationLog = require('../models/LocationLog');
const Job = require('../models/Job');
const User = require('../models/User');

// Haversine formula to calculate distance between two coordinates in meters
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // radius of Earth in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // distance in meters
};

// @desc    Log worker GPS location and check geofence
// @route   POST /api/location/log
// @access  Private/Worker
exports.logLocation = async (req, res) => {
  try {
    const { latitude, longitude, speed, jobId } = req.body;
    const workerId = req.user.id;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, message: 'Please provide latitude and longitude' });
    }

    let geofenceStatus = 'not_applicable';
    let activeJob = null;
    let distanceToClient = 0;

    // Check if worker has an active job
    if (jobId) {
      activeJob = await Job.findById(jobId);
      if (activeJob && activeJob.status === 'started') {
        const clientLng = activeJob.location.coordinates[0];
        const clientLat = activeJob.location.coordinates[1];
        
        distanceToClient = calculateDistance(latitude, longitude, clientLat, clientLng);
        
        if (distanceToClient > activeJob.geofenceRadius) {
          geofenceStatus = 'outside_breach';
        } else {
          geofenceStatus = 'inside';
        }
      }
    }

    // Save location log
    const log = await LocationLog.create({
      worker: workerId,
      job: jobId || null,
      location: {
        type: 'Point',
        coordinates: [longitude, latitude] // GeoJSON format
      },
      speed: speed || 0,
      geofenceStatus
    });

    const populatedLog = {
      _id: log._id,
      worker: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email
      },
      job: jobId || null,
      coordinates: [longitude, latitude],
      speed: log.speed,
      geofenceStatus,
      distanceToClient,
      timestamp: log.timestamp
    };

    // Socket.io real-time broadcast
    if (req.app.get('socketio')) {
      const io = req.app.get('socketio');
      // Broadcast live worker coordinates to Admin listening room
      io.to('admin:monitor').emit('location_update', populatedLog);

      // Emit specific warning if breached
      if (geofenceStatus === 'outside_breach') {
        io.to('admin:monitor').emit('geofence_breach', {
          workerName: req.user.name,
          workerId: req.user.id,
          jobId: jobId,
          clientName: activeJob ? activeJob.clientName : 'Unknown',
          distance: Math.round(distanceToClient),
          geofenceRadius: activeJob ? activeJob.geofenceRadius : 200,
          timestamp: new Date()
        });
      }
    }

    res.status(201).json({
      success: true,
      log: populatedLog
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get active locations of all workers (Admin only)
// @route   GET /api/location/active
// @access  Private/Admin
exports.getActiveLocations = async (req, res) => {
  try {
    // 1. Find all workers
    const workers = await User.find({ role: 'worker' });

    // 2. Fetch the latest location log for each worker
    const activeLocations = [];
    
    for (const worker of workers) {
      const latestLog = await LocationLog.findOne({ worker: worker._id })
        .populate('job', 'clientName address status')
        .sort('-timestamp');
      
      if (latestLog) {
        activeLocations.push({
          worker: {
            id: worker._id,
            name: worker.name,
            email: worker.email,
            status: worker.status
          },
          location: latestLog.location,
          speed: latestLog.speed,
          geofenceStatus: latestLog.geofenceStatus,
          timestamp: latestLog.timestamp,
          job: latestLog.job
        });
      }
    }

    res.status(200).json({
      success: true,
      count: activeLocations.length,
      locations: activeLocations
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get GPS logs history for a specific job (Admin & Worker)
// @route   GET /api/location/history/:jobId
// @access  Private
exports.getLocationHistory = async (req, res) => {
  try {
    const logs = await LocationLog.find({ job: req.params.jobId })
      .populate('worker', 'name email')
      .sort('timestamp');

    res.status(200).json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
