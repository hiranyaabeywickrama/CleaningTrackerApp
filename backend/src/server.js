const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Connect to MongoDB Database
connectDB();

// Verify Gmail SMTP on startup (OTP requires real email delivery)
const emailService = require('./services/emailService');
emailService.verifySmtpOnStartup();

// Initialize express app
const app = express();
const server = http.createServer(app);

// Configure socket.io
const io = socketio(server, {
  cors: {
    origin: '*', // Allow all origins for development and testing
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

const jwt = require('jsonwebtoken');

// -------------------------------------------------------------------
// Socket.io handshake auth – JWT token verification
// -------------------------------------------------------------------
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    socket.role = decoded.role;
    next();
  } catch (err) {
    return next(new Error('Authentication error: Invalid token'));
  }
});

// Attach socket.io server instance to app settings so controllers can access it
app.set('socketio', io);

// Middleware
app.use(cors());
app.use(express.json());

// Basic sanity check route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Cleaning Tracker API!',
    version: '1.0.0',
    status: 'Running'
  });
});

// Import Route Handlers
const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const locationRoutes = require('./routes/location');
const attendanceRoutes = require('./routes/attendance');
const contractorRoutes = require('./routes/contractor');
const workerRoutes = require('./routes/worker');
const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/client');
const gpsRoutes = require('./routes/gps');
const { processExpiredAssignments } = require('./services/assignmentExpiryService');
const { processSubscriptionRenewals } = require('./services/subscriptionService');

// Mount REST Routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/contractor', contractorRoutes);
app.use('/api/worker', workerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/gps', gpsRoutes);

// Configure socket.io connection logic
const socketHandler = require('./socket/socketHandler');
socketHandler(io);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Server Error'
  });
});

// Define Port
const PORT = process.env.PORT || 5000;

// Start listening
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// A simple in-memory flag for cron execution in a single instance (for multi-instance, a DB lock is required)
// To keep it simple and robust, we will wrap the execution in a DB check.
const SystemConfig = require('./models/SystemConfig');

const runLockedCron = async (taskName, intervalMs, taskFn) => {
  setInterval(async () => {
    try {
      // Find and update atomically to acquire lock
      const lock = await SystemConfig.findOneAndUpdate(
        { key: `cron_lock_${taskName}`, lockedUntil: { $lt: new Date() } },
        { $set: { lockedUntil: new Date(Date.now() + intervalMs - 5000) } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      if (lock) {
        await taskFn();
      }
    } catch (err) {
      if (err.code !== 11000) { // Ignore upsert duplicates
        console.error(`Error executing ${taskName}:`, err.message);
      }
    }
  }, intervalMs);
};

// Auto-expire pending contract requests every minute
runLockedCron('assignmentExpiry', 60 * 1000, async () => {
  const result = await processExpiredAssignments(io);
  if (result.expired > 0) {
    console.log(`Expired ${result.expired} pending worker assignment(s)`);
  }
});

// Auto-renew contractor plans daily
runLockedCron('subscriptionRenewal', 60 * 60 * 1000, async () => {
  const result = await processSubscriptionRenewals();
  if (result.renewed > 0 || result.expired > 0) {
    console.log(`Subscriptions processed — renewed: ${result.renewed}, expired: ${result.expired}`);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error(`Unhandled Rejection Error: ${err.message}`);
});
