// routes/logs.js
const express = require('express');
const router = express.Router();
const { ReportLog, ActivityLog, UserLog, SystemLog } = require('../models/logs');

// helpers
function buildDateRange(qs, field = 'createdAt') {
  const f = {};
  if (qs.from) f.$gte = new Date(qs.from + 'T00:00:00Z');
  if (qs.to) f.$lte = new Date(qs.to + 'T23:59:59Z');
  return Object.keys(f).length ? { [field]: f } : {};
}
function paginate(qs) {
  const page = Math.max(parseInt(qs.page || '1'), 1);
  const pageSize = Math.min(Math.max(parseInt(qs.pageSize || '20'), 1), 200);
  return { skip: (page - 1) * pageSize, limit: pageSize, page, pageSize };
}

// Reports
router.get('/reports', async (req, res) => {
  const { module: mod, status } = req.query;
  const date = buildDateRange(req.query);
  const { skip, limit, page, pageSize } = paginate(req.query);

  const filter = { ...(mod ? { module: mod } : {}), ...(status ? { status } : {}), ...date };
  const [items, total] = await Promise.all([
    ReportLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ReportLog.countDocuments(filter),
  ]);

  res.json({ items, total, page, pageSize });
});

// Activity
router.get('/activity', async (req, res) => {
  const { activityType, search, module: mod, status } = req.query;
  const date = buildDateRange(req.query);
  const { skip, limit, page, pageSize } = paginate(req.query);

  const filter = {
    ...(activityType ? { activityType } : {}),
    ...(mod ? { module: mod } : {}),
    ...(status ? { status } : {}),
    ...date,
  };
  if (search) {
    filter.$or = [
      { userName: new RegExp(search, 'i') },
      { description: new RegExp(search, 'i') },
      { ipAddress: new RegExp(search, 'i') },
    ];
  }

  const [items, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ActivityLog.countDocuments(filter),
  ]);

  res.json({ items, total, page, pageSize });
});

// Users
router.get('/users', async (req, res) => {
  const { status, role, search } = req.query;
  const { skip, limit, page, pageSize } = paginate(req.query);

  const filter = { ...(status ? { status } : {}), ...(role ? { role } : {}) };
  if (search) {
    filter.$or = [
      { username: new RegExp(search, 'i') },
      { fullName: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
    ];
  }

  const [items, total] = await Promise.all([
    UserLog.find(filter).sort({ lastLogin: -1 }).skip(skip).limit(limit).lean(),
    UserLog.countDocuments(filter),
  ]);

  res.json({ items, total, page, pageSize });
});

// System
router.get('/system', async (req, res) => {
  const { level } = req.query;
  const date = buildDateRange(req.query);
  const { skip, limit, page, pageSize } = paginate(req.query);

  const filter = { ...(level ? { logLevel: level } : {}), ...date };
  const [items, total] = await Promise.all([
    SystemLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    SystemLog.countDocuments(filter),
  ]);

  res.json({ items, total, page, pageSize });
});

module.exports = router;
