// test-mongo.js
const mongoose = require('mongoose');

const uri = 'mongodb://127.0.0.1:27017/barangayDB'; // adjust if needed

(async () => {
  try {
    console.log('🔍 Trying to connect to MongoDB...');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ Connected successfully!');
    console.log('Database name:', mongoose.connection.name);
    console.log('Host:', mongoose.connection.host);
    console.log('Port:', mongoose.connection.port);

    const admin = mongoose.connection.db.admin();
    const info = await admin.command({ connectionStatus: 1 });
    console.log('Connection status:', info.ok === 1 ? 'OK' : 'NOT OK');

    await mongoose.disconnect();
    console.log('🔌 Disconnected.');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  }
})();