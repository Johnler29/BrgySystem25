//welcome.js code

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt'); // if this gives issues on Windows, use: const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://adminDB:capstonelozonvill@barangaydb.5ootwqc.mongodb.net/barangayDB?retryWrites=true&w=majority';

// --- Sample credentials (legacy fallback) ---
const CREDENTIALS = {
  admin: { username: 'admin', password: 'admin123', role: 'admin', name: 'Admin' },
  user:  { username: 'anna.garcia', password: 'user123', role: 'user',  name: 'Anna Marie Garcia' }
};

// ---------- Middleware ----------
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors({
  origin: true, // Allow all origins (or specify your Vercel domain)
  credentials: true, // Allow cookies to be sent
}));
app.use(morgan('dev'));
app.use(express.json());

const maintenanceGuard = require('./middleware/maintenance');
app.use(maintenanceGuard);

app.use(express.static(path.join(__dirname, 'public')));

// Configure session store - use MongoDB for serverless (Vercel) compatibility
const sessionStore = MongoStore.create({
  mongoUrl: MONGO_URI,
  touchAfter: 24 * 3600, // lazy session update
  ttl: 24 * 60 * 60, // 24 hours
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'langkaan2-secret-key-2024',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',  // true in production (Vercel uses HTTPS)
    httpOnly: true,
    sameSite: 'lax', // Works for same-site requests on Vercel
    maxAge: 24 * 60 * 60 * 1000  // default 1 day
  }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// View engine (optional)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

(async () => {
  try {
    // connect and fail fast if server can't be selected
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000, // 5s
      // dbName is optional if URI already includes /barangayDB
      // dbName: 'barangayDB',
    });

    // helpful diagnostics
    console.log('✅ Mongoose connected:', {
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      db: mongoose.connection.name
    });

    // only register routes after a successful connect
    const logsApiInner = require('./routes/logs');
    app.use('/api/logs', logsApiInner);

    // only start the inner listener if not already started below (in dev this file is required once)
    // Skip if running on Vercel (serverless environment)
    if (!app.locals._startedEarly && !process.env.VERCEL) {
      app.locals._startedEarly = true;
      app.listen(PORT, () =>
        console.log(`🚀 Server running on http://localhost:${PORT}`)
      );
    }
  } catch (err) {
    console.error('❌ Mongoose connection error:', err);
    process.exit(1);
  }
})();

// ---------- DB Helpers ----------
async function withDb(fn) {
  let client;
  try {
    client = await MongoClient.connect(MONGO_URI, { ignoreUndefined: true });
    const db = client.db();
    return await fn(db);
  } catch (err) {
    console.error('[DB] Error:', err.message);
    return null;
  } finally {
    if (client) await client.close();
  }
}

// Create safe unique indexes for users (ignore null/missing values)
async function ensureUserIndexes(db) {
  const users = db.collection('users');

  // best-effort: drop old simple unique indexes if they exist
  try { await users.dropIndex('email_1'); } catch (_) {}
  try { await users.dropIndex('username_1'); } catch (_) {}

  await users.createIndexes([
    {
      key: { username: 1 },
      name: 'username_unique',
      unique: true,
      partialFilterExpression: { username: { $type: 'string' } }
    },
    {
      key: { email: 1 },
      name: 'email_unique',
      unique: true,
      partialFilterExpression: { email: { $type: 'string' } }
    }
  ]);
}

async function initDb() {
  await withDb(async (db) => {
    const names = (await db.listCollections().toArray()).map(c => c.name);

    // --- residents (seed) ---
    if (!names.includes('residents')) {
      await db.createCollection('residents');
      await db.collection('residents').insertMany([
        {
          name: 'Maria Santos',
          residentId: 'R-0001',
          gender: 'Female',
          nearbyAnnex: 'Main',
          contactNumber: '09171234567',
          voter: 'Yes',
          address: 'Blk 1 Lot 1 Phase 1 Cityhomes Resortville',
          dateOfBirth: '1985-03-15',
          civilStatus: 'Single'
        },
        {
          name: 'Juan Dela Cruz',
          residentId: 'R-0002',
          gender: 'Male',
          nearbyAnnex: 'Annex 1',
          contactNumber: '09281234567',
          voter: 'Yes',
          address: 'Blk 2 Lot 1 Phase 1 Cityhomes Resortville',
          dateOfBirth: '1990-07-22',
          civilStatus: 'Married'
        },
        {
          name: 'Ana Villanueva',
          residentId: 'R-0003',
          gender: 'Female',
          nearbyAnnex: 'Annex 2',
          contactNumber: '09391234567',
          voter: 'No',
          address: 'Blk 3 Lot 2 Phase 2 Cityhomes Resortville',
          dateOfBirth: '1992-12-10',
          civilStatus: 'Single'
        }
      ]);
    }

    // --- documents (seed) ---
    if (!names.includes('documents')) {
      await db.createCollection('documents');
      await db.collection('documents').insertMany([
        {
          requesterName: 'Anna Marie Garcia',
          address: 'Langkaan II',
          typeOfDocument: 'Barangay ID',
          purpose: '1',
          status: 'Released',
          dateRequested: new Date('2025-01-10'),
          dateReleased: new Date('2025-01-11'),
          numberOfCopies: 1,
          paymentMethod: 'GCash',
          paymentStatus: 'Successfully Paid'
        },
        {
          requesterName: 'Anna Marie Garcia',
          address: 'Langkaan II',
          typeOfDocument: 'Certificate of Indigency',
          purpose: '2',
          status: 'Pick-up Ready',
          dateRequested: new Date('2025-01-12'),
          numberOfCopies: 2,
          paymentMethod: 'GCash',
          paymentStatus: 'Successfully Paid'
        }
      ]);
    }

    // --- users (auth) ---
    if (!names.includes('users')) {
      await db.createCollection('users');
    }
    const usersCol = db.collection('users');

    // Safe unique indexes (ignore null/missing)
    await ensureUserIndexes(db);

    // Upsert admin + sample user (only if not already present)
    const adminHash = await bcrypt.hash(CREDENTIALS.admin.password, 10);
    await usersCol.updateOne(
      { username: CREDENTIALS.admin.username.toLowerCase() },
      {
        $setOnInsert: {
          username: CREDENTIALS.admin.username.toLowerCase(),
          email: 'admin@example.com',
          firstName: 'System',
          middleName: '',
          lastName: 'Admin',
          name: CREDENTIALS.admin.name,
          role: 'admin',
          verified: true,
          passwordHash: adminHash,
          address: 'Barangay Hall',
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    const sampleHash = await bcrypt.hash(CREDENTIALS.user.password, 10);
    await usersCol.updateOne(
      { username: CREDENTIALS.user.username.toLowerCase() },
      {
        $setOnInsert: {
          username: CREDENTIALS.user.username.toLowerCase(),
          email: 'anna.garcia@example.com',
          firstName: 'Anna',
          middleName: 'Marie',
          lastName: 'Garcia',
          name: CREDENTIALS.user.name,
          role: 'user',
          verified: true,
          passwordHash: sampleHash,
          address: 'Langkaan II',
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    console.log('✅ Database initialized (if needed)');
  });
}
initDb(); // run on start

// ---------- Auth guards ----------
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  // For API routes, return JSON error instead of redirecting
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ ok: false, message: 'Authentication required' });
  }
  return res.redirect('/login');
}
function requireAdmin(req, res, next) {
  if (!req.session.user) {
    // Check if this is an API request
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ ok: false, message: 'Authentication required' });
    }
    return res.redirect('/login');
  }
  
  const isAdmin = /^(admin)$/i.test(req.session.user?.role||'') || 
                  req.session.user?.isAdmin===true || 
                  req.session.user?.type==='admin' || 
                  req.session.user?.accountType==='admin';
  
  if (isAdmin) return next();
  
  // For API routes, return JSON
  if (req.path.startsWith('/api/')) {
    return res.status(403).json({ ok: false, message: 'Access denied. Admin only.' });
  }
  return res.status(403).send('Access denied. Admin only.');
}

// Main home route with your beautiful welcome page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Barangay Langkaan II - Web Management System</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@300;400;500;600;700;800&family=Barlow:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          line-height: 1.6;
          color: #333;
          background-color: #f8f9fa;
          font-weight: 400;
          letter-spacing: 0.01em;
        }

        /* Header */
        .header {
          background: #1a237e;
          box-shadow: 0 4px 20px rgba(26, 35, 126, 0.3);
          padding: 1.2rem 0;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .nav-container {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 2rem;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 1.2rem;
          flex-shrink: 0;
        }

        .logo img {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          border: 2px solid #ff6f00;
          object-fit: cover;
        }

        .logo h1 {
          color: white;
          font-family: 'Barlow', sans-serif;
          font-size: 1.6rem;
          font-weight: 700;
          margin: 0;
          white-space: nowrap;
          letter-spacing: 0.02em;
        }

        .nav-menu {
          display: flex;
          list-style: none;
          gap: 0;
          margin: 0;
          padding: 0;
          align-items: center;
        }

        .nav-menu li {
          margin: 0;
        }

        .nav-menu a {
          display: block;
          text-decoration: none;
          color: white;
          font-family: 'Work Sans', sans-serif;
          font-weight: 500;
          font-size: 0.95rem;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          transition: all 0.3s ease;
          position: relative;
          margin: 0 0.2rem;
          white-space: nowrap;
          letter-spacing: 0.01em;
        }

        .nav-menu a:hover {
          background: #ff6f00;
          color: white;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(255, 111, 0, 0.3);
        }

        .nav-menu a:active {
          transform: translateY(0);
        }

        /* Mobile Menu Toggle */
        .mobile-menu-toggle {
          display: none;
          background: none;
          border: none;
          color: white;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0.5rem;
        }

        .mobile-menu-toggle:hover {
          color: #ff6f00;
        }

        /* Hero Section */
        .hero {
          background: linear-gradient(135deg, rgba(26, 35, 126, 0.9), rgba(255, 111, 0, 0.8)), url('https://images.unsplash.com/photo-1554469384-e58fac16e23a?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80');
          background-size: cover;
          background-position: center;
          height: 75vh;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: white;
          position: relative;
        }

        .hero::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, rgba(26, 35, 126, 0.8), rgba(255, 111, 0, 0.6));
        }

        .hero-content {
          position: relative;
          z-index: 2;
        }

        .hero-content h2 {
          font-family: 'Barlow', sans-serif;
          font-size: 3.8rem;
          margin-bottom: 1.5rem;
          text-shadow: 2px 2px 8px rgba(0,0,0,0.7);
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1.1;
        }

        .hero-content p {
          font-family: 'Work Sans', sans-serif;
          font-size: 1.4rem;
          margin-bottom: 2.5rem;
          max-width: 700px;
          text-shadow: 1px 1px 4px rgba(0,0,0,0.5);
          font-weight: 400;
          letter-spacing: 0.01em;
          line-height: 1.5;
        }

        .cta-buttons {
          display: flex;
          gap: 1.5rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .btn {
          display: inline-block;
          padding: 15px 35px;
          text-decoration: none;
          border-radius: 30px;
          font-family: 'Work Sans', sans-serif;
          font-weight: 600;
          font-size: 1.1rem;
          transition: all 0.3s ease;
          border: 3px solid transparent;
          letter-spacing: 0.02em;
          text-transform: none;
        }

        .btn-primary {
          background: transparent;
          color: white;
          border: 3px solid white;
        }

        .btn-secondary {
          background: transparent;
          color: white;
          border: 3px solid white;
        }

        .btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 25px rgba(0,0,0,0.3);
        }

        .btn-primary:hover {
          background: #e65100;
          border-color: #e65100;
        }

        .btn-secondary:hover {
          background: white;
          color: #1a237e;
        }

        /* Community Images */
        .community-images {
          padding: 5rem 0;
          background: white;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 2rem;
        }

        .image-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 3rem;
          margin-bottom: 3rem;
        }

        .image-card {
          position: relative;
          border-radius: 15px;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(26, 35, 126, 0.2);
          transition: transform 0.3s ease;
        }

        .image-card:hover {
          transform: translateY(-10px);
        }

        .image-card img {
          width: 100%;
          height: 280px;
          object-fit: cover;
        }

        .image-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(transparent, rgba(26, 35, 126, 0.9));
          color: white;
          padding: 3rem 2rem 2rem;
        }

        .image-overlay h4 {
          font-family: 'Barlow', sans-serif;
          font-size: 1.5rem;
          margin-bottom: 0.5rem;
          color: #ff6f00;
          font-weight: 600;
          letter-spacing: 0.01em;
        }

        .image-overlay p {
          font-family: 'Work Sans', sans-serif;
          font-size: 1rem;
          font-weight: 400;
          letter-spacing: 0.01em;
          line-height: 1.4;
        }

        .tagline {
          text-align: center;
          font-family: 'Barlow', sans-serif;
          font-size: 1.4rem;
          color: #1a237e;
          margin-top: 3rem;
          font-weight: 600;
          letter-spacing: 0.01em;
        }

        /* News Section */
        .news-section {
          background: linear-gradient(135deg, #1a237e 0%, #ff6f00 100%);
          padding: 5rem 0;
          color: white;
        }

        .news-content {
          display: flex;
          align-items: center;
          gap: 3rem;
          max-width: 1000px;
          margin: 0 auto;
        }

        .news-text {
          flex: 1;
        }

        .news-text h3 {
          font-family: 'Barlow', sans-serif;
          font-size: 2.5rem;
          margin-bottom: 1rem;
          color: white;
          font-weight: 700;
          letter-spacing: -0.01em;
        }

        .news-text h4 {
          font-family: 'Work Sans', sans-serif;
          font-size: 1.5rem;
          margin-bottom: 1rem;
          color: #fff3e0;
          font-weight: 500;
          letter-spacing: 0.01em;
        }

        .news-text p {
          font-family: 'Work Sans', sans-serif;
          font-size: 1.1rem;
          margin-bottom: 1rem;
          line-height: 1.7;
          font-weight: 400;
          letter-spacing: 0.01em;
        }

        .news-image {
          flex-shrink: 0;
        }

        .news-image img {
          width: 250px;
          height: 180px;
          object-fit: cover;
          border-radius: 15px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }

        /* Community Development */
        .development-section {
          padding: 5rem 0;
          background: #f8f9fa;
        }

        .section-title {
          text-align: center;
          font-family: 'Barlow', sans-serif;
          font-size: 3rem;
          margin-bottom: 4rem;
          color: #1a237e;
          font-weight: 700;
          letter-spacing: -0.02em;
        }

        .development-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 2.5rem;
        }

        .development-card {
          background: white;
          border-radius: 15px;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(26, 35, 126, 0.15);
          transition: all 0.3s ease;
        }

        .development-card:hover {
          transform: translateY(-10px);
          box-shadow: 0 20px 40px rgba(26, 35, 126, 0.25);
        }

        .development-card img {
          width: 100%;
          height: 220px;
          object-fit: cover;
        }

        .card-content {
          padding: 2rem;
        }

        .card-title {
          font-size: 1.5rem;
          margin-bottom: 1rem;
          color: #1a237e;
          font-weight: 600;
        }

        .card-description {
          color: #666;
          margin-bottom: 1.5rem;
          font-size: 1rem;
          line-height: 1.6;
        }

        .card-tags {
          display: flex;
          gap: 0.8rem;
          flex-wrap: wrap;
        }

        .tag {
          background: linear-gradient(135deg, #1a237e, #ff6f00);
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 500;
        }

        /* Services Section */
        .services-section {
          padding: 5rem 0;
          background: white;
        }

        .services-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 2.5rem;
        }

        .service-card {
          text-align: center;
          padding: 3rem 2rem;
          border-radius: 15px;
          box-shadow: 0 10px 30px rgba(26, 35, 126, 0.15);
          transition: all 0.3s ease;
          background: white;
          border: 2px solid transparent;
        }

        .service-card:hover {
          transform: translateY(-10px);
          border-color: #ff6f00;
          box-shadow: 0 20px 40px rgba(255, 111, 0, 0.2);
        }

        .service-icon {
          font-size: 4rem;
          margin-bottom: 1.5rem;
          display: block;
        }

        .service-card:nth-child(1) .service-icon {
          color: #1a237e;
        }

        .service-card:nth-child(2) .service-icon {
          color: #ff6f00;
        }

        .service-card:nth-child(3) .service-icon {
          color: #1a237e;
        }

        .service-title {
          font-family: 'Barlow', sans-serif;
          font-size: 1.4rem;
          margin-bottom: 1rem;
          color: #1a237e;
          font-weight: 600;
          letter-spacing: 0.01em;
        }

        .service-description {
          font-family: 'Work Sans', sans-serif;
          color: #666;
          margin-bottom: 1.5rem;
          font-size: 1rem;
          line-height: 1.6;
          font-weight: 400;
          letter-spacing: 0.01em;
        }

        .service-hours {
          font-family: 'Work Sans', sans-serif;
          font-weight: 600;
          color: #ff6f00;
          font-size: 1rem;
          letter-spacing: 0.01em;
        }

        /* Footer */
        .footer {
          background: #1a237e;
          color: white;
          padding: 3rem 0 1rem;
        }

        .footer-content {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 3rem;
          margin-bottom: 2rem;
        }

        .footer-section h4 {
          margin-bottom: 1.5rem;
          color: #ff6f00;
          font-size: 1.3rem;
          font-weight: 600;
        }

        .footer-section p, .footer-section a {
          color: #e8eaf6;
          text-decoration: none;
          margin-bottom: 0.8rem;
          display: block;
          font-size: 1rem;
          line-height: 1.6;
        }

        .footer-section a:hover {
          color: #ff6f00;
          transition: color 0.3s ease;
        }

        .footer-bottom {
          text-align: center;
          margin-top: 2rem;
          padding-top: 2rem;
          border-top: 2px solid #303f9f;
          color: #c5cae9;
        }

        /* Responsive Design */
        @media (max-width: 992px) {
          .nav-menu a {
            padding: 0.6rem 1.2rem;
            font-size: 0.9rem;
            margin: 0 0.1rem;
          }
        }

        @media (max-width: 768px) {
          .mobile-menu-toggle {
            display: block;
          }

          .nav-menu {
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: #1a237e;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(26, 35, 126, 0.3);
            border-top: 2px solid #ff6f00;
          }

          .nav-menu.active {
            display: flex;
          }

          .nav-menu li {
            width: 100%;
          }

          .nav-menu a {
            padding: 1rem 2rem;
            margin: 0;
            border-radius: 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }

          .nav-menu a:hover {
            background: rgba(255, 111, 0, 0.1);
            transform: none;
            box-shadow: none;
            border-left: 4px solid #ff6f00;
          }

          .logo h1 {
            font-size: 1.4rem;
          }

          .logo img {
            width: 45px;
            height: 45px;
          }
          
          .hero-content h2 {
            font-size: 2.5rem;
          }
          
          .hero-content p {
            font-size: 1.2rem;
          }
          
          .cta-buttons {
            flex-direction: column;
            align-items: center;
          }
          
          .news-content {
            flex-direction: column;
            text-align: center;
          }
          
          .section-title {
            font-size: 2.2rem;
          }
          
          .image-grid,
          .development-grid,
          .services-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 480px) {
          .container {
            padding: 0 1rem;
          }

          .nav-container {
            padding: 0 1rem;
          }
          
          .hero-content h2 {
            font-size: 2rem;
          }
          
          .btn {
            padding: 12px 25px;
            font-size: 1rem;
          }

          .logo h1 {
            font-size: 1.2rem;
          }

          .nav-menu a {
            padding: 0.8rem 1rem;
          }
        }
      </style>
    </head>
    <body>
      <!-- Header -->
      <header class="header">
        <div class="nav-container">
          <div class="logo">
            <img src="https://scontent.fmnl25-7.fna.fbcdn.net/v/t1.15752-9/521855138_708847785308771_2003273510610048423_n.png?_nc_cat=102&ccb=1-7&_nc_sid=9f807c&_nc_eui2=AeHDFSpZtSsJSKuyQM7o0VleafGYk3KEJmFp8ZiTcoQmYS-9dL9WVlBLaCm6fdRpBPzL3iz4ANsXkhyOl_XQY57t&_nc_ohc=ixNedG93Qg0Q7kNvwGBrifR&_nc_oc=AdlJKrVlPOjbyH0hRHyOH82O4R5vm6oafmhvPpvfgHaEm_uxBTHPbZvqR7BJvu_VA1c&_nc_zt=23&_nc_ht=scontent.fmnl25-7.fna&oh=03_Q7cD3QHh5Q7Ftgg21vXwURVdGXmmtkpPIn5QRbjLL3mDko9YiQ&oe=68F399EB" alt="Barangay Logo">
            <h1>Barangay Langkaan II</h1>
          </div>
          <button class="mobile-menu-toggle" onclick="toggleMobileMenu()">
            ☰
          </button>
          <nav>
            <ul class="nav-menu" id="navMenu">
              <li><a href="#home">Home</a></li>
              <li><a href="#development">Community Development</a></li>
              <li><a href="#services">Services</a></li>
              <li><a href="#news">News & Announcements</a></li>
              <li><a href="#contact">Contact Us</a></li>
            </ul>
          </nav>
        </div>
      </header>

      <!-- Hero Section -->
      <section class="hero" id="home">
        <div class="hero-content">
          <h2>Empowering Communities<br>Through Digital Solutions</h2>
          <p>Building a better tomorrow for Barangay Langkaan II through innovation, community service, and dedicated leadership.</p>
          <div class="cta-buttons">
            <!-- First link now points to login.js; second link removed -->
            <a href="/login" class="btn btn-primary">🔐 Login / Sign Up to Web Management System</a>
          </div>
        </div>
      </section>

      <!-- Community Images -->
      <section class="community-images">
        <div class="container">
          <div class="image-grid">
            <div class="image-card">
              <img src="https://scontent.fmnl25-7.fna.fbcdn.net/v/t39.30808-6/515109727_731446676137259_3675913538070522697_n.jpg?_nc_cat=111&ccb=1-7&_nc_sid=cc71e4&_nc_eui2=AeFwLkSbJsmeEr3sB9HbZb_9S_WsUzPjwnBL9axTM-PCcEOp4tQI7mtoZhz4ioQLgd4nZnY4CO1DTsGbHCiVxpou&_nc_ohc=kQdKkVu4fWsQ7kNvwGvCq0w&_nc_oc=AdlEea6qqv7ohlblr2AZWD4v3XJJGgccBrIKKrH0HmIfpl8mkL_rDrxM2_893qwmJZc&_nc_zt=23&_nc_ht=scontent.fmnl25-7.fna&_nc_gid=QtJcm0uNpetfKT_EOE-vFQ&oh=00_AfblAkVeYLI0ksZQW6iJ__yl8HQNVLZogxdX-idm7TlBbg&oe=68D20638" alt="Community Meeting">
              <div class="image-overlay">
                <h4>Community Engagement</h4>
                <p>Active participation in local governance and community decision-making</p>
              </div>
            </div>
            <div class="image-card">
              <img src="https://scontent.fmnl25-3.fna.fbcdn.net/v/t39.30808-6/547924981_787495143865745_5666731943913147963_n.jpg?_nc_cat=106&ccb=1-7&_nc_sid=833d8c&_nc_eui2=AeF2J9LjkPEnz4NNVUcoZ87AK26GqJEqh_wrboaokSqH_B6ygiVv2gbqzChQoKmxRu8TLfa2IPSpM8ZqcQMEmwuT&_nc_ohc=I1wIyw5ggjcQ7kNvwHoUag-&_nc_oc=Adl14uEVa5Gakq7b5XZiJA5_jybbbuqXZ3vs981s9LfQv7khtYNroJhHfCdrmdVZcQ4&_nc_zt=23&_nc_ht=scontent.fmnl25-3.fna&_nc_gid=LcdIMaI0JZsoInZ76OikhQ&oh=00_AfaL9IIJ1BBxIB8yWbxVpbLXkHQuGBZjvbw5XgFFcyhhgQ&oe=68D1FAAB" alt="Community Service">
              <div class="image-overlay">
                <h4>Community Service</h4>
                <p>Dedicated service to residents with passion and commitment</p>
              </div>
            </div>
          </div>
          <p class="tagline">Barangay Langkaan II: Serving the Community with Passion and Dedication</p>
        </div>
      </section>

      <!-- News Section -->
      <section class="news-section" id="news">
        <div class="container">
          <div class="news-content">
            <div class="news-text">
              <h3>News and Announcements</h3>
              <h4>Latest Updates</h4>
              <p>Stay informed about barangay projects, community events, and important announcements that affect our residents.</p>
              <p><strong>Barangay Information Office</strong> - Your trusted source for community updates</p>
            </div>
            <div class="news-image">
              <img src="https://images.unsplash.com/photo-1504711434969-e33886168f5c?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80" alt="News Updates">
            </div>
          </div>
        </div>
      </section>

      <!-- Community Development -->
      <section class="development-section" id="development">
        <div class="container">
          <h2 class="section-title">Community Development Highlights</h2>
          <div class="development-grid">
            <div class="development-card">
              <img src="https://cdn.manilastandard.net/wp-content/uploads/2017/02/f7423_life_story3.jpg" alt="Feeding Program">
              <div class="card-content">
                <h3 class="card-title">Feeding Programs</h3>
                <p class="card-description">Providing nutritious meals for children and families in need, ensuring no one goes hungry in our community.</p>
                <div class="card-tags">
                  <span class="tag">Community Outreach</span>
                  <span class="tag">Nutrition</span>
                </div>
              </div>
            </div>
            <div class="development-card">
              <img src="https://files01.pna.gov.ph/source/2024/06/18/operation-tuli-06142024rn.jpg" alt="Libreng Tuli">
              <div class="card-content">
                <h3 class="card-title">Libreng Tuli</h3>
                <p class="card-description">Offering free circumcision services for boys in the community with qualified medical professionals.</p>
                <div class="card-tags">
                  <span class="tag">Community Service</span>
                  <span class="tag">Health Department</span>
                </div>
              </div>
            </div>
            <div class="development-card">
              <img src="https://scontent.fmnl25-8.fna.fbcdn.net/v/t39.30808-6/480386856_957665069873846_4643406130305399967_n.jpg?_nc_cat=110&ccb=1-7&_nc_sid=127cfc&_nc_eui2=AeEkOf7i_vNuEZt0NJAsiYfBWqD5TwMdEKJaoPlPAx0Qonw0Ze7NrqG2YgmPXhd6ltLfx-JNfhCY4EyejeI1ZdLg&_nc_ohc=SNmQL06LwCoQ7kNvwHXDevr&_nc_oc=AdlRgj_hGaNeOEO4XPyJGX3ZWxWdEtRnWtBtGSJ28SLg8Pzmc4xo-fo9hfFMD02pGS4&_nc_zt=23&_nc_ht=scontent.fmnl25-8.fna&_nc_gid=5r2L7c-J243A1q5h4bnepw&oh=00_AfY97ROoC_2gusmXL2-gXpUF1OXlX4_gbAWJ5lz4pT5CbQ&oe=68D2169B" alt="Liga Sports Events">
              <div class="card-content">
                <h3 class="card-title">Liga Sports Events</h3>
                <p class="card-description">Promoting sportsmanship, healthy competition, and community unity through various sporting activities.</p>
                <div class="card-tags">
                  <span class="tag">Sports</span>
                  <span class="tag">Recreation</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Services -->
      <section class="services-section" id="services">
        <div class="container">
          <h2 class="section-title">Services Offered</h2>
          <div class="services-grid">
            <div class="service-card">
              <span class="service-icon">📄</span>
              <h3 class="service-title">Document Issuance</h3>
              <p class="service-description">Request for official barangay documents, certifications, and permits for various purposes.</p>
              <p class="service-hours">Available during office hours</p>
            </div>
            <div class="service-card">
              <span class="service-icon">🏥</span>
              <h3 class="service-title">Health Programs</h3>
              <p class="service-description">Comprehensive health education and medical services designed for community wellness.</p>
              <p class="service-hours">Promoting community wellness</p>
            </div>
            <div class="service-card">
              <span class="service-icon">📞</span>
              <h3 class="service-title">Incident Reporting</h3>
              <p class="service-description">24/7 reporting system for incidents and emergencies to ensure community safety.</p>
              <p class="service-hours">Emergency hotline available</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Footer -->
      <footer class="footer" id="contact">
        <div class="container">
          <div class="footer-content">
            <div class="footer-section">
              <h4>Contact Information</h4>
              <p>📞 Phone: (123) 456-7890</p>
              <p>✉️ Email: barangaylangkaan2@gmail.com</p>
              <p>📍 Address: Barangay Langkaan II, Dasmariñas, Cavite Philippines 4114</p>
              <p>🌐 Website: www.barangaylangkaan2.gov.ph</p>
            </div>
            <div class="footer-section">
              <h4>Quick Links</h4>
              <a href="#home">Home</a>
              <a href="#development">Community Development</a>
              <a href="#services">Services</a>
              <a href="#news">News & Announcements</a>
              <a href="/about-langkaan">About Langkaan II</a>
              <a href="/login.html">Web Management System</a>
            </div>
            <div class="footer-section">
              <h4>Follow Us</h4>
              <p>Stay connected on social media for the latest updates and community news.</p>
              <p>📘 Facebook: @barangaylangkaan2</p>
              <p>📷 Instagram: @barangaylangkaan2</p>
              <p>🐦 Twitter: @langkaan2_bg</p>
            </div>
            <div class="footer-section">
              <h4>Office Hours</h4>
              <p>📅 Monday - Friday: 8:00 AM - 5:00 PM</p>
              <p>📅 Saturday: 8:00 AM - 12:00 PM</p>
              <p>📅 Sunday: Closed</p>
              <p>🚨 Emergency Services: 24/7</p>
            </div>
          </div>
          <div class="footer-bottom">
            <p>&copy; 2024 Barangay Langkaan II. All rights reserved. | Privacy Policy | Terms of Service</p>
          </div>
        </div>
      </footer>

      <script>
        // Mobile menu toggle function
        function toggleMobileMenu() {
          const navMenu = document.getElementById('navMenu');
          navMenu.classList.toggle('active');
        }

        // Close mobile menu when clicking on a link
        document.querySelectorAll('.nav-menu a').forEach(link => {
          link.addEventListener('click', () => {
            const navMenu = document.getElementById('navMenu');
            navMenu.classList.remove('active');
          });
        });

        // Smooth scrolling for navigation links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
          anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
              target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
              });
            }
          });
        });

        // Enhanced scroll effect for header
        window.addEventListener('scroll', function() {
          const header = document.querySelector('.header');
          if (window.scrollY > 100) {
            header.style.background = 'rgba(26, 35, 126, 0.95)';
            header.style.backdropFilter = 'blur(10px)';
            header.style.boxShadow = '0 4px 30px rgba(26, 35, 126, 0.4)';
          } else {
            header.style.background = '#1a237e';
            header.style.backdropFilter = 'none';
            header.style.boxShadow = '0 4px 20px rgba(26, 35, 126, 0.3)';
          }
        });

        // Close mobile menu when clicking outside
        document.addEventListener('click', function(event) {
          const navMenu = document.getElementById('navMenu');
          const mobileToggle = document.querySelector('.mobile-menu-toggle');
          const navContainer = document.querySelector('.nav-container');
          
          if (!navContainer.contains(event.target)) {
            navMenu.classList.remove('active');
          }
        });

        // Add loading animation
        window.addEventListener('load', function() {
          document.body.style.opacity = '0';
          document.body.style.transition = 'opacity 0.5s ease';
          setTimeout(() => {
            document.body.style.opacity = '1';
          }, 100);
        });
      </script>
    </body>
    </html>
  `);
});

// Route for About Langkaan II page (placeholder for now)
app.get('/about-langkaan', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>About Barangay Langkaan II</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          line-height: 1.6;
        }
        .back-btn {
          background: #1a237e;
          color: white;
          padding: 10px 20px;
          text-decoration: none;
          border-radius: 5px;
          display: inline-block;
          margin-bottom: 20px;
        }
        .back-btn:hover {
          background: #ff6f00;
        }
      </style>
    </head>
    <body>
      <a href="/" class="back-btn">← Back to Home</a>
      <h1>About Barangay Langkaan II</h1>
      <p>This page will contain information about Barangay Langkaan II.</p>
      <p><em>This page is under development and will be implemented in the next steps.</em></p>
    </body>
    </html>
  `);
});

// ---------- Simple status/test ----------
app.get('/api/test', (req, res) => {
  res.json({ message: 'Barangay Langkaan II System API is running!', timestamp: new Date().toISOString(), status: 'success' });
});
app.get('/api/status', (req, res) => {
  res.json({
    system: 'Barangay Langkaan II Web Management System',
    version: '1.0.0',
    status: 'operational',
    services: { express: 'running', session: 'configured', staticFiles: 'serving', database: 'connected', authentication: 'enabled' },
    timestamp: new Date().toISOString()
  });
});

// ---------- Static pages (ABOVE any 404) ----------
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/login.html', (req, res) => res.redirect('/login'));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/signup-success', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup-success.html')));

// Legacy dashboard route - redirect based on role
app.get('/dashboard', requireAuth, (req, res) => {
  const user = req.session.user;
  const isAdmin = /^(admin)$/i.test(user?.role||'') || user?.isAdmin===true || user?.type==='admin' || user?.accountType==='admin';
  if (isAdmin) {
    return res.redirect('/admin/dashboard');
  } else {
    return res.redirect('/user/dashboard');
  }
});

// Admin dashboard routes
app.get('/admin/dashboard', requireAuth, requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'admin-dashboard.html')));
app.get('/admin/residents', requireAuth, requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'admin-residents.html')));
app.get('/admin/document-permits', requireAuth, requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'admin-document-permits.html')));
app.get('/admin/community', requireAuth, requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'admin-community.html')));
app.get('/admin/cases', requireAuth, requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'admin-cases.html')));
app.get('/admin/health', requireAuth, requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'admin-health.html')));
app.get('/admin/disaster', requireAuth, requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'admin-disaster.html')));
app.get('/admin/financial', requireAuth, requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'admin-financial.html')));
app.get('/admin/logs-reports', requireAuth, requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'admin-logs-reports.html')));
app.get('/admin/settings', requireAuth, requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'admin-settings.html')));

// User dashboard routes
app.get('/user/dashboard', requireAuth, (req, res) => {
  const user = req.session.user;
  const isAdmin = /^(admin)$/i.test(user?.role||'') || user?.isAdmin===true || user?.type==='admin' || user?.accountType==='admin';
  if (isAdmin) {
    return res.redirect('/admin/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'user', 'user-dashboard.html'));
});
app.get('/user/document-permits', requireAuth, (req, res) => {
  const user = req.session.user;
  const isAdmin = /^(admin)$/i.test(user?.role||'') || user?.isAdmin===true || user?.type==='admin' || user?.accountType==='admin';
  if (isAdmin) return res.redirect('/admin/document-permits');
  res.sendFile(path.join(__dirname, 'public', 'user', 'user-document-permits.html'));
});
app.get('/user/community', requireAuth, (req, res) => {
  const user = req.session.user;
  const isAdmin = /^(admin)$/i.test(user?.role||'') || user?.isAdmin===true || user?.type==='admin' || user?.accountType==='admin';
  if (isAdmin) return res.redirect('/admin/community');
  res.sendFile(path.join(__dirname, 'public', 'user', 'user-community.html'));
});
app.get('/user/cases', requireAuth, (req, res) => {
  const user = req.session.user;
  const isAdmin = /^(admin)$/i.test(user?.role||'') || user?.isAdmin===true || user?.type==='admin' || user?.accountType==='admin';
  if (isAdmin) return res.redirect('/admin/cases');
  res.sendFile(path.join(__dirname, 'public', 'user', 'user-cases.html'));
});
app.get('/user/health', requireAuth, (req, res) => {
  const user = req.session.user;
  const isAdmin = /^(admin)$/i.test(user?.role||'') || user?.isAdmin===true || user?.type==='admin' || user?.accountType==='admin';
  if (isAdmin) return res.redirect('/admin/health');
  res.sendFile(path.join(__dirname, 'public', 'user', 'user-health.html'));
});
app.get('/user/disaster', requireAuth, (req, res) => {
  const user = req.session.user;
  const isAdmin = /^(admin)$/i.test(user?.role||'') || user?.isAdmin===true || user?.type==='admin' || user?.accountType==='admin';
  if (isAdmin) return res.redirect('/admin/disaster');
  res.sendFile(path.join(__dirname, 'public', 'user', 'user-disaster.html'));
});
app.get('/user/settings', requireAuth, (req, res) => {
  const user = req.session.user;
  const isAdmin = /^(admin)$/i.test(user?.role||'') || user?.isAdmin===true || user?.type==='admin' || user?.accountType==='admin';
  if (isAdmin) return res.redirect('/admin/settings');
  res.sendFile(path.join(__dirname, 'public', 'user', 'user-settings.html'));
});

// ---------- Auth APIs ----------
const rememberSelected = (v) => v === true || v === 'on' || v === 'true' || v === '1';

// Login: try MongoDB first, then fallback to legacy hardcoded creds
app.post('/api/login', async (req, res) => {
  try {
    const { username, password, remember } = req.body || {};
    const loginId = String(username || '').toLowerCase().trim();

    // 1) MongoDB users (username OR email)
    const dbUser = await withDb(async (db) =>
      db.collection('users').findOne({ $or: [{ username: loginId }, { email: loginId }] })
    );

    if (dbUser) {
      const ok = await bcrypt.compare(password || '', dbUser.passwordHash || '');
      if (!ok) return res.status(401).json({ ok: false, message: 'Invalid credentials' });

      req.session.user = {
        name: dbUser.name,
        username: dbUser.username,
        role: dbUser.role || 'user',
        verified: !!dbUser.verified,
        address: dbUser.address || ''
      };
      req.session.cookie.maxAge = rememberSelected(remember)
        ? (30 * 24 * 60 * 60 * 1000)  // 30 days
        : (24 * 60 * 60 * 1000);      // 1 day

      return res.json({ ok: true, user: req.session.user });
    }

    // 2) Legacy fallback (hardcoded)
    const hard = Object.values(CREDENTIALS).find(
      u => u.username.toLowerCase() === loginId && u.password === password
    );
    if (!hard) return res.status(401).json({ ok: false, message: 'Invalid credentials' });

    req.session.user = {
      name: hard.name,
      username: hard.username.toLowerCase(),
      role: hard.role,
      verified: hard.role !== 'pending',
      address: hard.address || ''
    };
    req.session.cookie.maxAge = rememberSelected(remember)
      ? (30 * 24 * 60 * 60 * 1000)
      : (24 * 60 * 60 * 1000);

    return res.json({ ok: true, user: req.session.user });
  } catch (e) {
    console.error('Login error:', e);
    return res.status(500).json({ ok: false, message: 'Login failed' });
  }
});

app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Sign up: persist to MongoDB (verified: false) and start a limited session
app.post('/api/signup', async (req, res) => {
  try {
    const { firstName, middleName = '', lastName, username, email, password, address } = req.body || {};

    // Backend validation (matches your frontend)
    const emailRE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const usernameRE = /^[a-zA-Z0-9._-]{3,20}$/;
    const strongPwRE = /^(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;

    if (!firstName || !lastName || !username || !email || !password || !address) {
      return res.status(400).json({ ok: false, message: 'Please fill all required fields.' });
    }
    if (!emailRE.test(String(email).trim())) {
      return res.status(400).json({ ok: false, message: 'Please enter a valid email address.' });
    }
    if (!usernameRE.test(String(username).trim())) {
      return res.status(400).json({ ok: false, message: 'Invalid username format.' });
    }
    if (!strongPwRE.test(password)) {
      return res.status(400).json({ ok: false, message: 'Password is not strong enough.' });
    }

    const name = [firstName.trim(), (middleName || '').trim(), lastName.trim()].filter(Boolean).join(' ');
    const usernameLower = String(username).toLowerCase().trim();
    const emailLower = String(email).toLowerCase().trim();
    const passwordHash = await bcrypt.hash(password, 10);

    await withDb(async (db) => {
      const users = db.collection('users');

      // indexes are created at startup (do not create inside request)
      const existing = await users.findOne({ $or: [{ username: usernameLower }, { email: emailLower }] });
      if (existing) {
        return res.status(409).json({ ok: false, message: 'Username or email already registered.' });
      }

      await users.insertOne({
        username: usernameLower,
        email: emailLower,
        firstName: firstName.trim(),
        middleName: (middleName || '').trim(),
        lastName: lastName.trim(),
        name,
        role: 'user',
        verified: false,     // under verification
        address: address.trim(),
        passwordHash,
        createdAt: new Date()
      });
    });

    // Minimal pending session so user can see success/limited access
    req.session.user = {
      name,
      username: usernameLower,
      role: 'user',
      verified: false,
      address
    };
    req.session.cookie.maxAge = 24 * 60 * 60 * 1000;

    return res.json({ ok: true, message: 'Account created and pending verification.' });
  } catch (e) {
    // Duplicate key error from unique index
    if (e && e.code === 11000) {
      return res.status(409).json({ ok: false, message: 'Username or email already registered.' });
    }
    console.error('Signup error:', e);
    return res.status(500).json({ ok: false, message: 'Failed to create account' });
  }
});

// Forgot password placeholder
app.post('/api/forgot-password', (req, res) => {
  const { usernameOrEmail } = req.body || {};
  if (!usernameOrEmail) {
    return res.status(400).json({ ok: false, message: 'Please enter your email or username.' });
  }
  // TODO: generate token + email link
  return res.json({ ok: true, message: 'If the account exists, a reset link has been sent.' });
});

// ---------- Data APIs used by dashboard ----------
app.get('/api/stats', requireAuth, async (req, res) => {
  const data = await withDb(async (db) => {
    const totalResidents = await db.collection('residents').countDocuments();
    const totalDocuments = await db.collection('documents').countDocuments();
    const pendingDocuments = await db.collection('documents').countDocuments({ status: 'Pending' });
    return { totalResidents, totalDocuments, pendingDocuments, avgResidents: 2.5 };
  });

  res.json({
    ok: true,
    stats: data || { totalResidents: 0, totalDocuments: 0, pendingDocuments: 0, avgResidents: 0 }
  });
});

app.get('/api/recent-activities', requireAuth, (req, res) => {
  res.json({
    ok: true,
    recentActivities: [
      { name: 'John Dela Cruz', action: 'Requested a Barangay Clearance Certificate', date: 'April 10, 2025' },
      { name: 'Maria Santos', action: 'Filed a Complaint', date: 'April 10, 2025' },
      { name: 'Cedrick Tolentino', action: 'Document approved', date: 'April 10, 2025' }
    ]
  });
});

app.get('/api/residents', requireAuth, async (req, res) => {
  const residents = await withDb(async (db) => db.collection('residents').find({}).toArray());
  res.json({ ok: true, residents: residents || [] });
});

app.get('/api/documents', requireAuth, async (req, res) => {
  const user = req.session.user;
  const isAdmin = /^(admin)$/i.test(user?.role||'') || user?.isAdmin===true || user?.type==='admin' || user?.accountType==='admin';
  
  const query = {};
  // For non-admin users, only show their own document requests
  if (!isAdmin) {
    query.$or = [
      { requesterName: user?.name },
      { requesterUsername: user?.username?.toLowerCase() },
      { 'requester.username': user?.username?.toLowerCase() }
    ];
  }
  
  const documents = await withDb(async (db) =>
    db.collection('documents').find(query).toArray()
  );
  res.json({ ok: true, documents });
});

// Create a new document request
app.post('/api/documents/add', requireAuth, async (req, res) => {
  const user = req.session.user;
  const {
    requesterName, address, typeOfDocument,
    purpose = '', numberOfCopies = 1,
    paymentMethod = '', paymentStatus = ''
  } = req.body || {};

  if (!requesterName || !address || !typeOfDocument) {
    return res.status(400).json({ ok:false, message:'Missing required fields.' });
  }

  const doc = {
    requesterName: String(requesterName).trim(),
    requesterUsername: user?.username?.toLowerCase() || '',
    address: String(address).trim(),
    typeOfDocument: String(typeOfDocument).trim(),
    purpose: String(purpose || '').trim(),
    numberOfCopies: Math.max(1, parseInt(numberOfCopies || 1, 10)),
    status: 'Pending',
    dateRequested: new Date(),
    paymentMethod: String(paymentMethod || ''),
    paymentStatus: String(paymentStatus || '')
  };

  await withDb(async (db) => db.collection('documents').insertOne(doc));
  res.json({ ok: true });
});

// Update document status (admin-only) - MUST come before /api/documents/:id routes
app.post('/api/documents/update-status/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { status, dateReleased } = req.body || {};
    
    console.log('[update-status] Request received:', { id, status, dateReleased, user: req.session.user?.username });

    if (!id) {
      return res.status(400).json({ ok: false, message: 'Document ID is required' });
    }

    if (!status) {
      return res.status(400).json({ ok: false, message: 'Status is required' });
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, message: 'Invalid document ID format' });
    }

    const update = { status: String(status).trim() };
    if (dateReleased) {
      const date = new Date(dateReleased);
      if (isNaN(date.getTime())) {
        return res.status(400).json({ ok: false, message: 'Invalid date format' });
      }
      update.dateReleased = date;
    } else if (status === 'Released') {
      update.dateReleased = new Date();
    }

    const result = await withDb(async (db) => {
      return await db.collection('documents').updateOne(
        { _id: new ObjectId(id) },
        { $set: update }
      );
    });

    if (result.matchedCount === 0) {
      return res.status(404).json({ ok: false, message: 'Document not found' });
    }

    res.json({ ok: true, message: 'Status updated successfully' });
  } catch (error) {
    console.error('Error updating document status:', error);
    res.status(500).json({ ok: false, message: error.message || 'Failed to update status' });
  }
});

// Edit existing document (admin-only)
app.put('/api/documents/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  const {
    requesterName, address, typeOfDocument,
    purpose = '', numberOfCopies = 1,
    paymentMethod = '', paymentStatus = ''
  } = req.body || {};

  await withDb(async (db) => {
    await db.collection('documents').updateOne(
      { _id: new ObjectId(id) },
      { $set: {
          requesterName: String(requesterName||'').trim(),
          address: String(address||'').trim(),
          typeOfDocument: String(typeOfDocument||'').trim(),
          purpose: String(purpose||'').trim(),
          numberOfCopies: Math.max(1, parseInt(numberOfCopies || 1, 10)),
          paymentMethod: String(paymentMethod||''),
          paymentStatus: String(paymentStatus||'')
        }
      }
    );
  });
  res.json({ ok: true });
});

// Delete a request (admin-only)
app.delete('/api/documents/:id', requireAdmin, async (req, res) => {
  await withDb(async (db) => db.collection('documents').deleteOne({ _id: new ObjectId(req.params.id) }));
  res.json({ ok: true });
});

// Bulk release selected ids (admin-only)
app.post('/api/documents/bulk-release', requireAdmin, async (req, res) => {
  const ids = (req.body?.ids || []).filter(Boolean).map((i)=>new ObjectId(i));
  if (!ids.length) return res.status(400).json({ ok:false, message:'No ids' });

  await withDb(async (db) => {
    await db.collection('documents').updateMany(
      { _id: { $in: ids } },
      { $set: { status: 'Released', dateReleased: new Date() } }
    );
  });
  res.json({ ok: true });
});

app.get('/residents', requireAuth, (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin', 'admin-residents.html'))
);

app.get('/document-permits', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'admin-document-permits.html'));
});

app.get('/cases', requireAuth, (req, res) => {
  const user = req.session.user;
  const isAdmin = /^(admin)$/i.test(user?.role||'') || user?.isAdmin===true || user?.type==='admin' || user?.accountType==='admin';
  if (isAdmin) {
    return res.redirect('/admin/cases');
  }
  return res.redirect('/user/cases');
});
require('./routes/cases')(app); // mount the router

// after other routers:
const communityRouter = require('./routes/community')(withDb, requireAuth, requireAdmin);
app.use(communityRouter);

// Health module (records, schedules, calendar, printing)
// IMPORTANT: Mount health router BEFORE static files and 404 handler
try {
  const healthRouter = require('./routes/health')(withDb, requireAuth, requireAdmin);
  // Mount at root - routes are defined with absolute paths like /api/health/schedules
  app.use(healthRouter);
  console.log('✅ Health router mounted successfully');
} catch (err) {
  console.error('❌ Failed to mount health router:', err.message);
}

// and ensure uploads are served if not already:
// In serverless environments, use /tmp/uploads, otherwise use regular uploads folder
const fs = require('fs');
const getUploadsDir = () => {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT) {
    return '/tmp/uploads';
  }
  return path.join(__dirname, 'uploads');
};

const uploadsDir = getUploadsDir();
// Ensure directory exists
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (err) {
  console.warn('[welcome] Could not create uploads directory:', err.message);
}

app.use('/uploads', express.static(uploadsDir));

app.get('/health', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'admin-health.html'));
});

app.get('/disaster', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'admin-disaster.html'));
});
// Serve the financial page (admin only)
app.get('/financial', requireAuth, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'admin-financial.html'));
});

// Mount financial routes
const financialRouter = require('./routes/financial')(withDb, requireAuth, requireAdmin);
app.use(financialRouter);

app.get('/logs-reports', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'admin-logs-reports.html'));
});

app.get('/settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'admin-settings.html'));
});

// ---------- ONE error handler + ONE 404 (last) ----------
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!', message: err.message });
});

const logsApi = require('./routes/logs');
app.use('/api/logs', logsApi);

const settingsApi = require('./routes/settings');
app.use('/api/settings', settingsApi);

// Health + maintenance page route (optional explicit route)
app.get('/maintenance', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'maintenance.html'))
);

app.use((req, res) => {
  res.status(404).send(`
    <!doctype html><html><head><meta charset="utf-8">
    <title>Page Not Found - Barangay Langkaan II</title>
    <style>body{font-family:Arial,sans-serif;text-align:center;padding:50px;background:#f8f9fa}
    .box{max-width:600px;margin:0 auto;background:#fff;padding:40px;border-radius:10px;box-shadow:0 4px 6px rgba(0,0,0,.1)}
    h1{color:#1a237e}.btn{background:#1a237e;color:#fff;padding:12px 24px;text-decoration:none;border-radius:5px;display:inline-block;margin-top:20px}
    .btn:hover{background:#ff6f00}</style></head>
    <body><div class="box"><h1>404 - Page Not Found</h1>
    <p>The page you're looking for doesn't exist in the Barangay Langkaan II system.</p>
    <a href="/" class="btn">← Return to Home</a></div></body></html>
  `);
});

// ---------- Start ----------
// Only start server if not running on Vercel (serverless environment)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Barangay Langkaan II Web Management System`);
    console.log(`📡 Server running on http://localhost:${PORT}`);
    console.log(`📁 Serving static files from 'public' directory`);
    console.log(`\n📋 Routes: /, /login, /signup, /signup-success, /dashboard`);
    console.log(`🔐 Auth APIs: POST /api/login, POST /api/signup, POST /api/forgot-password, GET /api/me, POST /api/logout`);
  });
}

module.exports = app;