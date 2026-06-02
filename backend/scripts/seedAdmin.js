// scripts/seedAdmin.js
// Run with: node scripts/seedAdmin.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD; // plain, will be hashed by User pre save
const adminName = process.env.ADMIN_NAME || 'Admin';

if (!adminEmail || !adminPassword) {
  console.error('Please set ADMIN_EMAIL and ADMIN_PASSWORD in .env');
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const existing = await User.findOne({ email: adminEmail, role: 'admin' });
    if (existing) {
      console.log('Admin user already exists:', existing.email);
      process.exit(0);
    }
    const admin = await User.create({
      name: adminName,
      email: adminEmail,
      phoneNumber: process.env.ADMIN_PHONE || '+10000000000',
      password: adminPassword,
      role: 'admin',
    });
    console.log('Admin user created:', admin.email);
    process.exit(0);
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
