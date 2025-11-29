// routes/settings.js
const express = require('express');
const router = express.Router();
const UserSettings = require('../models/UserSettings');
const SystemSettings = require('../models/SystemSettings');
const maintenanceGuard = require('../middleware/maintenance');

// NOTE: replace these stubs with your actual auth later
function getUser(req) {
  // if you already have req.user from your login middleware, use that
  return { id: (req.user?.id || 'admin'), role: (req.user?.role || 'Admin'), name: 'Admin User' };
}

// ----- USER SETTINGS -----
router.get('/me', async (req, res) => {
  const me = getUser(req);
  const found = await UserSettings.findOne({ userId: me.id }).lean();
  res.json({ userId: me.id, settings: found || {} });
});

router.put('/me', async (req, res) => {
  const me = getUser(req);
  const payload = req.body || {};
  const saved = await UserSettings.findOneAndUpdate(
    { userId: me.id },
    { $set: payload },
    { new: true, upsert: true }
  ).lean();
  res.json({ ok: true, settings: saved });
});

// ----- SYSTEM SETTINGS (ADMIN ONLY) -----
router.get('/system', async (req, res) => {
  const me = getUser(req);
  if (!/admin/i.test(me.role)) return res.status(403).json({ error: 'Forbidden' });
  const sys = await SystemSettings.findOne().lean();
  res.json({ settings: sys || {} });
});

router.put('/system', async (req, res) => {
  const me = getUser(req);
  if (!/admin/i.test(me.role)) return res.status(403).json({ error: 'Forbidden' });
  const payload = req.body || {};
  const saved = await SystemSettings.findOneAndUpdate(
    {},
    { $set: payload },
    { new: true, upsert: true }
  ).lean();

  maintenanceGuard.invalidate?.();
  res.json({ ok: true, settings: saved });
});

module.exports = router;
