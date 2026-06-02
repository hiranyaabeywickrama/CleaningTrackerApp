const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./src/models/User');
const Job = require('./src/models/Job');
const LocationLog = require('./src/models/LocationLog');
const Attendance = require('./src/models/Attendance');

dotenv.config();

const seedData = async () => {
  try {
    const connStr = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cleaning_tracker';
    console.log(`Connecting to MongoDB at: ${connStr}`);
    await mongoose.connect(connStr);
    console.log('Connected to MongoDB...');

    // Clear all existing data
    await User.deleteMany();
    await Job.deleteMany();
    await LocationLog.deleteMany();
    await Attendance.deleteMany();
    console.log('Cleared existing collections...');

    // ── Admin ────────────────────────────────────────────────────────────────
    // Admin is the ONLY user with a password — all other roles use OTP login
    const admin = await User.create({
      name: 'System Administrator',
      email: 'admincrewlynk@gmail.com',
      phoneNumber: '888-999-0000',
      password: 'Admin123@',
      role: 'admin',
      status: 'offline'
    });
    console.log('✅ Admin created: admincrewlynk@gmail.com / Admin123@');

    // ── Workers (no password — OTP only) ─────────────────────────────────────
    const worker1 = await User.create({
      name: 'John Doe',
      email: 'worker1@clean.com',
      phoneNumber: '222-333-4444',
      role: 'worker',
      status: 'available'
    });
    const worker2 = await User.create({
      name: 'Jane Smith',
      email: 'worker2@clean.com',
      phoneNumber: '333-444-5555',
      role: 'worker',
      status: 'available'
    });
    const worker3 = await User.create({
      name: 'Malith Hirushan',
      email: 'malithhirushan10@gmail.com',
      phoneNumber: '947-759-5599',
      role: 'worker',
      status: 'available'
    });
    console.log('✅ Workers created (OTP login only): worker1@clean.com, worker2@clean.com, malithhirushan10@gmail.com');

    // ── Contractors (no password — OTP only) ──────────────────────────────────
    const contractor = await User.create({
      name: 'Robert Vance',
      email: 'contractor@clean.com',
      phoneNumber: '444-555-6666',
      companyName: 'Vance Cleaning Co',
      role: 'contractor',
      status: 'available'
    });
    const contractor2 = await User.create({
      name: 'Nethmi Hiranya',
      email: 'nethmihiranya22@gmail.com',
      phoneNumber: '947-759-5599',
      companyName: 'Nethmi Cleaners Ltd',
      role: 'contractor',
      status: 'available'
    });
    console.log('✅ Contractors created (OTP login only): contractor@clean.com, nethmihiranya22@gmail.com');

    // ── Sample Jobs ──────────────────────────────────────────────────────────
    const job1 = await Job.create({
      customerName: 'Grand Central Office Complex',
      address: '89 E 42nd St, New York, NY 10017',
      latitude: 40.7527,
      longitude: -73.9772,
      geofenceRadius: 150,
      assignedWorker: worker1._id,
      contractor: contractor._id,
      startTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
      expectedHours: 4,
      notes: 'Clean 3rd-floor conference rooms and vacuum main lobby.'
    });

    const job2 = await Job.create({
      customerName: 'Penthouse Apartment A',
      address: '150 Central Park South, New York, NY 10019',
      latitude: 40.7656,
      longitude: -73.9786,
      geofenceRadius: 200,
      assignedWorker: worker2._id,
      startTime: new Date(Date.now() + 5 * 60 * 60 * 1000),
      expectedHours: 2.5,
      notes: 'Window washing and marble countertop polishing.'
    });

    const job3 = await Job.create({
      customerName: 'Downtown Office Complex',
      address: '123 Main St, New York, NY 10001',
      latitude: 40.7128,
      longitude: -74.0060,
      geofenceRadius: 150,
      assignedWorker: worker3._id,
      contractor: contractor2._id,
      startTime: new Date(Date.now() + 1 * 60 * 60 * 1000),
      expectedHours: 3.5,
      notes: 'Clean reception lobby and dust windows.'
    });

    console.log('\n✅ Sample Jobs created:');
    console.log(`   - ${job1.customerName} (Worker: John Doe, Contractor: Robert Vance)`);
    console.log(`   - ${job2.customerName} (Worker: Jane Smith)`);
    console.log(`   - ${job3.customerName} (Worker: Malith Hirushan, Contractor: Nethmi Hiranya)`);

    console.log('\n🎉 Database seeded successfully!');
    console.log('📋 Login credentials:');
    console.log('   ADMIN:      admincrewlynk@gmail.com  /  Admin123@  (password login)');
    console.log('   WORKERS:    worker1@clean.com, worker2@clean.com  (OTP login)');
    console.log('   CONTRACTORS: contractor@clean.com, nethmihiranya22@gmail.com  (OTP login)');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error.message);
    process.exit(1);
  }
};

seedData();
