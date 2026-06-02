const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./src/models/User');

dotenv.config();

const test = async () => {
  try {
    const connStr = process.env.MONGODB_URI;
    await mongoose.connect(connStr);
    console.log('Connected to MongoDB...');

    const email = 'admin@cleantrack.com';
    const password = 'Admin123@';

    console.log(`Querying for email: "${email}"`);
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      console.log('User NOT found!');
      mongoose.connection.close();
      return;
    }
    console.log('User found:', user.name, 'Role:', user.role);

    const isMatch = await user.matchPassword(password);
    console.log('Password comparison match:', isMatch);

    mongoose.connection.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
};

test();
