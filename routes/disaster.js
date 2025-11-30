// routes/disaster.js
// Disaster & Emergency Response module (incidents, coordination, monitoring, plans, contacts, resources)

const express = require('express');
const path = require('path');
const fs = require('fs');
const { ObjectId } = require('mongodb');

let multer;
try {
  multer = require('multer');
} catch {
  console.warn('[disaster] multer not installed — run: npm i multer');
}

module.exports = function disasterRoutes(withDb, requireAuth, requireAdmin) {
  const router = express.Router();

  // ---------- Upload helpers (shared with other modules) ----------
  const getUploadDir = () => {
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT) {
      return '/tmp/uploads';
    }
    return path.join(process.cwd(), 'uploads');
  };

  const ensureUploadDir = () => {
    const uploadDir = getUploadDir();
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      return { success: true, dir: uploadDir };
    } catch (err) {
      console.error('[disaster] Failed to create upload directory:', err.message);
      return { success: false, error: err.message, dir: uploadDir };
    }
  };

  let upload = null;
  if (multer) {
    const dirCheck = ensureUploadDir();
    if (!dirCheck.success) {
      console.error('[disaster] Upload directory error:', dirCheck.error);
    }

    const storage = multer.diskStorage({
      destination: (_, __, cb) => {
        try {
          const dirCheckInner = ensureUploadDir();
          if (!dirCheckInner.success) {
            return cb(new Error(`Upload directory not accessible: ${dirCheckInner.error}`));
          }
          cb(null, dirCheckInner.dir);
        } catch (err) {
          cb(err);
        }
      },
      filename: (_, file, cb) => {
        const ext = (file.originalname.split('.').pop() || 'bin').toLowerCase();
        cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext);
      }
    });

    upload = multer({
      storage,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
    });
  }

  // ---------- Collections + indexes ----------
  async function ensureDisasterCollections(db) {
    const names = (await db.listCollections().toArray()).map(c => c.name);
    const ensure = async (name, indexes = []) => {
      if (!names.includes(name)) {
        await db.createCollection(name);
      }
      const col = db.collection(name);
      for (const idx of indexes) {
        try {
          await col.createIndex(idx.keys, idx.options || {});
        } catch (e) {
          console.warn('[disaster] index warning for', name, idx, e.message);
        }
      }
    };

    await ensure('disaster_incidents', [
      { keys: { dateTime: -1 }, options: { name: 'by_dateTime' } },
      { keys: { status: 1, dateTime: -1 }, options: { name: 'by_status_date' } },
      { keys: { priority: 1, dateTime: -1 }, options: { name: 'by_priority_date' } },
      { keys: { 'reportedBy.username': 1, dateTime: -1 }, options: { name: 'by_reporter' } }
    ]);

    await ensure('disaster_coordination', [
      { keys: { coordinationDate: -1 }, options: { name: 'by_coord_date' } },
      { keys: { status: 1, coordinationDate: -1 }, options: { name: 'by_status_date' } }
    ]);

    await ensure('disaster_monitoring_areas', [
      { keys: { area: 1 }, options: { name: 'by_area' } },
      { keys: { riskLevel: 1 }, options: { name: 'by_risk' } }
    ]);

    await ensure('disaster_preparedness_plans', [
      { keys: { disasterType: 1 }, options: { name: 'by_type' } },
      { keys: { status: 1 }, options: { name: 'by_status' } },
      { keys: { lastUpdated: -1 }, options: { name: 'by_lastUpdated' } }
    ]);

    await ensure('disaster_contacts', [
      { keys: { type: 1 }, options: { name: 'by_type' } },
      { keys: { status: 1 }, options: { name: 'by_status' } }
    ]);

    await ensure('disaster_resources', [
      { keys: { category: 1 }, options: { name: 'by_category' } },
      { keys: { status: 1 }, options: { name: 'by_status' } }
    ]);

    await ensure('disaster_alerts', [
      { keys: { active: 1, createdAt: -1 }, options: { name: 'by_active_createdAt' } }
    ]);

    await ensure('disaster_announcements', [
      { keys: { createdAt: -1 }, options: { name: 'by_createdAt' } }
    ]);
  }

  async function withDisaster(fn) {
    return withDb(async (db) => {
      await ensureDisasterCollections(db);
      return fn(db);
    });
  }

  // ---------- helpers ----------
  function parsePaging(req) {
    const {
      page = '1',
      limit = '10',
      status = '',
      q = '',
      from = '',
      to = '',
      sort = 'desc',
      mine = '',
      type = ''
    } = req.query;

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

    return {
      page: p,
      limit: l,
      status: String(status || ''),
      q: String(q || ''),
      from: String(from || ''),
      to: String(to || ''),
      sort: sort === 'asc' ? 'asc' : 'desc',
      mine: String(mine || ''),
      type: String(type || '')
    };
  }

  function buildDateRangeQuery(field, from, to) {
    if (!from && !to) return {};
    const range = {};
    if (from) range.$gte = new Date(from);
    if (to) {
      const t = new Date(to);
      t.setHours(23, 59, 59, 999);
      range.$lte = t;
    }
    return { [field]: range };
  }

  function buildSearchQuery(fields, q) {
    if (!q || !q.trim() || !fields?.length) return {};
    const rx = new RegExp(q.trim(), 'i');
    return {
      $or: fields.map(f => ({ [f]: rx }))
    };
  }

  const INCIDENT_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
  const INCIDENT_STATUSES = ['Pending', 'Ongoing', 'Resolved', 'Cancelled'];

  // ---------- summary + population stats ----------
  router.get('/api/disaster/summary', requireAuth, async (req, res) => {
    try {
      const me = req.session.user || {};
      const isAdmin = /^(admin)$/i.test(me?.role || '') || me?.isAdmin === true;
      const { mine = '' } = req.query;
      const mineOnly = mine === 'true' && !isAdmin;

      const summary = await withDisaster(async (db) => {
        const incidentsCol = db.collection('disaster_incidents');
        const coordCol = db.collection('disaster_coordination');

        const baseMatch = {};
        if (mineOnly && me.username) {
          baseMatch['reportedBy.username'] = me.username.toLowerCase();
        }

        const byStatus = await incidentsCol.aggregate([
          { $match: baseMatch },
          { $group: { _id: '$status', n: { $sum: 1 } } }
        ]).toArray();

        const byPriority = await incidentsCol.aggregate([
          { $match: { ...baseMatch, priority: 'Critical' } },
          { $group: { _id: '$priority', n: { $sum: 1 } } }
        ]).toArray();

        const affectedAgg = await incidentsCol.aggregate([
          { $match: baseMatch },
          { $group: { _id: null, total: { $sum: { $ifNull: ['$affectedCount', 0] } } } }
        ]).toArray();

        const teamsAgg = await coordCol.aggregate([
          { $match: mineOnly && me.username ? { 'createdBy.username': me.username.toLowerCase() } : {} },
          { $group: { _id: null, total: { $sum: 1 } } }
        ]).toArray();

        const out = {
          Total: 0,
          Critical: 0,
          Ongoing: 0,
          Resolved: 0,
          Affected: 0,
          Teams: 0
        };

        let total = 0;
        byStatus.forEach(r => {
          const s = r._id || 'Pending';
          if (s === 'Ongoing') out.Ongoing += r.n;
          if (s === 'Resolved') out.Resolved += r.n;
          total += r.n;
        });
        out.Total = total;
        out.Critical = (byPriority[0]?.n) || 0;
        out.Affected = (affectedAgg[0]?.total) || 0;
        out.Teams = (teamsAgg[0]?.total) || 0;

        // Population stats from residents collection
        const residentsCol = db.collection('residents');
        const residents = await residentsCol.find({}).toArray();

        let totalPop = 0;
        let seniors = 0;
        let minors = 0;
        let pets = 0;

        const now = new Date();
        residents.forEach(r => {
          totalPop += 1;
          let dob = null;
          if (r.birthDate instanceof Date) {
            dob = r.birthDate;
          } else if (r.dateOfBirth) {
            const d = new Date(r.dateOfBirth);
            if (!Number.isNaN(d.getTime())) dob = d;
          }
          if (dob) {
            const ageYears = Math.floor((now - dob) / (1000 * 60 * 60 * 24 * 365.25));
            if (ageYears >= 60) seniors += 1;
            else if (ageYears < 18) minors += 1;
          }
          const petCount = Number(r.householdPets || r.petsCount || 0);
          if (!Number.isNaN(petCount)) pets += petCount;
        });

        out.PopulationTotal = totalPop;
        out.PopulationSeniors = seniors;
        out.PopulationMinors = minors;
        out.PopulationPets = pets;

        return out;
      });

      res.json({ ok: true, summary });
    } catch (e) {
      console.error('[disaster] summary error', e);
      res.json({
        ok: false,
        summary: {
          Total: 0,
          Critical: 0,
          Ongoing: 0,
          Resolved: 0,
          Affected: 0,
          Teams: 0,
          PopulationTotal: 0,
          PopulationSeniors: 0,
          PopulationMinors: 0,
          PopulationPets: 0
        }
      });
    }
  });

  // Disaster-prone areas (monitoring collection, for selects)
  router.get('/api/disaster/areas', requireAuth, async (req, res) => {
    try {
      const { riskLevel = '' } = req.query;
      const items = await withDisaster(async (db) => {
        const col = db.collection('disaster_monitoring_areas');
        const q = {};
        if (riskLevel) q.riskLevel = riskLevel;
        return col.find(q).sort({ riskLevel: -1, area: 1 }).toArray();
      }) || [];
      res.json({ ok: true, items });
    } catch (e) {
      console.error('[disaster] areas error', e);
      res.json({ ok: false, items: [] });
    }
  });

  // ---------- incidents list + create + detail ----------
  router.get('/api/disaster/incidents', requireAuth, async (req, res) => {
    const { page, limit, status, q, from, to, sort, mine, type } = parsePaging(req);
    const me = req.session.user || {};
    const isAdmin = /^(admin)$/i.test(me?.role || '') || me?.isAdmin === true;

    const query = {};

    if (status) query.status = status;
    if (type) query.type = type;

    Object.assign(query, buildDateRangeQuery('dateTime', from, to));
    Object.assign(query, buildSearchQuery(['type', 'location', 'description'], q));

    if (!isAdmin || mine === 'true') {
      if (me.username) {
        query['reportedBy.username'] = me.username.toLowerCase();
      }
    }

    try {
      const data = await withDisaster(async (db) => {
        const col = db.collection('disaster_incidents');
        const sortSpec = { dateTime: sort === 'asc' ? 1 : -1, createdAt: sort === 'asc' ? 1 : -1 };
        const cursor = col.find(query).sort(sortSpec);
        const total = await col.countDocuments(query);
        const rows = await cursor.skip((page - 1) * limit).limit(limit).toArray();
        return { rows, total };
      });

      const totalPages = Math.max(1, Math.ceil((data.total || 0) / limit));
      res.json({
        ok: true,
        rows: data.rows || [],
        total: data.total || 0,
        page,
        limit,
        totalPages
      });
    } catch (e) {
      console.error('[disaster] incidents list error', e);
      res.status(500).json({ ok: false, message: 'Failed to load incidents.' });
    }
  });

  // Create incident (user + admin). Supports optional plan document upload + attachments.
  router.post('/api/disaster/incidents', requireAuth, (req, res) => {
    if (!upload) {
      return res.status(501).json({
        ok: false,
        message: 'File upload disabled. Please ask the administrator to install multer (npm i multer).'
      });
    }

    const handler = upload.fields([
      { name: 'planFile', maxCount: 1 },
      { name: 'attachments', maxCount: 10 }
    ]);

    handler(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ ok: false, message: err.message });
      }

      try {
        const body = req.body || {};
        const me = req.session.user || {};
        const now = new Date();

        const type = String(body.type || '').trim();
        const location = String(body.location || '').trim();
        const description = String(body.description || '').trim();
        const reporterName = String(body.reporterName || me.name || '').trim();
        const contact = String(body.contact || me.address || '').trim();
        const otherType = String(body.typeOther || '').trim();
        const hasPlan = String(body.hasPlan || '').toLowerCase() === 'yes';

        if (!type || !location || !description || !reporterName || !contact) {
          return res.status(400).json({ ok: false, message: 'Please fill all required fields.' });
        }

        let finalType = type === 'Other' || type === 'Others' ? 'Others' : type;
        if ((type === 'Other' || type === 'Others') && !otherType) {
          return res.status(400).json({ ok: false, message: 'Please specify the emergency type.' });
        }

        const incidentDateStr = body.incidentDate || body.dateTime || '';
        const dateTime = incidentDateStr ? new Date(incidentDateStr) : now;
        if (Number.isNaN(dateTime.getTime())) {
          return res.status(400).json({ ok: false, message: 'Invalid incident date/time.' });
        }

        const priorityRaw = String(body.priority || '').trim();
        const priority = INCIDENT_PRIORITIES.includes(priorityRaw) ? priorityRaw : 'Medium';

        const casualties = Number(body.casualties || 0) || 0;
        const injuries = Number(body.injuries || 0) || 0;

        const affectedCount = Number(body.affectedCount || body.peopleAffected || 0) || 0;

        // response time is usually tracked in coordination, but allow here if provided
        const responseTimeMinutes = body.responseTime ? Number(body.responseTime) || null : null;

        const status = INCIDENT_STATUSES.includes(body.status) ? body.status : 'Pending';

        const reportedBy = {
          username: (me.username || '').toLowerCase(),
          name: reporterName || me.name || '',
        };

        // attachments (plan + evidence)
        const files = req.files || {};
        const planFiles = files.planFile || [];
        const otherFiles = files.attachments || [];

        const attachments = [];
        const pushAtt = (file, kind) => {
          attachments.push({
            _id: new ObjectId(),
            kind,
            filename: file.originalname,
            url: '/uploads/' + file.filename,
            mimeType: file.mimetype,
            size: file.size,
            uploadedAt: now,
            uploadedBy: reportedBy
          });
        };

        let preparednessPlan = null;
        if (hasPlan && planFiles[0]) {
          const f = planFiles[0];
          preparednessPlan = {
            filename: f.originalname,
            url: '/uploads/' + f.filename,
            mimeType: f.mimetype,
            size: f.size,
            uploadedAt: now
          };
          pushAtt(planFiles[0], 'preparednessPlan');
        }

        otherFiles.forEach(f => pushAtt(f, 'attachment'));

        const incidentDoc = await withDisaster(async (db) => {
          const col = db.collection('disaster_incidents');
          const doc = {
            type: finalType,
            typeOther: otherType || null,
            location,
            description,
            reporterName,
            contact,
            hasPreparednessPlan: hasPlan,
            preparednessPlan,
            attachments,
            casualties,
            injuries,
            affectedCount,
            priority,
            status,
            dateTime,
            incidentDate: dateTime,
            responseTimeMinutes,
            createdAt: now,
            reportedBy
          };
          const r = await col.insertOne(doc);
          return { ...doc, _id: r.insertedId };
        });

        res.json({ ok: true, row: incidentDoc });
      } catch (e) {
        console.error('[disaster] incident create error', e);
        res.status(500).json({ ok: false, message: 'Failed to submit emergency report.' });
      }
    });
  });

  router.get('/api/disaster/incidents/:id', requireAuth, async (req, res) => {
    try {
      let _id;
      try {
        _id = new ObjectId(req.params.id);
      } catch {
        return res.status(400).json({ ok: false, message: 'Invalid incident id.' });
      }

      const row = await withDisaster(async (db) => {
        return db.collection('disaster_incidents').findOne({ _id });
      });
      if (!row) return res.status(404).json({ ok: false, message: 'Incident not found.' });
      res.json({ ok: true, row });
    } catch (e) {
      console.error('[disaster] incident detail error', e);
      res.status(500).json({ ok: false, message: 'Failed to load incident.' });
    }
  });

  // Update incident (admin only, or user can update their own)
  router.put('/api/disaster/incidents/:id', requireAuth, (req, res) => {
    if (!upload) {
      return res.status(501).json({
        ok: false,
        message: 'File upload disabled. Please ask the administrator to install multer (npm i multer).'
      });
    }

    const handler = upload.fields([
      { name: 'planFile', maxCount: 1 },
      { name: 'attachments', maxCount: 10 }
    ]);

    handler(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ ok: false, message: err.message });
      }

      try {
        let _id;
        try {
          _id = new ObjectId(req.params.id);
        } catch {
          return res.status(400).json({ ok: false, message: 'Invalid incident id.' });
        }

        const body = req.body || {};
        const me = req.session.user || {};
        const isAdmin = /^(admin)$/i.test(me?.role || '') || me?.isAdmin === true;
        const now = new Date();

        // Check if user owns this record (if not admin) and get existing record
        let existing = null;
        if (!isAdmin) {
          existing = await withDisaster(async (db) => {
            return db.collection('disaster_incidents').findOne({ _id });
          });
          if (!existing) {
            return res.status(404).json({ ok: false, message: 'Incident not found.' });
          }
          const reporterUsername = existing.reportedBy?.username || '';
          if (reporterUsername !== (me.username || '').toLowerCase()) {
            return res.status(403).json({ ok: false, message: 'You can only edit incidents that you reported.' });
          }
        } else {
          existing = await withDisaster(async (db) => {
            return db.collection('disaster_incidents').findOne({ _id });
          });
          if (!existing) {
            return res.status(404).json({ ok: false, message: 'Incident not found.' });
          }
        }

        const type = String(body.type || '').trim();
        const location = String(body.location || '').trim();
        const description = String(body.description || '').trim();
        // Preserve original values if not provided in update
        const reporterName = String(body.reporterName || existing.reporterName || me.name || '').trim();
        const contact = String(body.contact || existing.contact || me.address || '').trim();
        const otherType = String(body.typeOther || '').trim();
        const hasPlan = String(body.hasPlan || '').toLowerCase() === 'yes';

        if (!type || !location || !description || !reporterName || !contact) {
          return res.status(400).json({ ok: false, message: 'Please fill all required fields.' });
        }

        let finalType = type === 'Other' || type === 'Others' ? 'Others' : type;
        if ((type === 'Other' || type === 'Others') && !otherType) {
          return res.status(400).json({ ok: false, message: 'Please specify the emergency type.' });
        }

        const incidentDateStr = body.incidentDate || body.dateTime || '';
        const dateTime = incidentDateStr ? new Date(incidentDateStr) : now;
        if (Number.isNaN(dateTime.getTime())) {
          return res.status(400).json({ ok: false, message: 'Invalid incident date/time.' });
        }

        const priorityRaw = String(body.priority || '').trim();
        const priority = INCIDENT_PRIORITIES.includes(priorityRaw) ? priorityRaw : 'Medium';

        const casualties = Number(body.casualties || 0) || 0;
        const injuries = Number(body.injuries || 0) || 0;
        const affectedCount = Number(body.affectedCount || body.peopleAffected || 0) || 0;
        const responseTimeMinutes = body.responseTime ? Number(body.responseTime) || null : null;
        const status = INCIDENT_STATUSES.includes(body.status) ? body.status : 'Pending';

        // Handle file uploads
        const files = req.files || {};
        const planFiles = files.planFile || [];
        const otherFiles = files.attachments || [];

        const attachments = [];
        const pushAtt = (file, kind) => {
          attachments.push({
            _id: new ObjectId(),
            kind,
            filename: file.originalname,
            url: '/uploads/' + file.filename,
            mimeType: file.mimetype,
            size: file.size,
            uploadedAt: now,
            uploadedBy: {
              username: (me.username || '').toLowerCase(),
              name: me.name || ''
            }
          });
        };

        let preparednessPlan = null;
        if (hasPlan && planFiles[0]) {
          const f = planFiles[0];
          preparednessPlan = {
            filename: f.originalname,
            url: '/uploads/' + f.filename,
            mimeType: f.mimetype,
            size: f.size,
            uploadedAt: now
          };
          pushAtt(planFiles[0], 'preparednessPlan');
        }

        otherFiles.forEach(f => pushAtt(f, 'attachment'));

        const updateDoc = {
          type: finalType,
          typeOther: otherType || null,
          location,
          description,
          reporterName,
          contact,
          hasPreparednessPlan: hasPlan,
          casualties,
          injuries,
          affectedCount,
          priority,
          status,
          dateTime,
          incidentDate: dateTime,
          responseTimeMinutes,
          updatedAt: now
        };

        // Only update attachments if new files were uploaded
        if (attachments.length > 0) {
          const existingAttachments = existing?.attachments || [];
          updateDoc.attachments = [...existingAttachments, ...attachments];
        }

        // Only update preparedness plan if new file was uploaded
        if (preparednessPlan) {
          updateDoc.preparednessPlan = preparednessPlan;
        }

        const updatedDoc = await withDisaster(async (db) => {
          const col = db.collection('disaster_incidents');
          await col.updateOne({ _id }, { $set: updateDoc });
          return col.findOne({ _id });
        });

        res.json({ ok: true, row: updatedDoc });
      } catch (e) {
        console.error('[disaster] incident update error', e);
        res.status(500).json({ ok: false, message: 'Failed to update incident.' });
      }
    });
  });

  // Delete incident (admin only, or user can delete their own)
  router.delete('/api/disaster/incidents/:id', requireAuth, async (req, res) => {
    try {
      let _id;
      try {
        _id = new ObjectId(req.params.id);
      } catch {
        return res.status(400).json({ ok: false, message: 'Invalid incident id.' });
      }

      const me = req.session.user || {};
      const isAdmin = /^(admin)$/i.test(me?.role || '') || me?.isAdmin === true;

      // Check if user owns this record (if not admin)
      if (!isAdmin) {
        const existing = await withDisaster(async (db) => {
          return db.collection('disaster_incidents').findOne({ _id });
        });
        if (!existing) {
          return res.status(404).json({ ok: false, message: 'Incident not found.' });
        }
        const reporterUsername = existing.reportedBy?.username || '';
        if (reporterUsername !== (me.username || '').toLowerCase()) {
          return res.status(403).json({ ok: false, message: 'You can only delete incidents that you reported.' });
        }
      }

      const result = await withDisaster(async (db) => {
        const col = db.collection('disaster_incidents');
        const deleteResult = await col.deleteOne({ _id });
        return deleteResult.deletedCount > 0;
      });

      if (result) {
        res.json({ ok: true, message: 'Incident deleted successfully.' });
      } else {
        res.status(404).json({ ok: false, message: 'Incident not found.' });
      }
    } catch (e) {
      console.error('[disaster] incident delete error', e);
      res.status(500).json({ ok: false, message: 'Failed to delete incident.' });
    }
  });

  // Printable view / document generator for incidents + attachments
  router.get('/disaster/incidents/:id/print', requireAuth, async (req, res) => {
    try {
      let _id;
      try {
        _id = new ObjectId(req.params.id);
      } catch {
        return res.status(400).send('Invalid incident id.');
      }

      const row = await withDisaster(async (db) =>
        db.collection('disaster_incidents').findOne({ _id })
      );
      if (!row) return res.status(404).send('Incident not found.');

      const fmt = (d) => d ? new Date(d).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : '';
      const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }) : '';

      const attachmentsHtml = Array.isArray(row.attachments) && row.attachments.length
        ? row.attachments.map(a => `
          <li>
            <strong>${a.kind || 'Attachment'}:</strong>
            <a href="${a.url}" target="_blank">${a.filename}</a>
            ${a.uploadedAt ? ` <span style="color:#7f8c8d;">(${fmtDate(a.uploadedAt)})</span>` : ''}
          </li>
        `).join('')
        : '<li>No attachments uploaded.</li>';

      const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Emergency Incident Report</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; background:#fff; color:#222; }
      h1 { text-align: center; margin-bottom: 4px; }
      h2 { margin-top: 28px; margin-bottom: 8px; }
      .subtitle { text-align:center; color:#7f8c8d; margin-bottom:24px; }
      .grid { display:grid; grid-template-columns: 180px 1fr; gap:6px 16px; font-size:14px; }
      .label { font-weight:bold; color:#7f8c8d; }
      .value { color:#2c3e50; }
      ul { padding-left:18px; }
      .badge { display:inline-block; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:bold; }
      .badge-critical { background:#fdecea; color:#c0392b; }
      .badge-ongoing { background:#eaf4ff; color:#1b73c7; }
      .badge-resolved { background:#e9f9ef; color:#239b56; }
      .badge-pending { background:#fff4e5; color:#b9770e; }
      @media print {
        button { display:none; }
        body { padding: 20px; }
      }
    </style>
  </head>
  <body>
    <button onclick="window.print()">Print</button>
    <h1>Emergency & Disaster Incident Report</h1>
    <div class="subtitle">Barangay Langkaan II</div>

    <h2>Incident Details</h2>
    <div class="grid">
      <div class="label">Type of Emergency</div>
      <div class="value">${row.type}${row.type === 'Others' && row.typeOther ? ' - ' + row.typeOther : ''}</div>
      <div class="label">Location</div>
      <div class="value">${row.location || ''}</div>
      <div class="label">Date & Time</div>
      <div class="value">${fmt(row.dateTime || row.incidentDate)}</div>
      <div class="label">Status</div>
      <div class="value">
        <span class="badge badge-${(row.priority === 'Critical') ? 'critical' : (row.status || 'Pending').toLowerCase()}">
          ${row.status || 'Pending'}
        </span>
      </div>
      <div class="label">Priority Level</div>
      <div class="value">${row.priority || 'Medium'}</div>
      <div class="label">People Affected</div>
      <div class="value">${row.affectedCount ?? ''}</div>
      <div class="label">Casualties</div>
      <div class="value">${row.casualties ?? 0}</div>
      <div class="label">Injured</div>
      <div class="value">${row.injuries ?? 0}</div>
      <div class="label">Response Time (minutes)</div>
      <div class="value">${row.responseTimeMinutes ?? '-'}</div>
    </div>

    <h2>Reporter Information</h2>
    <div class="grid">
      <div class="label">Reported By</div>
      <div class="value">${row.reporterName || row.reportedBy?.name || row.reportedBy?.username || ''}</div>
      <div class="label">Contact</div>
      <div class="value">${row.contact || ''}</div>
      <div class="label">System User</div>
      <div class="value">${row.reportedBy?.username || ''}</div>
    </div>

    <h2>Description</h2>
    <p style="white-space:pre-wrap; font-size:14px;">${row.description || ''}</p>

    <h2>Preparedness Plan</h2>
    <div class="grid">
      <div class="label">Has Plan</div>
      <div class="value">${row.hasPreparednessPlan ? 'Yes' : 'No'}</div>
      <div class="label">Plan Document</div>
      <div class="value">
        ${row.preparednessPlan && row.preparednessPlan.url
          ? `<a href="${row.preparednessPlan.url}" target="_blank">${row.preparednessPlan.filename || 'Download Plan'}</a>`
          : 'No document uploaded.'}
      </div>
    </div>

    <h2>Attachments</h2>
    <ul>
      ${attachmentsHtml}
    </ul>

    <p style="margin-top:40px; font-size:12px; color:#7f8c8d; text-align:center;">
      Generated on ${fmt(new Date())} · Barangay Langkaan II Web Management System
    </p>
  </body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e) {
      console.error('[disaster] incident print error', e);
      res.status(500).send('Failed to generate document.');
    }
  });

  // ---------- coordination ----------
  router.get('/api/disaster/coordination', requireAuth, requireAdmin, async (req, res) => {
    const { page, limit, status, q, from, to, sort } = parsePaging(req);
    const query = {};
    if (status) query.status = status;
    Object.assign(query, buildDateRangeQuery('coordinationDate', from, to));
    Object.assign(query, buildSearchQuery(['agency', 'actionTaken', 'resourcesDeployed', 'contactPerson'], q));

    try {
      const data = await withDisaster(async (db) => {
        const col = db.collection('disaster_coordination');
        const sortSpec = { coordinationDate: sort === 'asc' ? 1 : -1, createdAt: sort === 'asc' ? 1 : -1 };
        const cursor = col.find(query).sort(sortSpec);
        const total = await col.countDocuments(query);
        const rows = await cursor.skip((page - 1) * limit).limit(limit).toArray();
        return { rows, total };
      });

      const totalPages = Math.max(1, Math.ceil((data.total || 0) / limit));
      res.json({ ok: true, rows: data.rows || [], total: data.total || 0, page, limit, totalPages });
    } catch (e) {
      console.error('[disaster] coordination list error', e);
      res.status(500).json({ ok: false, message: 'Failed to load coordination records.' });
    }
  });

  router.post('/api/disaster/coordination', requireAuth, requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const {
        coordinationDate = '',
        agency = '',
        contactPerson = '',
        contactNumber = '',
        actionTaken = '',
        resourcesDeployed = '',
        responseTime = '',
        status = 'Ongoing',
        notes = ''
      } = b;

      if (!coordinationDate || !agency || !contactPerson || !contactNumber || !actionTaken || !resourcesDeployed) {
        return res.status(400).json({ ok: false, message: 'Please fill all required fields.' });
      }

      const dt = new Date(coordinationDate);
      if (Number.isNaN(dt.getTime())) {
        return res.status(400).json({ ok: false, message: 'Invalid coordination date.' });
      }

      const me = req.session.user || {};
      const now = new Date();
      const doc = {
        coordinationDate: dt,
        agency: String(agency).trim(),
        contactPerson: String(contactPerson).trim(),
        contactNumber: String(contactNumber).trim(),
        actionTaken: String(actionTaken).trim(),
        resourcesDeployed: String(resourcesDeployed).trim(),
        responseTimeMinutes: responseTime ? Number(responseTime) || null : null,
        status: String(status || 'Ongoing'),
        notes: String(notes || '').trim(),
        createdAt: now,
        createdBy: {
          username: (me.username || '').toLowerCase(),
          name: me.name || ''
        }
      };

      await withDisaster(async (db) => {
        await db.collection('disaster_coordination').insertOne(doc);
      });
      res.json({ ok: true, row: doc });
    } catch (e) {
      console.error('[disaster] coordination create error', e);
      res.status(500).json({ ok: false, message: 'Failed to save coordination record.' });
    }
  });

  // ---------- monitoring (areas) ----------
  router.get('/api/disaster/monitoring', requireAuth, requireAdmin, async (req, res) => {
    const { page, limit, status, q, sort } = parsePaging(req);
    const query = {};
    if (status) query.status = status;
    Object.assign(query, buildSearchQuery(['area', 'riskLevel', 'vulnerabilities', 'notes'], q));

    try {
      const data = await withDisaster(async (db) => {
        const col = db.collection('disaster_monitoring_areas');
        const sortSpec = { riskLevel: -1, area: 1 };
        const cursor = col.find(query).sort(sortSpec);
        const total = await col.countDocuments(query);
        const rows = await cursor.skip((page - 1) * limit).limit(limit).toArray();
        return { rows, total };
      });

      const totalPages = Math.max(1, Math.ceil((data.total || 0) / limit));
      res.json({ ok: true, rows: data.rows || [], total: data.total || 0, page, limit, totalPages });
    } catch (e) {
      console.error('[disaster] monitoring list error', e);
      res.status(500).json({ ok: false, message: 'Failed to load monitoring records.' });
    }
  });

  router.post('/api/disaster/monitoring', requireAuth, requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const {
        area = '',
        riskLevel = '',
        population = '',
        lastAssessed = '',
        vulnerabilities = '',
        mitigationMeasures = '',
        evacuationSite = '',
        status = 'Monitoring',
        notes = ''
      } = b;

      if (!area || !riskLevel || !population || !lastAssessed || !vulnerabilities) {
        return res.status(400).json({ ok: false, message: 'Please fill all required fields.' });
      }

      const dt = new Date(lastAssessed);
      if (Number.isNaN(dt.getTime())) {
        return res.status(400).json({ ok: false, message: 'Invalid assessment date.' });
      }

      const me = req.session.user || {};
      const now = new Date();
      const doc = {
        area: String(area).trim(),
        riskLevel: String(riskLevel).trim(),
        population: Number(population) || 0,
        lastAssessed: dt,
        vulnerabilities: String(vulnerabilities).trim(),
        mitigationMeasures: String(mitigationMeasures || '').trim(),
        evacuationSite: String(evacuationSite || '').trim(),
        status: String(status || 'Monitoring'),
        notes: String(notes || '').trim(),
        createdAt: now,
        createdBy: {
          username: (me.username || '').toLowerCase(),
          name: me.name || ''
        }
      };

      await withDisaster(async (db) => {
        await db.collection('disaster_monitoring_areas').insertOne(doc);
      });
      res.json({ ok: true, row: doc });
    } catch (e) {
      console.error('[disaster] monitoring create error', e);
      res.status(500).json({ ok: false, message: 'Failed to save monitoring record.' });
    }
  });

  // ---------- preparedness plans ----------
  router.get('/api/disaster/preparedness', requireAuth, requireAdmin, async (req, res) => {
    const { page, limit, status, q, from, to, sort } = parsePaging(req);
    const query = {};
    if (status) query.status = status;
    Object.assign(query, buildDateRangeQuery('lastUpdated', from, to));
    Object.assign(query, buildSearchQuery(['planName', 'disasterType', 'coordinator', 'objectives'], q));

    try {
      const data = await withDisaster(async (db) => {
        const col = db.collection('disaster_preparedness_plans');
        const sortSpec = { lastUpdated: sort === 'asc' ? 1 : -1, createdAt: sort === 'asc' ? 1 : -1 };
        const cursor = col.find(query).sort(sortSpec);
        const total = await col.countDocuments(query);
        const rows = await cursor.skip((page - 1) * limit).limit(limit).toArray();
        return { rows, total };
      });

      const totalPages = Math.max(1, Math.ceil((data.total || 0) / limit));
      res.json({ ok: true, rows: data.rows || [], total: data.total || 0, page, limit, totalPages });
    } catch (e) {
      console.error('[disaster] preparedness list error', e);
      res.status(500).json({ ok: false, message: 'Failed to load preparedness plans.' });
    }
  });

  router.post('/api/disaster/preparedness', requireAuth, requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const {
        planName = '',
        disasterType = '',
        lastUpdated = '',
        coordinator = '',
        contactNumber = '',
        drillSchedule = '',
        nextDrill = '',
        status = 'Active',
        objectives = '',
        keyActions = ''
      } = b;

      if (!planName || !disasterType || !lastUpdated || !coordinator || !contactNumber || !drillSchedule) {
        return res.status(400).json({ ok: false, message: 'Please fill all required fields.' });
      }

      const lastUpdatedDate = new Date(lastUpdated);
      if (Number.isNaN(lastUpdatedDate.getTime())) {
        return res.status(400).json({ ok: false, message: 'Invalid last updated date.' });
      }
      let nextDrillDate = null;
      if (nextDrill) {
        const nd = new Date(nextDrill);
        if (Number.isNaN(nd.getTime())) {
          return res.status(400).json({ ok: false, message: 'Invalid next drill date.' });
        }
        nextDrillDate = nd;
      }

      const me = req.session.user || {};
      const now = new Date();
      const doc = {
        planName: String(planName).trim(),
        disasterType: String(disasterType).trim(),
        lastUpdated: lastUpdatedDate,
        coordinator: String(coordinator).trim(),
        contactNumber: String(contactNumber).trim(),
        drillSchedule: String(drillSchedule).trim(),
        nextDrill: nextDrillDate,
        status: String(status || 'Active'),
        objectives: String(objectives || '').trim(),
        keyActions: String(keyActions || '').trim(),
        createdAt: now,
        createdBy: {
          username: (me.username || '').toLowerCase(),
          name: me.name || ''
        }
      };

      await withDisaster(async (db) => {
        await db.collection('disaster_preparedness_plans').insertOne(doc);
      });
      res.json({ ok: true, row: doc });
    } catch (e) {
      console.error('[disaster] preparedness create error', e);
      res.status(500).json({ ok: false, message: 'Failed to save preparedness plan.' });
    }
  });

  // ---------- emergency contacts (admin + public variants) ----------
  router.get('/api/disaster/contacts', requireAuth, async (req, res) => {
    try {
      const items = await withDisaster(async (db) => {
        const col = db.collection('disaster_contacts');
        return col.find({ status: 'Active' }).sort({ type: 1, agency: 1 }).toArray();
      }) || [];
      res.json({ ok: true, items });
    } catch (e) {
      console.error('[disaster] contacts list error', e);
      res.status(500).json({ ok: false, message: 'Failed to load contacts.' });
    }
  });

  router.post('/api/disaster/contacts', requireAuth, requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const {
        agency = '',
        contactPerson = '',
        position = '',
        phone = '',
        email = '',
        type = '',
        address = '',
        availableHours = '',
        status = 'Active',
        notes = ''
      } = b;

      if (!agency || !contactPerson || !phone || !type) {
        return res.status(400).json({ ok: false, message: 'Please fill all required fields.' });
      }

      const me = req.session.user || {};
      const now = new Date();
      const doc = {
        agency: String(agency).trim(),
        contactPerson: String(contactPerson).trim(),
        position: String(position || '').trim(),
        phone: String(phone).trim(),
        email: String(email || '').trim(),
        type: String(type).trim(),
        address: String(address || '').trim(),
        availableHours: String(availableHours || '').trim(),
        status: String(status || 'Active'),
        notes: String(notes || '').trim(),
        createdAt: now,
        createdBy: {
          username: (me.username || '').toLowerCase(),
          name: me.name || ''
        }
      };

      await withDisaster(async (db) => {
        await db.collection('disaster_contacts').insertOne(doc);
      });
      res.json({ ok: true, row: doc });
    } catch (e) {
      console.error('[disaster] contact create error', e);
      res.status(500).json({ ok: false, message: 'Failed to save contact.' });
    }
  });

  // ---------- resources ----------
  router.get('/api/disaster/resources', requireAuth, requireAdmin, async (req, res) => {
    const { page, limit, status, q } = parsePaging(req);
    const query = {};
    if (status) query.status = status;
    Object.assign(query, buildSearchQuery(['itemName', 'category', 'location', 'condition'], q));

    try {
      const data = await withDisaster(async (db) => {
        const col = db.collection('disaster_resources');
        const sortSpec = { itemName: 1 };
        const cursor = col.find(query).sort(sortSpec);
        const total = await col.countDocuments(query);
        const rows = await cursor.skip((page - 1) * limit).limit(limit).toArray();
        return { rows, total };
      });

      const totalPages = Math.max(1, Math.ceil((data.total || 0) / limit));
      res.json({ ok: true, rows: data.rows || [], total: data.total || 0, page, limit, totalPages });
    } catch (e) {
      console.error('[disaster] resources list error', e);
      res.status(500).json({ ok: false, message: 'Failed to load resources.' });
    }
  });

  router.post('/api/disaster/resources', requireAuth, requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const {
        itemName = '',
        category = '',
        quantity = '',
        unit = '',
        location = '',
        condition = '',
        status = 'Available',
        serialNumber = '',
        lastMaintenance = '',
        acquisitionDate = '',
        cost = '',
        description = ''
      } = b;

      if (!itemName || !category || !quantity || !location || !condition) {
        return res.status(400).json({ ok: false, message: 'Please fill all required fields.' });
      }

      const qty = Number(quantity) || 0;
      const costNum = cost ? Number(cost) || 0 : 0;

      let lastMaintDate = null;
      if (lastMaintenance) {
        const d = new Date(lastMaintenance);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ ok: false, message: 'Invalid last maintenance date.' });
        }
        lastMaintDate = d;
      }

      let acqDate = null;
      if (acquisitionDate) {
        const d = new Date(acquisitionDate);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ ok: false, message: 'Invalid acquisition date.' });
        }
        acqDate = d;
      }

      const me = req.session.user || {};
      const now = new Date();
      const doc = {
        itemName: String(itemName).trim(),
        category: String(category).trim(),
        quantity: qty,
        unit: String(unit || '').trim(),
        location: String(location).trim(),
        condition: String(condition).trim(),
        status: String(status || 'Available'),
        serialNumber: String(serialNumber || '').trim(),
        lastMaintenance: lastMaintDate,
        acquisitionDate: acqDate,
        cost: costNum,
        description: String(description || '').trim(),
        createdAt: now,
        createdBy: {
          username: (me.username || '').toLowerCase(),
          name: me.name || ''
        }
      };

      await withDisaster(async (db) => {
        await db.collection('disaster_resources').insertOne(doc);
      });
      res.json({ ok: true, row: doc });
    } catch (e) {
      console.error('[disaster] resources create error', e);
      res.status(500).json({ ok: false, message: 'Failed to save resource.' });
    }
  });

  // ---------- alerts & announcements for residents ----------
  router.get('/api/disaster/alerts', requireAuth, async (req, res) => {
    try {
      const items = await withDisaster(async (db) => {
        const col = db.collection('disaster_alerts');
        return col.find({ active: true }).sort({ createdAt: -1 }).limit(5).toArray();
      }) || [];
      res.json({ ok: true, items });
    } catch (e) {
      console.error('[disaster] alerts list error', e);
      res.status(500).json({ ok: false, message: 'Failed to load alerts.' });
    }
  });

  router.get('/api/disaster/announcements', requireAuth, async (req, res) => {
    try {
      const items = await withDisaster(async (db) => {
        const col = db.collection('disaster_announcements');
        return col.find({}).sort({ createdAt: -1 }).limit(20).toArray();
      }) || [];
      res.json({ ok: true, items });
    } catch (e) {
      console.error('[disaster] announcements list error', e);
      res.status(500).json({ ok: false, message: 'Failed to load announcements.' });
    }
  });

  return router;
};


