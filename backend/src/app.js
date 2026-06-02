const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { initSocket } = require('./socket');

dotenv.config();

// Initialize DB
connectDB();

const app = express();

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Import routes
const authRoutes = require('./routes/auth');
const contractorRoutes = require('./routes/contractor');
const adminRoutes = require('./routes/admin');
const workerRoutes = require('./routes/worker');
const gpsRoutes = require('./routes/gps');

app.use('/api/auth', authRoutes);
app.use('/api/contractor', contractorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/worker', workerRoutes);
app.use('/api/gps', gpsRoutes);

// Error handling middleware (placeholder)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Server Error' });
});

module.exports = { app };
