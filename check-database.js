// check-database.js - Script to inspect MongoDB database and collections
const { MongoClient } = require('mongodb');

// Use the same connection string from welcome.js
const MONGO_URI = 'mongodb+srv://adminDB:capstonelozonvill@barangaydb.5ootwqc.mongodb.net/barangayDB?retryWrites=true&w=majority';

async function checkDatabase() {
  let client;
  try {
    console.log('🔍 Connecting to MongoDB Atlas...\n');
    client = await MongoClient.connect(MONGO_URI, { 
      serverSelectionTimeoutMS: 10000 
    });
    
    const db = client.db();
    const dbName = db.databaseName;
    
    console.log('✅ Connected successfully!');
    console.log(`📊 Database: ${dbName}\n`);
    console.log('═'.repeat(60));
    
    // List all collections
    const collections = await db.listCollections().toArray();
    
    if (collections.length === 0) {
      console.log('⚠️  No collections found in the database.');
      return;
    }
    
    console.log(`\n📋 Found ${collections.length} collection(s):\n`);
    
    // Get details for each collection
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      const collection = db.collection(collectionName);
      
      // Get document count
      const count = await collection.countDocuments();
      
      console.log(`📦 Collection: ${collectionName}`);
      console.log(`   Documents: ${count}`);
      
      // Get indexes
      const indexes = await collection.indexes();
      if (indexes.length > 1) { // More than just the default _id index
        console.log(`   Indexes: ${indexes.length}`);
        indexes.forEach(idx => {
          if (idx.name !== '_id_') {
            const keys = Object.keys(idx.key).join(', ');
            const unique = idx.unique ? ' (unique)' : '';
            console.log(`     - ${idx.name}: ${keys}${unique}`);
          }
        });
      }
      
      // Show sample documents (first 3)
      if (count > 0) {
        const samples = await collection.find({}).limit(3).toArray();
        console.log(`   Sample documents (showing first ${Math.min(3, count)}):`);
        samples.forEach((doc, idx) => {
          // Format the document nicely
          const docStr = JSON.stringify(doc, null, 2)
            .split('\n')
            .slice(0, 5) // Show first 5 lines
            .join('\n');
          const truncated = docStr.length < 200 ? docStr : docStr.substring(0, 200) + '...';
          console.log(`     [${idx + 1}] ${truncated}`);
        });
        if (count > 3) {
          console.log(`     ... and ${count - 3} more document(s)`);
        }
      }
      
      console.log('');
    }
    
    // Summary
    console.log('═'.repeat(60));
    const totalDocs = await Promise.all(
      collections.map(c => db.collection(c.name).countDocuments())
    );
    const totalCount = totalDocs.reduce((sum, count) => sum + count, 0);
    console.log(`\n📈 Summary:`);
    console.log(`   Total Collections: ${collections.length}`);
    console.log(`   Total Documents: ${totalCount}`);
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.message.includes('authentication')) {
      console.error('\n💡 Tip: Check your MongoDB Atlas credentials in welcome.js');
    } else if (err.message.includes('timeout')) {
      console.error('\n💡 Tip: Check your internet connection and MongoDB Atlas IP whitelist');
    }
  } finally {
    if (client) {
      await client.close();
      console.log('\n🔌 Disconnected from database.');
    }
  }
}

// Run the check
checkDatabase().catch(console.error);



