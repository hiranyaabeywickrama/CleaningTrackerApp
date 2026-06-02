const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const WorkerAssignment = require('../src/models/WorkerAssignment');
const Contract = require('../src/models/Contract');
const User = require('../src/models/User');
const GPSLog = require('../src/models/GPSLog');

// Haversine distance calculator
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Radius of the earth in m
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in m
  return d;
};

const runTest = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    console.log('Connecting to MongoDB database...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected successfully!');

    // 1. Setup mock data
    console.log('\n--- 1. SETTING UP MOCK DATA ---');
    
    // Find or create a contractor
    let contractor = await User.findOne({ role: 'contractor' });
    if (!contractor) {
      contractor = await User.create({
        name: 'Mock Contractor',
        email: 'mock_contractor@crewlynk.com',
        password: 'password123',
        role: 'contractor',
        companyName: 'Mock Cleaners Inc.'
      });
      console.log('Created Mock Contractor');
    } else {
      console.log(`Using existing Contractor: ${contractor.name} (${contractor.email})`);
    }

    // Find or create a worker
    let worker = await User.findOne({ role: 'worker' });
    if (!worker) {
      worker = await User.create({
        name: 'Mock Worker',
        email: 'mock_worker@crewlynk.com',
        password: 'password123',
        role: 'worker',
        status: 'available'
      });
      console.log('Created Mock Worker');
    } else {
      console.log(`Using existing Worker: ${worker.name} (${worker.email})`);
    }

    // Create a mock contract (located in Grand Central, NY)
    const clientLat = 40.7527;
    const clientLng = -73.9772;
    const durationMinutes = 120; // 2 hour job

    const mockContract = await Contract.create({
      contractorId: contractor._id,
      clientName: 'Grand Central Office Complex',
      clientPhone: '+1234567890',
      location: {
        address: '89 E 42nd St, New York, NY 10017',
        coordinates: {
          lat: clientLat,
          lng: clientLng
        }
      },
      packageId: new mongoose.Types.ObjectId(), // mock ID
      workers: [worker._id],
      requiredWorkersCount: 1,
      schedule: {
        date: new Date(),
        startTime: '09:00',
        durationMinutes
      },
      status: 'active'
    });
    console.log(`Created Mock Contract: ID ${mockContract._id}`);

    // Create worker assignment
    const assignment = await WorkerAssignment.create({
      contractId: mockContract._id,
      workerId: worker._id,
      response: 'accepted',
      workerStatus: 'Traveling',
      responseDeadline: new Date(Date.now() + 15 * 60 * 1000)
    });
    console.log(`Created WorkerAssignment: ID ${assignment._id}`);

    // 2. Worker Arrives and Starts Job
    console.log('\n--- 2. WORKER ARRIED AND CLOCKED IN ---');
    assignment.checkInTime = new Date(Date.now() - 60 * 60 * 1000); // Checked in 1 hour ago
    assignment.workerStatus = 'Working';
    await assignment.save();
    console.log(`Worker status: ${assignment.workerStatus}`);
    console.log(`Check-in Time set to: ${assignment.checkInTime.toISOString()}`);

    // 3. Worker sends location inside geofence (inside 50m)
    console.log('\n--- 3. SENDING LOCATION UPDATE INSIDE GEOFENCE ---');
    // Lat/Lng exactly at Grand Central (0m distance)
    let wLat = 40.7527;
    let wLng = -73.9772;
    let dist = calculateDistance(clientLat, clientLng, wLat, wLng);
    console.log(`Worker coordinate: [${wLat}, ${wLng}], Distance: ${dist.toFixed(2)}m`);
    
    // Simulate location_update logic
    let isBreached = dist > 50;
    console.log(`Geofence Breached: ${isBreached}`);
    if (!isBreached && assignment.workerStatus === 'Left Work Area') {
      assignment.workerStatus = 'Working';
    }
    await assignment.save();
    console.log(`Worker Status: ${assignment.workerStatus}`);

    // 4. Worker leaves the geofence (Geofence Breach)
    console.log('\n--- 4. WORKER LEAVES AREA (GEOFENCE BREACH) ---');
    // Lat/Lng near Central Park (approx 1800m away, >50m)
    wLat = 40.7656;
    wLng = -73.9786;
    dist = calculateDistance(clientLat, clientLng, wLat, wLng);
    console.log(`Worker coordinate: [${wLat}, ${wLng}], Distance: ${dist.toFixed(2)}m`);
    
    isBreached = dist > 50;
    console.log(`Geofence Breached: ${isBreached}`);
    if (isBreached && assignment.workerStatus === 'Working') {
      assignment.workerStatus = 'Left Work Area';
      assignment.totalViolations = (assignment.totalViolations || 0) + 1;
      
      // Mock that the worker left the area 15 minutes ago
      assignment.outsideStartTime = new Date(Date.now() - 15 * 60 * 1000); // 15 mins ago
      
      assignment.violationLogs.push({
        timestamp: assignment.outsideStartTime,
        lat: wLat,
        lng: wLng,
        reason: 'Left Work Area'
      });
      console.log(`⚠️ Geofence breach recorded! Total Violations: ${assignment.totalViolations}`);
      console.log(`Mock breach start time: ${assignment.outsideStartTime.toISOString()}`);
    }
    await assignment.save();
    console.log(`Worker Status: ${assignment.workerStatus}`);

    // 5. Worker returns to the work area
    console.log('\n--- 5. WORKER RETURNS TO WORK AREA (GEOFENCE SECURED) ---');
    wLat = 40.7527;
    wLng = -73.9772;
    dist = calculateDistance(clientLat, clientLng, wLat, wLng);
    console.log(`Worker coordinate: [${wLat}, ${wLng}], Distance: ${dist.toFixed(2)}m`);
    
    isBreached = dist > 50;
    console.log(`Geofence Breached: ${isBreached}`);
    if (!isBreached && assignment.workerStatus === 'Left Work Area') {
      assignment.workerStatus = 'Working';
      
      // Calculate outside breach duration
      if (assignment.outsideStartTime) {
        const diffMs = Date.now() - assignment.outsideStartTime;
        const diffMins = diffMs / 1000 / 60;
        assignment.timeSpentOutsideMinutes = (assignment.timeSpentOutsideMinutes || 0) + diffMins;
        assignment.outsideStartTime = null;
        console.log(`🛡️ Worker returned! Spent outside duration recorded: ${diffMins.toFixed(2)} mins`);
      }
    }
    await assignment.save();
    console.log(`Worker Status: ${assignment.workerStatus}`);

    // 6. Worker Ends Job
    console.log('\n--- 6. WORKER ENDS THE SHIFT AND CLOCKS OUT ---');
    assignment.checkOutTime = new Date();
    assignment.workerStatus = 'Completed';

    // Calculate actual worked duration in minutes
    const diffMs = assignment.checkOutTime - assignment.checkInTime;
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    
    assignment.actualWorkedMinutes = Math.max(0, Math.round(totalMinutes - (assignment.timeSpentOutsideMinutes || 0)));

    // Grade shift
    const violations = assignment.totalViolations || 0;
    if (violations === 0) {
      assignment.gpsAttendanceSummary = 'Good';
    } else if (violations <= 2) {
      assignment.gpsAttendanceSummary = 'Minor Issues';
    } else {
      assignment.gpsAttendanceSummary = 'Attendance Warning';
    }

    await assignment.save();
    console.log('✅ Shift successfully ended and graded!');

    // 7. Output Final Attendance Score Card Verification Results
    console.log('\n==================================================');
    console.log('       ATTENDANCE VERIFICATION SCORE CARD         ');
    console.log('==================================================');
    console.log(`Worker Name:             ${worker.name}`);
    console.log(`Contract:                ${mockContract.clientName}`);
    console.log(`Check-In Time:           ${assignment.checkInTime.toLocaleTimeString()}`);
    console.log(`Check-Out Time:          ${assignment.checkOutTime.toLocaleTimeString()}`);
    console.log(`Contracted Duration:     ${durationMinutes} mins`);
    console.log(`Total Time Checked-In:   ${totalMinutes} mins`);
    console.log(`Time Spent Outside Area: ${assignment.timeSpentOutsideMinutes.toFixed(2)} mins`);
    console.log(`Actual Worked Minutes:   ${assignment.actualWorkedMinutes} mins`);
    console.log(`Total Geofence Breaches: ${assignment.totalViolations}`);
    console.log(`Final Attendance Grade:  ${assignment.gpsAttendanceSummary.toUpperCase()}`);
    console.log('==================================================\n');

    // Assertions
    console.log('--- RUNNING ASSERTIONS ---');
    if (assignment.totalViolations === 1) {
      console.log('✅ Assertion Passed: Violations count is exactly 1.');
    } else {
      console.error('❌ Assertion Failed: Violations count is ' + assignment.totalViolations);
    }

    if (assignment.timeSpentOutsideMinutes >= 15) {
      console.log(`✅ Assertion Passed: Time spent outside is correct (~${assignment.timeSpentOutsideMinutes.toFixed(2)} mins).`);
    } else {
      console.error('❌ Assertion Failed: Time spent outside is ' + assignment.timeSpentOutsideMinutes);
    }

    if (assignment.actualWorkedMinutes === totalMinutes - Math.round(assignment.timeSpentOutsideMinutes)) {
      console.log('✅ Assertion Passed: Actual worked minutes correctly subtracts outside duration.');
    } else {
      console.error(`❌ Assertion Failed: Actual worked minutes (${assignment.actualWorkedMinutes}) != Expected (${totalMinutes - Math.round(assignment.timeSpentOutsideMinutes)})`);
    }

    if (assignment.gpsAttendanceSummary === 'Minor Issues') {
      console.log('✅ Assertion Passed: Grade matches expected "Minor Issues" (1 violation).');
    } else {
      console.error('❌ Assertion Failed: Grade is ' + assignment.gpsAttendanceSummary);
    }

    // Cleanup mock data
    console.log('\nCleaning up mock contract and assignment...');
    await WorkerAssignment.findByIdAndDelete(assignment._id);
    await Contract.findByIdAndDelete(mockContract._id);
    console.log('✅ Cleanup complete!');

    process.exit(0);
  } catch (err) {
    console.error('❌ Integration Test Error:', err);
    process.exit(1);
  }
};

runTest();
