// middleware/maintenance.js
const path = require('path');
const SystemSettings = require('../models/SystemSettings');

// tiny in-memory cache to avoid DB hit on every request
let cached = { maintenanceMode: false, ts: 0 };
const TTL_MS = 5000; // refresh every 5s

async function getFlag() {
  const now = Date.now();
  if (now - cached.ts > TTL_MS) {
    const doc = await SystemSettings.findOne().lean();
    cached = { maintenanceMode: !!(doc && doc.maintenanceMode), ts: now };
  }
  return cached.maintenanceMode;
}

// helper: detect admin; adapt to your real auth (req.user)
function isAdmin(req) {
  // if you already attach req.user in your auth middleware, use that:
  if (req.user && /admin/i.test(req.user.role)) return true;
  // dev/testing bypass (remove later if you want)
  if (req.query.admin_bypass === '1') return true;
  return false;
}

const WHITELIST = [
  '/maintenance',        // allow the maintenance page
  '/api/settings',       // allow admins to toggle mode back off
  '/api/me',             // allow the app to know who you are
  '/health',             // keep health endpoint
  '/favicon.ico',
];

module.exports = async function maintenanceGuard(req, res, next) {
  try {
    const on = await getFlag();
    if (!on) return next();

    // don't trap admins
    if (isAdmin(req)) return next();

    // let whitelisted paths through
    if (WHITELIST.some(p => req.path.startsWith(p))) return next();

    // if the client wants HTML, serve maintenance page
    const wantsHtml = (req.headers.accept || '').includes('text/html');
    if (wantsHtml && req.method === 'GET') {
      return res.sendFile(path.join(__dirname, '..', 'public', 'maintenance.html'));
    }

    // for API/JSON requests from non-admins, return 503
    res.status(503).json({ error: 'Service under maintenance. Please try again later.' });
  } catch (e) {
    // in case of any error, fail open (don’t lock everyone out)
    next();
  }
};

// optional: helper to bust cache after settings change
module.exports.invalidate = () => { cached.ts = 0; };
