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

// -------------------------------------------------------------------
// Socket.io handshake auth – allow optional role during polling phase
// -------------------------------------------------------------------
io.use((socket, next) => {
  const { role, userId } = socket.handshake.auth || {};
  // If a role is supplied, enforce that it is contractor or worker.
  if (role && role !== 'contractor' && role !== 'worker') {
    return next(new Error('Unauthorized socket role'));
  }
  socket.role = role; // may be undefined for the initial poll request
  socket.userId = userId;
  next();
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
const gpsRoutes = require('./routes/gps');
const { processExpiredAssignments } = require('./services/assignmentExpiryService');

// Mount REST Routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/contractor', contractorRoutes);
app.use('/api/worker', workerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/gps', gpsRoutes);

// Configure socket.io connection logic
const socketHandler = require('./socket/socketHandler');
socketHandler(io);

// Define Port
const PORT = process.env.PORT || 5000;

// Start listening
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Auto-expire pending contract requests every minute
setInterval(async () => {
  try {
    const result = await processExpiredAssignments(io);
    if (result.expired > 0) {
      console.log(`Expired ${result.expired} pending worker assignment(s)`);
    }
  } catch (err) {
    console.error('Assignment expiry job error:', err.message);
  }
}, 60 * 1000);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error(`Unhandled Rejection Error: ${err.message}`);
  // Close server & exit process
  // server.close(() => process.exit(1));
});
