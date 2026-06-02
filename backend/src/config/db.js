const mongoose = require('mongoose');
const dns = require('dns');

const connectDB = async () => {
  try {
    // Set custom DNS to bypass local/ISP DNS resolution issues (e.g. querySrv ECONNREFUSED)
    try {
      dns.setServers(['8.8.8.8', '8.8.4.4']);
    } catch (dnsErr) {
      console.warn('Warning: Failed to set custom DNS servers:', dnsErr.message);
    }

    const connStr = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cleaning_tracker';
    console.log(`Connecting to MongoDB at: ${connStr}`);
    
    // Connect to MongoDB
    await mongoose.connect(connStr);
    
    console.log('MongoDB Database Connected Successfully!');
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
