require('dotenv').config({ path: 'c:/Users/ASUS/Desktop/WA Automation/.env' });
const mongoose = require('mongoose');
const User = require('c:/Users/ASUS/Desktop/WA Automation/models/User');

async function test() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected successfully!');
    const count = await User.countDocuments();
    console.log('Users in DB:', count);
    process.exit(0);
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  }
}
test();
